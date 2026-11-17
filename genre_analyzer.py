"""Steam 상점 장르 조회 및 SQLite 캐시. 상점 API는 응답이 바뀔 수 있습니다."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from functools import lru_cache
from html.parser import HTMLParser
import json
from pathlib import Path
import sqlite3
import time
from urllib.parse import urlencode, urlparse
from store_http import StoreUnavailable, open_store

CACHE_PATH = Path(__file__).resolve().parent / 'data' / 'genres.sqlite3'


def fetch_store_details(appid: int, **params) -> dict:
    url = 'https://store.steampowered.com/api/appdetails?' + urlencode({'appids': appid, **params})
    with open_store(url, timeout=8) as response:
        item = json.load(response).get(str(appid), {})
    if not item.get('success'):
        raise ValueError('상점 정보 없음')
    return item.get('data', {})


def fetch_genres(appid: int) -> list[str]:
    genres = fetch_store_details(appid, l='koreana', filters='genres').get('genres', [])
    return sorted({genre['description'] for genre in genres if isinstance(genre.get('description'), str) and genre['description'].strip()})


def _banner_url(url: str | None, appid: int) -> str | None:
    if not isinstance(url, str):
        return None
    parsed = urlparse(url)
    if (parsed.scheme == 'https' and parsed.hostname and parsed.hostname.endswith('.steamstatic.com')
            and f'/apps/{appid}/' in parsed.path):
        return url
    return None


class StoreBannerParser(HTMLParser):
    def __init__(self, appid: int):
        super().__init__()
        self.appid = appid
        self.banner = None
        self.capsule = None

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == 'img' and 'game_header_image_full' in (attributes.get('class') or '').split():
            self.banner = _banner_url(attributes.get('src'), self.appid)
        elif tag == 'meta' and attributes.get('property') == 'og:image':
            self.capsule = _banner_url(attributes.get('content'), self.appid)


@lru_cache(maxsize=4096)
def _fetch_banner(appid: int, _cache_hour: int) -> str | None:
    try:
        parser = StoreBannerParser(appid)
        with open_store(f'https://store.steampowered.com/app/{appid}/?l=koreana&cc=kr', timeout=4) as response:
            parser.feed(response.read(1024 * 1024).decode('utf-8', errors='replace'))
        parser.close()
        if parser.banner or parser.capsule:
            return parser.banner or parser.capsule
    except StoreUnavailable:
        raise
    except (OSError, ValueError):
        pass
    return _banner_url(fetch_store_details(appid).get('header_image'), appid)


def fetch_banner(appid: int) -> str | None:
    return _fetch_banner(appid, int(time.time() // 3600))


class GenreStore:
    def __init__(self, path: Path = CACHE_PATH):
        self.path = path

    def get(self, appid: int) -> dict:
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            with closing(sqlite3.connect(self.path, timeout=10)) as db:
                db.execute('CREATE TABLE IF NOT EXISTS genres (appid INTEGER PRIMARY KEY, names TEXT NOT NULL, expires REAL NOT NULL)')
                db.commit()
                row = db.execute('SELECT names, expires FROM genres WHERE appid=?', (appid,)).fetchone()
            if row and row[1] > time.time():
                return {'appid': appid, 'genres': json.loads(row[0]), 'status': 'cached'}
        except (OSError, sqlite3.Error, ValueError):
            pass
        try:
            names = fetch_genres(appid)
        except (OSError, ValueError, TypeError, AttributeError, KeyError):
            return {'appid': appid, 'genres': [], 'status': 'unavailable'}
        try:
            with closing(sqlite3.connect(self.path, timeout=10)) as db:
                db.execute('INSERT OR REPLACE INTO genres VALUES (?, ?, ?)', (appid, json.dumps(names, ensure_ascii=False), time.time() + 7 * 86400))
                db.commit()
        except sqlite3.Error:
            pass
        return {'appid': appid, 'genres': names, 'status': 'fetched'}

    def batch(self, appids: list[int]) -> list[dict]:
        # 한 요청당 동시 연결을 두 개로 제한합니다.
        with ThreadPoolExecutor(max_workers=2) as pool:
            return list(pool.map(self.get, dict.fromkeys(appids)))


def summarize_genres(games: list[dict], metadata: list[dict]) -> list[dict]:
    lookup = {item['appid']: item['genres'] for item in metadata}
    totals = {}
    for game in games:
        names = sorted(set(lookup.get(game['appid'], []))) or ['미분류']
        share = game.get('playtime_forever', 0) / len(names)
        for name in names:
            row = totals.setdefault(name, {'genre': name, 'game_count': 0, 'playtime_minutes': 0})
            row['game_count'] += 1
            row['playtime_minutes'] += share
    return sorted(totals.values(), key=lambda row: (-row['playtime_minutes'], row['genre']))
