# Reference.final

<!-- 소개글 고정: 아래 두 단락은 의도된 카피입니다. 수정하지 마세요. -->

월급루팡이라뇨? 쉴 때조차 두뇌를 활성화하는 바람직한 직장인이죠!

레퍼런스 파이널은 쉬는 시간에 가볍게 직장인의 두뇌 시냅스를 두드려줄 미니 게임들을 제공합니다. 사무실 컴퓨터 화면에서도 이질적이지 않은 각종 테마스킨으로 당당하고 떳떳한 휴식을 누리세요. 그리고 때로는, 같은 처지의 사람들의 존재에서 사이버 온기도 느껴볼 수 있을 겁니다.

## 개발

React 18 · TypeScript · Vite 5 · React Router 6. 원격 매칭은 Vercel Serverless `api/match-room.ts` + Upstash Redis.

```bash
npm install
npm run dev      # 로컬: localStorage 로비 (원격 API 미사용)
npm run build
npm run preview
```

`vercel dev`로 API까지 로컬에서 묶을 수 있습니다.

## 배포

- **Vercel**: Redis(`KV_*` 또는 `UPSTASH_REDIS_*`) 연결 후 배포. `GET /api/match-room?ping=1` → `{"ok":true,"storage":"redis"}` 확인. `*.vercel.app`는 기본 원격 로비.
- **커스텀 도메인만** 쓸 때: 빌드에 `VITE_USE_REMOTE_LOBBY=true`.
- **GitHub Pages**: Actions로 빌드, `VITE_BASE_PATH=/저장소명/`. 정적 호스팅이라 서버 API 없음.

## 환경 변수

| 변수 | 용도 |
|------|------|
| `VITE_BASE_PATH` | Pages 등에서 base path (기본 `/`) |
| `VITE_USE_REMOTE_LOBBY` | 원격 로비 강제 on/off |

## 코드 구조

`src/pages/` 홈·매칭·오목·빙고 플레이. `src/lib/matchRoom*.ts`, `omok*`, `bingo*` 게임·동기화. `api/match-room.ts`는 엔진과 규칙 동기화 유지.

---

## 👥 제작

- 기획: 아델.lee  
- 디자인: 홍디  
- 프론트엔드: Oxy  
- 백엔드: (탈주) → Cursor AI 

## 📧 버그 리포트

nugbugreport@gmail.com
