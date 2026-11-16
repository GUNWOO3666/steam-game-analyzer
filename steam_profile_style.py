"""Read cosmetic items shown in Steam's public mini profile."""
from html.parser import HTMLParser
import re
from urllib.parse import urlsplit
from urllib.request import urlopen

STEAM_ID_BASE = 76561197960265728


def _asset_url(value: str) -> str | None:
    url = urlsplit(value)
    if url.scheme == 'https' and url.hostname and url.hostname.endswith('.steamstatic.com'):
        return value
    return None


class MiniProfileParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.banner_image = None
        self.banner_video = None
        self.badge_image = None
        self.badge_name = None
        self._nameplate_video = False
        self._reading_badge_name = False

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        classes = (attributes.get('class') or '').split()
        if tag == 'video':
            self._nameplate_video = 'miniprofile_nameplate' in classes
            if self._nameplate_video:
                self.banner_image = _asset_url(attributes.get('poster') or '')
                self.banner_video = _asset_url(attributes.get('src') or '')
        elif tag == 'source' and self._nameplate_video and not self.banner_video:
            self.banner_video = _asset_url(attributes.get('src') or '')
        elif 'miniprofile_background' in classes or 'miniprofile_nameplate' in classes:
            style = attributes.get('style') or ''
            match = re.search(r'''url\(\s*['"]?([^'"\s)]+)''', style)
            image = attributes.get('src') if tag == 'img' else match[1] if match else None
            if image:
                self.banner_image = _asset_url(image)
        elif tag == 'img' and 'badge_icon' in classes and not self.badge_image:
            self.badge_image = _asset_url(attributes.get('src') or '')
        elif tag == 'div' and 'name' in classes and self.badge_image and self.badge_name is None:
            self._reading_badge_name = True
            self.badge_name = ''

    def handle_endtag(self, tag):
        if tag == 'video':
            self._nameplate_video = False
        elif tag == 'div':
            self._reading_badge_name = False

    def handle_data(self, data):
        if self._reading_badge_name:
            self.badge_name += data


def fetch_mini_profile(steamid: str) -> dict:
    account_id = int(steamid) - STEAM_ID_BASE
    if not 0 < account_id <= 4294967295:
        raise ValueError('Invalid Steam account ID')
    parser = MiniProfileParser()
    with urlopen(f'https://steamcommunity.com/miniprofile/{account_id}?l=koreana', timeout=6) as response:
        parser.feed(response.read(256 * 1024).decode('utf-8', errors='replace'))
    parser.close()
    return {
        'banner_image': parser.banner_image,
        'banner_video': parser.banner_video,
        'badge_image': parser.badge_image,
        'badge_name': (parser.badge_name or '').strip() or None,
    }
