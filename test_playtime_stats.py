import unittest
from unittest.mock import patch

from playtime_stats import _review_stats


class ReviewPlaytimeTests(unittest.TestCase):
    def test_even_sample_ignores_duplicate_authors_and_missing_playtime(self):
        pages = [
            {'reviews': [{'author': {'steamid': '1', 'playtime_forever': 299}},
                         {'author': {'steamid': '2', 'playtime_forever': 300}}], 'cursor': 'next'},
            {'reviews': [{'author': {'steamid': '2', 'playtime_forever': 300}},
                         {'author': {'steamid': '3'}}], 'cursor': 'next'},
        ]
        with patch('playtime_stats._review_page', side_effect=pages) as fetch:
            self.assertEqual(_review_stats(1, 0), {
                'sample_size': 2, 'median_minutes': 299.5,
            })
        self.assertEqual(fetch.call_count, 2)

    def test_empty_sample_has_no_median(self):
        with patch('playtime_stats._review_page', return_value={}):
            result = _review_stats(2, 0)
        self.assertEqual(result['sample_size'], 0)
        self.assertIsNone(result['median_minutes'])

    def test_odd_sample_uses_middle_playtime(self):
        reviews = [{'author': {'steamid': str(index), 'playtime_forever': value}}
                   for index, value in enumerate([9000, 0, 45])]
        with patch('playtime_stats._review_page', return_value={'reviews': reviews}):
            self.assertEqual(_review_stats(3, 0), {'sample_size': 3, 'median_minutes': 45})
