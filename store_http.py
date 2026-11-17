"""Apply a shared cooldown when the Steam storefront refuses requests."""
from threading import Lock
from time import monotonic
from urllib.error import HTTPError
from urllib.request import urlopen

_lock = Lock()
_blocked_until = 0.0


class StoreUnavailable(OSError):
    def __init__(self, retry_after: int):
        super().__init__('Steam storefront temporarily unavailable')
        self.retry_after = retry_after


def open_store(url: str, *, timeout: int):
    global _blocked_until
    with _lock:
        remaining = _blocked_until - monotonic()
    if remaining > 0:
        raise StoreUnavailable(int(remaining) + 1)

    try:
        return urlopen(url, timeout=timeout)
    except HTTPError as error:
        if error.code not in (403, 429):
            raise
        retry_after = (error.headers.get('Retry-After') or '').strip()
        delay = max(60, int(retry_after)) if retry_after.isascii() and retry_after.isdecimal() else 60
        with _lock:
            _blocked_until = max(_blocked_until, monotonic() + delay)
        error.close()
        raise StoreUnavailable(delay) from None
