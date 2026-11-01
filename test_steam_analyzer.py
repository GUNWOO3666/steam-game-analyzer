import unittest
from unittest.mock import patch
from steam_analyzer import SteamClient, SteamError, parse_profile, summarize


class AnalyzerTests(unittest.TestCase):
    def test_profile_formats(self):
        sid = "76561198000000000"
        for value in (sid, f"https://steamcommunity.com/profiles/{sid}/"):
            self.assertEqual(parse_profile(value), ("steamid", sid))
        self.assertEqual(parse_profile("https://steamcommunity.com/id/example/?x=1"), ("vanity", "example"))
        for value in ("https://evil.com/id/example", "https://steamcommunity.com/profiles/123", "garbage"):
            with self.assertRaises(SteamError):
                parse_profile(value)

    def test_summary_boundaries(self):
        games = [{"appid": i, "playtime_forever": n} for i, n in enumerate([0, 1, 59, 60, 120])]
        summary = summarize(games)
        self.assertEqual(summary["unplayed_count"], 1)
        self.assertEqual(summary["under_one_hour_count"], 2)
        self.assertEqual(summary["total_playtime_hours"], 4)
        self.assertEqual(summary["top_games"][0]["playtime_forever"], 120)
        self.assertEqual(summarize([])["game_count"], 0)

    def test_vanity_resolution(self):
        client = SteamClient("test-secret")
        with patch.object(client, "request", side_effect=[{"success": 1, "steamid": "76561198000000000"}, {"game_count": 0}]) as request:
            self.assertEqual(client.get_library("https://steamcommunity.com/id/example")["games"], [])
            self.assertEqual(request.call_args.kwargs["steamid"], "76561198000000000")

    def test_private_library_is_not_empty_library(self):
        with patch.object(SteamClient, "request", return_value={}):
            with self.assertRaises(SteamError):
                SteamClient("test").get_library("76561198000000000")

    def test_http_error_does_not_leak_key(self):
        from urllib.error import HTTPError
        with patch("steam_analyzer.urlopen", side_effect=HTTPError("https://example.com/?key=secret", 403, "Forbidden", {}, None)):
            with self.assertRaises(SteamError) as error:
                SteamClient("secret").request("IPlayerService/GetOwnedGames")
            self.assertNotIn("secret", str(error.exception))


if __name__ == "__main__":
    unittest.main()
