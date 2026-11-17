# Steam Game Analyzer

Steam 프로필 URL이나 SteamID64로 내 게임 기록을 분석하고, Steam 게임을 검색해 리뷰 작성자의 플레이시간 분포와 내 예상 플레이시간을 확인할 수 있는 웹 앱입니다.

## 주요 기능

- **Steam 라이브러리 분석** · 프로필과 보유 게임을 조회하고, 총 플레이시간, 상위 게임, 장르별 플레이 기록, 라이브러리 가치를 확인합니다.
- **Steam 게임 검색 및 플레이시간 비교** · 미보유 게임도 이름으로 검색해 리뷰 작성자의 플레이시간 분포와 중앙값을 볼 수 있습니다. 보유 게임은 내 기록을 같은 그래프에서 비교할 수 있습니다.
- **개인별 예상 플레이시간** · 장르가 비슷한 게임의 내 기록을 바탕으로 검색한 게임의 예상 플레이시간 범위를 계산합니다. 참고할 게임을 직접 선택할 수 있습니다.

## 데이터 출처와 집계 기준

- **Steam Web API**에서 공개 프로필, 라이브러리와 게임별 누적 플레이시간을 가져옵니다. 라이브러리를 조회하려면 Steam 프로필과 게임 세부 정보가 공개되어 있어야 합니다.
- **Steam 상점**에서 게임 검색 결과, 배너, 장르, 한국 판매가를 가져옵니다. 장르 정보가 없거나 아직 조회되지 않은 게임은 미분류로 표시합니다. 라이브러리 가치는 조회한 현재 판매가를 합산하며, 할인가를 반영하고 무료 게임은 0원으로 집계합니다. 가격 미확인 게임은 합계에서 제외합니다.
- **Steam 커뮤니티 미니 프로필**에서 공개 배너와 대표 배지 정보를 가져옵니다.
- 상위 5개의 **`global`**과 전체 목록의 **`대부분의 이용자들`**은 같은 값입니다. 게임별 최근 공개 Steam 리뷰를 최대 500건 조회한 뒤, 유효한 누적 플레이시간이 있는 작성자를 중복 없이 집계해 중앙값을 계산합니다. 표본이 짝수면 가운데 두 값의 평균을 사용합니다. 이 값은 최근 리뷰 작성자 표본을 기준으로 합니다.
- **예상 플레이시간**은 장르가 겹치는 보유 게임 중 플레이 기록이 있는 게임을 최대 8개 확인합니다. 검색한 게임과 참고 게임의 리뷰 표본은 각각 30명 이상이고 중앙값은 0보다 커야 합니다. 선택된 참고 게임이 3개 이상이면 각 게임의 `내 플레이시간 ÷ 리뷰 중앙값` 비율에서 25·75백분위수를 구하고, 검색한 게임의 리뷰 중앙값에 곱해 예상 범위를 표시합니다.

## 로컬 실행

Python, Node.js, pnpm이 필요합니다. 아래 명령은 Windows PowerShell 기준입니다.

1. 프로젝트 루트에서 백엔드 의존성을 설치합니다.

   ```powershell
   python -m venv .venv
   .\.venv\Scripts\python.exe -m pip install -r requirements.txt
   ```

2. 프로젝트 루트에 `.env` 파일을 만들고 Steam Web API 키를 설정합니다. `.env`는 Git 추적에서 제외됩니다.

   ```dotenv
   STEAM_API_KEY=여기에_발급받은_키
   ```

3. 같은 터미널에서 백엔드를 실행합니다.

   ```powershell
   .\.venv\Scripts\python.exe -m uvicorn api:app --reload
   ```

4. 프로젝트 루트에서 새 터미널을 열고 프론트엔드를 실행합니다.

   ```powershell
   cd frontend
   pnpm.cmd install --frozen-lockfile
   pnpm.cmd dev
   ```

5. 프론트엔드 터미널에 표시된 `Local` 주소(기본 `http://127.0.0.1:5173`)를 열고 Steam 프로필 URL 또는 SteamID64를 입력합니다. 백엔드 API 문서는 `http://127.0.0.1:8000/docs`에서 확인할 수 있습니다.

## 기술 스택과 검증

- 프론트엔드 · React, TypeScript, Vite
- 백엔드 · Python, FastAPI, Uvicorn, SQLite(장르 캐시)

프로젝트 루트에서 백엔드 테스트를 실행합니다.

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m unittest discover -v
```

`frontend` 폴더에서 프론트엔드 타입 검사와 빌드를 실행합니다.

```powershell
pnpm.cmd build
```
