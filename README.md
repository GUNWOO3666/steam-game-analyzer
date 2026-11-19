# Steam Game Analyzer

Steam 프로필 URL이나 SteamID64로 내 게임 기록을 분석하고, Steam 게임을 검색해 리뷰 작성자의 플레이시간 분포와 내 예상 플레이시간을 확인할 수 있는 웹 앱입니다.

**[서비스 바로가기](http://52.79.227.168/)**

## 주요 기능

- **Steam 라이브러리 분석** · 프로필과 보유 게임을 조회하고, 총 플레이시간, 상위 게임, 장르별 플레이 기록, 라이브러리 가치를 확인합니다.
- **Steam 게임 검색 및 플레이시간 비교** · 미보유 게임도 이름으로 검색해 리뷰 작성자의 플레이시간 분포와 중앙값을 볼 수 있습니다. 보유 게임은 내 기록을 같은 그래프에서 비교할 수 있습니다.
- **개인별 예상 플레이시간** · 장르가 비슷한 게임의 내 기록을 바탕으로 검색한 게임의 예상 플레이시간 범위를 계산합니다. 참고할 게임을 직접 선택할 수 있습니다.

## 실행 화면

### 프로필과 라이브러리 요약

Steam 프로필을 입력하면 보유 게임 수, 총 플레이시간, 미실행 게임과 라이브러리 가치를 확인할 수 있습니다. 라이브러리 가치는 가격을 확인할 수 있는 게임의 한국 상점 현재가를 합산합니다.

![Steam 프로필과 라이브러리 요약 화면](docs/screenshots/profile.png)

### 플레이시간 상위 게임

플레이시간 상위 5개 게임을 보여줍니다. `global`은 리뷰 작성자의 누적 플레이시간 중앙값이며, 내 기록이 중앙값의 2배 이상이면 초록색, 5배 이상이면 보라색으로 표시합니다.

![가장 오래 플레이한 게임과 리뷰 중앙값 비교](docs/screenshots/top-games.png)

### 장르별 플레이 성향

장르별 플레이시간을 비교합니다. 여러 장르가 있는 게임은 시간을 균등 배분하고, 조회에 실패한 게임은 다시 조회할 수 있습니다.

![장르별 플레이시간과 실패 항목 재조회 화면](docs/screenshots/genres.png)

### 전체 게임 목록

보유 게임을 이름·플레이시간으로 정렬하거나 검색하고, 미실행·1시간 미만 플레이 기록을 필터링할 수 있습니다. 각 게임의 `분포 보기`를 누르면 리뷰 플레이시간 히스토그램이 열립니다.

![전체 게임 목록과 플레이시간 비교 화면](docs/screenshots/library.png)

### 게임 검색과 개인별 예상 플레이시간

상단 검색창에서 게임을 찾아 플레이시간 분포를 확인할 수 있습니다. 프로필 분석을 마쳤다면 비슷한 장르의 내 기록을 바탕으로 예상 범위를 표시합니다. 참고 게임의 체크를 변경하면 범위가 다시 계산됩니다.

![게임 검색 결과의 로그 스케일 히스토그램과 참고 게임 선택 화면](docs/screenshots/prediction.png)

스크린샷은 2026년 11월 19일 실행 예시이며, 가격과 리뷰 표본은 조회 시점에 따라 달라질 수 있습니다.

## 사용 흐름

1. Steam 프로필 URL 또는 SteamID64를 입력해 라이브러리를 분석합니다.
2. 보유 게임과 장르별 플레이 기록을 확인하고, 게임 옆의 `분포 보기`로 내 기록과 리뷰 중앙값을 비교합니다.
3. 상단 검색창에서 궁금한 게임을 검색하고 `플레이시간 보기`를 선택합니다.
4. 개인별 예상 플레이시간과 참고 게임 목록을 확인합니다. 체크박스로 참고 게임을 선택하면 예상 범위가 갱신됩니다.

## 기술 스택

| 영역 | 사용 기술 |
|---|---|
| 프론트엔드 | React, TypeScript, Vite |
| 백엔드 | Python, FastAPI, Uvicorn |
| 데이터 및 캐시 | Steam Web API, Steam 상점·리뷰, SQLite |
| 실행 및 배포 | Docker, Amazon EC2 |

## 데이터 출처와 집계 기준

- **Steam Web API**에서 공개 프로필, 라이브러리와 게임별 누적 플레이시간을 가져옵니다. 라이브러리를 조회하려면 Steam 프로필과 게임 세부 정보가 공개되어 있어야 합니다.
- **Steam 상점**에서 게임 검색 결과, 배너, 장르, 한국 판매가를 가져옵니다. 장르 정보가 없거나 아직 조회되지 않은 게임은 미분류로 표시합니다. 라이브러리 가치는 조회한 현재 판매가를 합산하며, 할인가를 반영하고 무료 게임은 0원으로 집계합니다. 가격 미확인 게임은 합계에서 제외합니다.
- **Steam 커뮤니티 미니 프로필**에서 공개 배너와 대표 배지 정보를 가져옵니다.
- 상위 5개의 `global`과 전체 목록의 `대부분의 이용자들`은 같은 값입니다. 게임별 최근 공개 Steam 리뷰를 최대 500건 조회한 뒤, 유효한 누적 플레이시간이 있는 작성자를 중복 없이 집계해 중앙값을 계산합니다. 표본이 짝수면 가운데 두 값의 평균을 사용합니다. 이 값은 최근 리뷰 작성자 표본을 기준으로 합니다.
- **예상 플레이시간**은 장르가 겹치는 보유 게임 중 플레이 기록이 있는 게임을 최대 8개 확인합니다. 검색한 게임과 참고 게임의 리뷰 표본은 각각 30명 이상이고 중앙값은 0보다 커야 합니다. 선택된 참고 게임이 3개 이상이면 각 게임의 `내 플레이시간 ÷ 리뷰 중앙값` 비율에서 25·75백분위수를 구하고, 검색한 게임의 리뷰 중앙값에 곱해 예상 범위를 표시합니다.

## 로컬 실행

Python, Node.js, pnpm이 필요합니다. 아래 명령은 Windows PowerShell 기준입니다.

저장소를 내려받거나 제출 압축본을 푼 뒤, `README.md`가 있는 프로젝트 루트에서 시작합니다. Steam 프로필과 게임 세부 정보는 공개 상태여야 합니다.

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

## Docker 실행 및 EC2 배포

<details>
<summary>Docker 실행 방법</summary>


Docker가 실행 중이고 프로젝트 루트에 `STEAM_API_KEY`가 설정된 `.env` 파일이 있어야 합니다. 프론트엔드 빌드와 Python 패키지 설치는 이미지 빌드 과정에서 수행됩니다.

```powershell
docker build -t steam-game-analyzer:demo .
docker run -d --name steam-analyzer-demo --restart unless-stopped --env-file .env -p 127.0.0.1:8080:8000 -v steam-analyzer-data:/app/data steam-game-analyzer:demo
```

`http://127.0.0.1:8080`에서 화면과 API를 함께 사용할 수 있습니다. `.env`는 이미지에 포함되지 않고 실행할 때 전달됩니다.

</details>

<details>
<summary>EC2 배포 및 서버 관리 방법</summary>

수업용 소규모 배포는 Ubuntu Server 24.04 LTS(x86_64) EC2 한 대에서 Docker 컨테이너를 실행하는 구성입니다. 서버에 Docker Engine과 Git을 설치한 뒤 진행합니다.

- 보안 그룹에서 SSH(22)는 관리자 IP에, HTTP(80)는 외부 접속에 허용합니다.
- 퍼블릭 IPv4가 할당된 인스턴스를 사용합니다. 도메인과 HTTPS는 별도 설정이 필요합니다.

서버 터미널에서 저장소를 가져오고 `.env`를 작성합니다.

```bash
git clone https://github.com/GUNWOO3666/steam-game-analyzer.git
cd steam-game-analyzer
touch .env
chmod 600 .env
nano .env
```

`.env`에 `STEAM_API_KEY=발급받은_키`를 저장한 뒤 빌드하고 실행합니다.

```bash
sudo docker build -t steam-game-analyzer:demo .
sudo docker run -d \
  --name steam-analyzer \
  --restart unless-stopped \
  --env-file .env \
  -p 80:8000 \
  -v steam-analyzer-data:/app/data \
  --log-opt max-size=10m \
  --log-opt max-file=3 \
  steam-game-analyzer:demo
```

브라우저에서 `http://서버의_퍼블릭_IP`로 접속합니다. 서버 실행 상태는 아래 명령으로 확인합니다.

```bash
sudo docker ps
sudo docker logs --tail 100 steam-analyzer
curl http://localhost/health
```

컨테이너를 중지하거나 다시 시작할 때는 아래 명령을 사용합니다.

```bash
sudo docker stop steam-analyzer
sudo docker start steam-analyzer
```

SSH 연결을 종료해도 컨테이너는 실행됩니다. 장르 캐시는 Docker 볼륨에 저장되며 리뷰·가격 등의 메모리 캐시는 서버 재시작 후 다시 조회합니다. Steam이 요청을 거부하면 일부 데이터 조회가 지연되거나 실패할 수 있습니다.

운영 기간이 끝나면 EC2 인스턴스를 종료하고, 남아 있는 EBS 볼륨과 별도로 할당한 Elastic IP도 확인해 정리합니다.

</details>

## 테스트

프로젝트 루트에서 백엔드 테스트를 실행합니다.

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m unittest discover -v
```

`frontend` 폴더에서 프론트엔드 타입 검사와 빌드를 실행합니다.

```powershell
pnpm.cmd build
```

## Release 소스 실행 안내

Release 압축본도 프로젝트 루트에서 위의 로컬 실행 또는 Docker 실행 절차를 따릅니다. 소스코드, 의존성 파일, Dockerfile과 README가 필요하며 실행 환경은 의존성 설치와 빌드 과정에서 준비됩니다. Steam API 키는 프로젝트 루트에 `.env`를 작성해 설정합니다.

Steam 외부 서비스의 응답 상태에 따라 검색, 이미지, 가격 및 리뷰 조회가 지연되거나 실패할 수 있습니다. 상점에서 요청을 거부하면 앱은 대기 시간을 적용합니다. 잠시 후 검색을 다시 실행하거나 화면을 새로고침해 재조회할 수 있습니다.

## 참고자료 및 사용 라이브러리

### 데이터와 API

| 출처 | 사용 범위 |
|---|---|
| [Steam ISteamUser](https://partner.steamgames.com/doc/webapi/isteamuser) | 프로필 URL 해석, 닉네임·아바타·가입일 조회 |
| [Steam IPlayerService](https://partner.steamgames.com/doc/webapi/iplayerservice) | 보유 게임, 누적 플레이시간, Steam 레벨 조회 |
| [Steam IUserReviewsService](https://partner.steamgames.com/doc/webapi/IUserReviewsService) | 최근 공개 리뷰 작성자의 플레이시간 표본 수집 |
| [Steam 상점](https://store.steampowered.com/) | 게임 검색, 장르, 한국 판매가, 배너 이미지 조회 |
| [Steam 커뮤니티](https://steamcommunity.com/) | 공개 미니 프로필 배경과 대표 배지 조회 |

상점 검색·상세 정보와 미니 프로필 HTML은 공개 응답을 사용하며, 제공 형식 변경이나 요청 제한의 영향을 받을 수 있습니다. 게임 이미지와 프로필 꾸미기 요소의 권리는 각 권리자에게 있습니다.

### 라이브러리와 개발 도구

| 라이브러리·도구 | 사용 범위 |
|---|---|
| [FastAPI](https://fastapi.tiangolo.com/) | 백엔드 API, 응답 처리, 정적 파일 제공 |
| [Uvicorn](https://github.com/encode/uvicorn) | ASGI 서버 실행 |
| [Pydantic](https://docs.pydantic.dev/) | API 입력 데이터 검증 |
| [python-dotenv](https://bbc2.github.io/python-dotenv/) | `.env` 환경변수 로딩 |
| [HTTPX](https://www.python-httpx.org/) | FastAPI TestClient를 사용하는 API 테스트 |
| [React / React DOM](https://react.dev/) | 화면 구성과 상태 관리 |
| [TypeScript](https://www.typescriptlang.org/docs/) | 프론트엔드 타입 검사 |
| [Vite](https://v6.vite.dev/) | 개발 서버와 프론트엔드 빌드 |
| [pnpm](https://pnpm.io/) | 프론트엔드 의존성 설치 |
| [Python 표준 라이브러리](https://docs.python.org/3/library/) | HTTP 요청, HTML 파싱, SQLite 캐시, 중앙값 계산, 단위 테스트 |
| [Docker](https://docs.docker.com/) / [Amazon EC2](https://docs.aws.amazon.com/ec2/) | 실행 환경 구성과 서버 배포 |

설치 의존성은 `requirements.txt`, `requirements-dev.txt`, `frontend/package.json`, `frontend/pnpm-lock.yaml`에 기록되어 있습니다. React 타입 정의에는 `@types/react`, `@types/react-dom`을 사용합니다.

### 구현 범위와 개발 지원

이 저장소는 외부 API 데이터를 연결하는 코드, 장르별 집계, 리뷰 중앙값과 히스토그램, 개인별 플레이시간 추정, 참고 게임 선택 및 화면 구성을 구현합니다. 히스토그램은 React와 CSS로 그리며, 예상 플레이시간은 위의 집계 기준에 설명한 비율·백분위 계산을 사용합니다.

개발 과정에서 OpenAI Codex를 활용해 코드 작성·수정, 오류 확인, 테스트와 문서 작성을 지원받았습니다.

## 라이선스

이 프로젝트의 소스코드는 [MIT License](LICENSE)를 따릅니다.
사용한 외부 라이브러리와 Steam 이미지·데이터에는 각 제공자의 라이선스와 이용 조건이 적용됩니다.
