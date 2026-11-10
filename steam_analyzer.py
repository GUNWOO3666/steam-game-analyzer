from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import urlopen

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env", override=False)


class SteamError(Exception):
    """A user-facing Steam API error with an HTTP status for API consumers."""

    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


def parse_profile(value: str) -> tuple[str, str]:
    value = value.strip()
    if re.fullmatch(r"[0-9]{17}", value):
        return "steamid", value
    parsed = urlparse(value)
    parts = parsed.path.strip("/").split("/")
    if (parsed.scheme not in ("http", "https")
            or parsed.netloc.lower() != "steamcommunity.com"
            or len(parts) != 2):
        raise SteamError("SteamID64 또는 https://steamcommunity.com/id/이름 형식의 URL을 입력하세요.", 400)
    kind, identifier = parts
    if kind == "profiles" and re.fullmatch(r"[0-9]{17}", identifier):
        return "steamid", identifier
    if kind == "id" and re.fullmatch(r"[A-Za-z0-9_-]+", identifier):
        return "vanity", identifier
    raise SteamError("올바른 Steam 프로필 URL이 아닙니다.", 400)


class SteamClient:
    def __init__(self, api_key: str):
        self.api_key = api_key

    def request(self, endpoint: str, **params) -> dict:
        query = urlencode({"key": self.api_key, **params})
        url = f"https://api.steampowered.com/{endpoint}/v1/?{query}"
        try:
            with urlopen(url, timeout=20) as response:
                payload = json.load(response)
            if not isinstance(payload, dict) or not isinstance(payload.get("response"), dict):
                raise SteamError("Steam API 응답 형식이 올바르지 않습니다.")
            return payload["response"]
        except HTTPError as exc:
            if exc.code in (401, 403):
                raise SteamError("Steam API 키가 유효한지 확인하세요.") from None
            raise SteamError(f"Steam API 요청 실패 (HTTP {exc.code}). 잠시 후 다시 시도하세요.") from None
        except (URLError, TimeoutError, OSError):
            raise SteamError("Steam에 연결할 수 없습니다. 네트워크 상태를 확인하세요.") from None
        except (ValueError, UnicodeError):
            raise SteamError("Steam API 응답을 읽을 수 없습니다.") from None

    def get_library(self, profile: str) -> dict:
        kind, steamid = parse_profile(profile)
        if kind == "vanity":
            resolved = self.request("ISteamUser/ResolveVanityURL", vanityurl=steamid)
            steamid = resolved.get("steamid", "")
            if resolved.get("success") != 1 or not re.fullmatch(r"[0-9]{17}", steamid):
                raise SteamError("해당 Steam 프로필을 찾을 수 없습니다.", 404)
        library = self.request("IPlayerService/GetOwnedGames", steamid=steamid,
                               include_appinfo=1, include_played_free_games=1)
        if "game_count" not in library:
            raise SteamError("라이브러리를 조회할 수 없습니다. 프로필과 게임 세부 정보 공개 설정을 확인하세요.", 403)
        games = library.get("games", [])
        if not isinstance(games, list) or library["game_count"] != len(games):
            raise SteamError("Steam 라이브러리 응답이 불완전합니다. 다시 시도하세요.")
        return {"steamid": steamid, "games": games, "summary": summarize(games)}


def summarize(games: list[dict]) -> dict:
    minutes = [game.get("playtime_forever", 0) for game in games]
    return {
        "game_count": len(games),
        "total_playtime_minutes": sum(minutes),
        "total_playtime_hours": round(sum(minutes) / 60, 2),
        "unplayed_count": sum(value == 0 for value in minutes),
        "under_one_hour_count": sum(0 < value < 60 for value in minutes),
        "top_games": sorted(games, key=lambda game: game.get("playtime_forever", 0), reverse=True)[:10],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Steam 라이브러리와 플레이시간 조회")
    parser.add_argument("profile", help="SteamID64 또는 Steam 프로필 URL")
    parser.add_argument("--output", type=Path, help="결과 JSON 저장 경로")
    args = parser.parse_args()
    try:
        parse_profile(args.profile)
        key = os.environ.get("STEAM_API_KEY", "").strip()
        if not key:
            raise SteamError("STEAM_API_KEY 환경변수를 설정하세요.")
        result = SteamClient(key).get_library(args.profile)
        summary = result["summary"]
        print(f"보유 게임: {summary['game_count']}개")
        print(f"총 플레이시간: {summary['total_playtime_hours']:,.2f}시간")
        print(f"미실행: {summary['unplayed_count']}개 / 1시간 미만 플레이: {summary['under_one_hour_count']}개")
        for game in summary["top_games"]:
            print(f"  {game.get('name', game['appid'])}: {game.get('playtime_forever', 0) / 60:,.1f}시간")
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"저장 완료: {args.output}")
        return 0
    except (SteamError, OSError) as exc:
        print(f"오류: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
