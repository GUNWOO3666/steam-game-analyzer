"""Search the public Steam storefront."""
import json
from urllib.parse import urlencode
from urllib.request import urlopen


def search_games(term: str) -> list[dict]:
    query = urlencode({'term': term, 'l': 'koreana', 'cc': 'KR'})
    with urlopen(f'https://store.steampowered.com/api/storesearch/?{query}', timeout=8) as response:
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
