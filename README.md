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

## 로드맵

- **Stage 2 — AI 대화 파트너 (Claude API)**
  `server.js`의 `/api/chat`를 구현하고 `ANTHROPIC_API_KEY`를 설정하면
  학습한 표현을 실제 상황에서 자유 대화로 연습할 수 있게 확장합니다.
- **진짜 푸시 알림** — 현재 리마인더는 앱이 살아있을 때 동작하는 로컬 알림입니다.
  앱이 닫혀 있어도 하루 여러 번 알리려면 VAPID 기반 Web Push(서버) + 구독 저장이 필요합니다.
- **클라우드 동기화** — localStorage → 계정/DB 로 이전(기기 간 진행 동기화).
- **콘텐츠 확장** — 코미디 클립/시사 헤드라인/경제 뉴스에서 표현을 자동 큐레이션.
