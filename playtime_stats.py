"""Median lifetime playtime for a sample of recent public Steam reviews."""
from functools import lru_cache
import json
from statistics import median
from threading import Lock
import time
from urllib.parse import urlencode
from urllib.request import urlopen

_request_lock = Lock()
_next_request_at = 0.0
PAGE_SIZE = 100
MAX_PAGES = 5


def _review_page(appid: int, cursor: str) -> dict:
    global _next_request_at
    params = {'appid': appid, 'cursor': cursor, 'filter': 1, 'languages': ['all'],
              'purchase_type': 1, 'num_per_page': PAGE_SIZE}
    query = urlencode({'input_json': json.dumps(params)})
    url = f'https://api.steampowered.com/IUserReviewsService/GetAppReviews/v1/?{query}'
    with _request_lock:
        time.sleep(max(0, _next_request_at - time.monotonic()))
        _next_request_at = time.monotonic() + 1.05
        with urlopen(url, timeout=6) as response:
            result = json.load(response)
    payload = result.get('response') if isinstance(result, dict) else None
    if not isinstance(payload, dict) or not isinstance(payload.get('reviews', []), list):
        raise ValueError('Invalid Steam review response')
    return payload


@lru_cache(maxsize=4096)
def _review_stats(appid: int, _cache_day: int) -> dict:
    cursor = '*'
    seen_cursors = {cursor}
    playtimes = {}
    for _ in range(MAX_PAGES):
        page = _review_page(appid, cursor)
        for review in page.get('reviews', [])[:PAGE_SIZE]:
            author = review.get('author') if isinstance(review, dict) else None
            if not isinstance(author, dict):
                continue
            author_id = author.get('steamid')
            minutes = author.get('playtime_forever')
            if type(minutes) is not int or minutes < 0 or not isinstance(author_id, (str, int)):
                continue
            author_id = str(author_id)
            playtimes.setdefault(author_id, minutes)
        cursor = page.get('cursor')
        if not page.get('reviews') or not isinstance(cursor, str) or not cursor or cursor in seen_cursors:
            break
        seen_cursors.add(cursor)

    return {
        'sample_size': len(playtimes),
        'median_minutes': median(playtimes.values()) if playtimes else None,
    }


def review_playtime(appid: int) -> dict:
    return _review_stats(appid, int(time.time() // 86400))
