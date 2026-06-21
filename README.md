# 회화한입 🍱 — 영어 회화 한입 (PWA, MVP)

"짧은 시간에, 하루 여러 번, 재미있게" 영어 회화를 익히는 모바일 웹앱.
**코미디 · 정치시사 · 경제** 관심사 중심으로 콘텐츠를 채웠습니다.

## 무엇이 되나 (MVP, Stage 1)

- **마이크로러닝** — 한 세션 8장 내외, 약 1분. 카드 1장 = 핵심 표현 1개.
- **간격 반복(SRS)** — SM-2 라이트. 처음엔 10분 → 1시간 → 6시간 → 1일… 으로
  하루에도 여러 번 복습이 돌아옵니다. (`js/srs.js`)
- **게이미피케이션** — 스트릭🔥, XP, 레벨(인턴 개그러 → 회화 끝판왕👑), 콤보⚡,
  일일 목표 링, 업적🏆. (`js/game.js`)
- **음성 연습** — 브라우저 TTS로 듣고, STT로 따라말하면 발음 점수(0~100)를 채점.
  (`js/speech.js`, Chrome/Safari 권장)
- **PWA** — 홈 화면 설치, 오프라인 동작, 잊을 때쯤 **로컬 알림** 리마인더.
- **데이터** — 전부 `localStorage` (서버 DB 없음).

## 폰에서 바로 열어보기

```bash
npm install
npm start
```

그다음 폰 브라우저에서 접속:

1. PC와 폰을 **같은 Wi-Fi**에 연결
2. PC의 LAN IP 확인 (mac/linux: `ipconfig getifaddr en0` 또는 `hostname -I`)
3. 폰에서 `http://<PC-IP>:3000` 접속
4. Chrome 메뉴 → **홈 화면에 추가** 로 앱처럼 설치

> ⚠️ 음성 인식(STT)과 푸시는 보안 컨텍스트(HTTPS 또는 localhost)에서만 동작합니다.
> LAN IP(http)로 열면 TTS·학습·게임은 다 되지만 **STT/알림은 제한**될 수 있어요.
> 폰에서 전 기능을 테스트하려면 `ngrok http 3000` 같은 HTTPS 터널을 쓰는 걸 추천합니다.

## 구조

```
server.js                 Express 정적 서버 (+ Stage2 /api/chat 자리)
scripts/generate-icons.js 의존성 없이 PNG 아이콘 생성
public/
  index.html              화면 구조 (홈/세션/완료/둘러보기/프로필)
  css/styles.css          모바일 우선 다크 테마
  js/data.js              콘텐츠 덱 (코미디/정치/경제/일상)
  js/srs.js               간격 반복 엔진
  js/game.js              XP·레벨·스트릭·업적
  js/speech.js            TTS/STT + 발음 채점
  js/app.js               화면 라우팅·세션 흐름·알림
  manifest.json / sw.js   PWA 설치·오프라인·알림
  icons/                  아이콘 (svg + png)
```

## 콘텐츠 추가하기

`public/js/data.js` 의 `DECK` 배열에 카드를 추가하면 끝.
새 분야가 필요하면 `CATEGORIES`에 항목을 추가하세요.

## Stage 2 — AI 대화 파트너 (Claude API) ✅ 구현됨

`🤖 AI와 영어로 수다 떨기` 버튼으로 진입. 주제(기초/코미디/정치/경제/일상)를 고르면
AI가 쉬운 영어로 말을 걸고, 사용자의 답을 부드럽게 교정(✏️)해 줍니다. 🎙️로 말하기도 가능.

서버(`/api/chat`)가 **Claude API**(`@anthropic-ai/sdk`)를 호출하므로 **API 키는 서버에만** 보관됩니다.
GitHub Pages(정적)에는 서버가 없으니, AI 대화를 쓰려면 아래처럼 **앱을 서버로 배포**하세요.

### 가장 쉬운 방법 — 앱에 API 키만 붙여넣기 (서버 배포 X)
배포가 부담되면, **개인용**으로는 이게 제일 빨라요. GitHub Pages 주소에서 바로 됩니다.
1. [console.anthropic.com](https://console.anthropic.com) → **API Keys** 에서 키 발급 (`sk-ant-...`, 소액 유료)
2. 앱 → 🤖 AI 대화 → **⚙️** → "쉬운 방법"에 키 붙여넣고 모델 선택(회화는 `haiku` 추천) → 저장
3. 끝. 키는 **이 기기(localStorage)에만** 저장되고 Anthropic으로만 전송돼요.
   > 보안: 키는 비밀번호와 같아요. 공유 금지, 콘솔에서 사용 한도 설정 권장. 공용 기기에선 비권장(서버 방법 사용).

### 제대로 — 서버로 배포 (Render 예시, 폰만으로 가능)

1. [render.com](https://render.com) 가입 → **New → Web Service** → 이 GitHub 저장소 연결
2. Build Command: `npm install` · Start Command: `npm start`
3. **Environment** 에 추가:
   - `ANTHROPIC_API_KEY` = `sk-ant-...` (필수)
   - (선택) `CHAT_MODEL` = `claude-haiku-4-5` — 비용/속도 절감 (기본은 `claude-opus-4-8`)
   - (선택) `ALLOWED_ORIGIN` = `https://d-won.github.io` — CORS 제한
   - (선택) `APP_SECRET` = 임의 문자열 — 무단 사용 방지(앱 ⚙️에 같은 값 입력)
4. 배포된 `https://<your-app>.onrender.com` 을 폰에서 열면 카드 학습 + AI 대화가 **그 주소 하나로** 다 됩니다.

### GitHub Pages를 계속 쓰면서 AI만 붙이기
Pages(`d-won.github.io`)에서 열고, AI 대화 화면의 **⚙️ → 서버 주소**에 위 Render 주소를 입력하면
정적 PWA가 그 서버의 `/api/chat`을 호출합니다. (이 경우 서버에 `ALLOWED_ORIGIN`/`APP_SECRET` 설정 권장)

> 로컬 테스트: `ANTHROPIC_API_KEY=sk-ant-... npm start` 후 `http://localhost:3000`.

## 로드맵 (다음)

- **진짜 푸시 알림** — 현재 리마인더는 앱이 살아있을 때 동작하는 로컬 알림입니다.
  앱이 닫혀 있어도 하루 여러 번 알리려면 VAPID 기반 Web Push(서버) + 구독 저장이 필요합니다.
- **클라우드 동기화** — localStorage → 계정/DB 로 이전(기기 간 진행 동기화).
- **콘텐츠 확장** — 코미디 클립/시사 헤드라인/경제 뉴스에서 표현을 자동 큐레이션.
