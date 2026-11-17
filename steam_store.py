"""Search the public Steam storefront."""
import json
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
from threading import Lock
import time
from urllib.parse import urlencode

from genre_analyzer import fetch_store_details
from store_http import open_store

_price_slots = ThreadPoolExecutor(max_workers=2)
_price_lock = Lock()
_next_price_request = 0.0


@lru_cache(maxsize=4096)
def _price_jeon(appid: int, _cache_hour: int) -> int | None:
    global _next_price_request
    with _price_lock:
        time.sleep(max(0, _next_price_request - time.monotonic()))
        _next_price_request = time.monotonic() + 0.5
    details = fetch_store_details(appid, cc='kr')
    if not isinstance(details, dict) or details.get('release_date', {}).get('coming_soon'):
        return None
    if details.get('is_free') is True:
        return 0
    price = details.get('price_overview')
    if not isinstance(price, dict) or price.get('currency') != 'KRW':
        return None
    final = price.get('final')
    return final if type(final) is int and final >= 0 else None


def library_prices(appids: list[int]) -> dict:
    cache_hour = int(time.time() // 3600)

    def lookup(appid: int) -> int | None:
        try:
            return _price_jeon(appid, cache_hour)
        except (OSError, ValueError, AttributeError, TypeError):
            return None

    prices = [price for price in _price_slots.map(lookup, dict.fromkeys(appids)) if price is not None]
    return {'total_jeon': sum(prices), 'priced_count': len(prices)}


def search_games(term: str) -> list[dict]:
    query = urlencode({'term': term, 'l': 'koreana', 'cc': 'KR'})
    with open_store(f'https://store.steampowered.com/api/storesearch/?{query}', timeout=8) as response:
        payload = json.load(response)
    items = payload.get('items') if isinstance(payload, dict) else None
    if not isinstance(items, list):
        raise ValueError('Invalid Steam search response')
    return [
        {'appid': item['id'], 'name': item['name']}
        for item in items
        if isinstance(item, dict) and item.get('type') == 'app'
        and type(item.get('id')) is int and item['id'] > 0
        and isinstance(item.get('name'), str) and item['name'].strip()
    ][:12]
