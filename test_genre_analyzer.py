from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from genre_analyzer import GenreStore, summarize_genres
from fastapi.testclient import TestClient
from api import app


class GenreTests(unittest.TestCase):
    def test_cache_and_expiry(self):
        with tempfile.TemporaryDirectory() as directory:
            store = GenreStore(Path(directory) / 'cache.sqlite3')
            with patch('genre_analyzer.fetch_genres', return_value=['액션']) as fetch:
                self.assertEqual(store.get(10)['status'], 'fetched')
                self.assertEqual(store.get(10)['status'], 'cached')
                self.assertEqual(fetch.call_count, 1)
                with patch('genre_analyzer.time.time', return_value=9999999999):
                    self.assertEqual(store.get(10)['status'], 'fetched')

    def test_failure_is_retried(self):
        with tempfile.TemporaryDirectory() as directory:
            store = GenreStore(Path(directory) / 'cache.sqlite3')
            with patch('genre_analyzer.fetch_genres', side_effect=[OSError(), ['RPG']]):
                self.assertEqual(store.get(10)['status'], 'unavailable')
                self.assertEqual(store.get(10)['genres'], ['RPG'])

    def test_weighted_time_and_unknown(self):
        rows = summarize_genres([{'appid': 1, 'playtime_forever': 120}, {'appid': 2, 'playtime_forever': 60}], [{'appid': 1, 'genres': ['액션', 'RPG', 'RPG']}])
        self.assertEqual(sum(row['playtime_minutes'] for row in rows), 180)
        self.assertEqual({row['genre']: row['playtime_minutes'] for row in rows}, {'액션': 60, 'RPG': 60, '미분류': 60})

    def test_api_batch_and_validation(self):
        client = TestClient(app)
        with patch('api.GenreStore.batch', return_value=[{'appid': 10, 'genres': ['액션'], 'status': 'cached'}]):
            self.assertEqual(client.post('/api/genres', json={'appids': [10]}).json()['games'][0]['genres'], ['액션'])
        for appids in ([], list(range(21))):
            self.assertEqual(client.post('/api/genres', json={'appids': appids}).status_code, 422)
        self.assertEqual(client.post('/api/genres', json={'appids': [-1]}).status_code, 400)
