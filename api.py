"""로컬 실행: python -m uvicorn api:app --reload"""
import os

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from steam_analyzer import SteamClient, SteamError, parse_profile

app = FastAPI(
    title="Steam 게임 분석기",
    description=(
        "Steam 프로필의 공개 게임 라이브러리와 플레이시간을 조회하는 API입니다.\n\n"
        "라이브러리 조회에서 **Try it out**(직접 실행)을 누르고 프로필 URL 또는 "
        "SteamID64를 입력한 다음 **Execute**(실행)를 누르세요.\n\n"
        "API 키는 서버의 `STEAM_API_KEY` 환경변수에 설정합니다. 입력란에는 API 키를 넣지 마세요."
    ),
    version="0.1.0",
    openapi_tags=[
        {"name": "서버 상태", "description": "서버가 요청을 받을 수 있는지 확인합니다."},
        {"name": "라이브러리 분석", "description": "공개 라이브러리와 누적 플레이시간을 조회합니다."},
    ],
)


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"detail": "profile 입력값을 확인하세요. Steam 프로필 URL 또는 SteamID64를 1~2048자로 입력해야 합니다."},
    )


@app.get("/health", tags=["서버 상태"], summary="서버 상태 확인",
         description="서버가 정상적으로 실행 중이면 status 값으로 ok를 반환합니다. Steam 연결이나 API 키 유효성은 검사하지 않습니다.",
         response_description="서버 정상 실행 여부")
def health() -> dict:
    return {"status": "ok"}


@app.get(
    "/api/library",
    tags=["라이브러리 분석"],
    summary="게임 라이브러리 및 플레이시간 조회",
    description=(
        "Steam 프로필에서 게임 목록과 누적 플레이시간을 가져옵니다. "
        "프로필과 게임 세부 정보가 공개되어 있어야 합니다.\n\n"
        "응답의 `steamid`는 사용자 식별자, `games`는 게임 목록, `summary`는 요약 통계입니다. "
        "게임의 `playtime_forever`는 누적 플레이시간(분)입니다.\n\n"
        "요약 통계: `game_count` 보유 게임 수, `total_playtime_minutes` 총 플레이시간(분), "
        "`total_playtime_hours` 총 플레이시간(시간), `unplayed_count` 미실행 게임 수, "
        "`under_one_hour_count` 1~59분 플레이한 게임 수, `top_games` 플레이시간 상위 10개 게임."
    ),
    response_description="게임 목록과 플레이시간 요약",
    responses={
        400: {"description": "프로필 URL 또는 SteamID64 형식이 올바르지 않습니다."},
        403: {"description": "라이브러리를 조회할 수 없습니다. 공개 설정을 확인하세요."},
        404: {"description": "입력한 커스텀 프로필을 찾을 수 없습니다."},
        422: {"description": "profile이 없거나 입력 길이가 허용 범위를 벗어났습니다."},
        502: {"description": "Steam API 연결, 인증 또는 응답 처리에 실패했습니다."},
        503: {"description": "서버에 Steam API 키가 설정되지 않았습니다."},
    },
)
def library(profile: str = Query(
    ..., min_length=1, max_length=2048,
    title="Steam 프로필",
    description="SteamID64(17자리 숫자), https://steamcommunity.com/id/사용자이름 또는 https://steamcommunity.com/profiles/SteamID64를 입력하세요.",
)) -> dict:
    """공개 Steam 라이브러리와 플레이시간 요약을 반환합니다."""
    try:
        parse_profile(profile)
        key = os.environ.get("STEAM_API_KEY", "").strip()
        if not key:
            raise HTTPException(status_code=503, detail="서버의 STEAM_API_KEY가 설정되지 않았습니다.")
        return SteamClient(key).get_library(profile)
    except SteamError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from None
