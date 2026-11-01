import os
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from api import app
from steam_analyzer import SteamError


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.env = patch.dict(os.environ, {"STEAM_API_KEY": "test-secret"})
        self.env.start()
        self.addCleanup(self.env.stop)

    def test_health(self):
        with patch.dict(os.environ, {}, clear=True):
            response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_library_success(self):
        result = {"steamid": "76561198000000000", "games": [], "summary": {"game_count": 0}}
        with patch("api.SteamClient.get_library", return_value=result) as fetch:
            response = self.client.get("/api/library", params={"profile": "https://steamcommunity.com/id/example"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), result)
        fetch.assert_called_once_with("https://steamcommunity.com/id/example")
        self.assertNotIn("test-secret", response.text)

    def test_invalid_profile_never_calls_steam(self):
        with patch("api.SteamClient.get_library") as fetch:
            response = self.client.get("/api/library", params={"profile": "invalid"})
        self.assertEqual(response.status_code, 400)
        fetch.assert_not_called()

    def test_missing_and_empty_profile(self):
        for params in ({}, {"profile": ""}):
            self.assertEqual(self.client.get("/api/library", params=params).status_code, 422)

    def test_missing_key(self):
        with patch.dict(os.environ, {}, clear=True), patch("api.SteamClient.get_library") as fetch:
            response = self.client.get("/api/library", params={"profile": "76561198000000000"})
        self.assertEqual(response.status_code, 503)
        fetch.assert_not_called()

    def test_steam_errors(self):
        for status in (403, 404, 502):
            with self.subTest(status=status), patch("api.SteamClient.get_library", side_effect=SteamError("조회 실패", status)):
                response = self.client.get("/api/library", params={"profile": "76561198000000000"})
                self.assertEqual(response.status_code, status)
                self.assertEqual(response.json(), {"detail": "조회 실패"})


if __name__ == "__main__":
    unittest.main()
