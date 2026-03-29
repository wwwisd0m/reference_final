# Reference.final — Game Lobby UI

엑셀·어도비·VS Code 스킨을 쓰는 게임 로비 UI 레퍼런스입니다. 닉네임 입력 후 오목·빙고 매칭 화면으로 이어지며, **Vercel**에 올리면 서로 다른 기기에서도 초대 URL로 입장·오목 대국이 가능합니다.

## 스택

- React 18, TypeScript, Vite 5  
- React Router 6  
- Vercel Serverless (`api/match-room.ts`) + **Vercel KV** (`@vercel/kv`) — 방·오목 등 상태를 Redis에 저장 (서버리스 인스턴스 간 공유)

## 스크립트

```bash
npm install
npm run dev      # 로컬 개발 (매칭/오목은 브라우저 localStorage 기준)
npm run build    # 프로덕션 빌드 (GitHub Pages용이면 CI에서 VITE_BASE_PATH 설정)
npm run preview  # dist 미리보기
```

## 로컬 개발

- `npm run dev`에서는 **원격 로비 API를 쓰지 않습니다.** 같은 PC에서 탭을 나누면 `localStorage`로 매칭·오목이 동작합니다.
- API까지 함께 쓰려면 [Vercel CLI](https://vercel.com/docs/cli)로 `vercel dev`를 실행하세요.

## 배포

### Vercel (권장 — 원격 매칭·오목)

1. 저장소를 Vercel에 연결합니다.  
2. 프로젝트에 **KV(또는 Marketplace의 Redis/Upstash)** 스토리지를 연결합니다. 주입되는 이름은 **`KV_REST_API_URL` / `KV_REST_API_TOKEN`** 이거나 **`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`** 일 수 있습니다. API는 둘 다 읽습니다 (`createClient`로 통합).  
3. 배포 후 `GET /api/match-room?ping=1` 이 `{"ok":true,"storage":"redis"}` 를 주면 Redis 연결은 정상입니다.  
4. `vercel.json`으로 Vite 빌드·SPA 라우팅·`/api/*`가 잡힙니다.  
5. **`*.vercel.app`** 호스트에서는 자동으로 원격 로비가 켜집니다.  
6. **커스텀 도메인**만 쓸 때는 빌드 환경 변수에 `VITE_USE_REMOTE_LOBBY=true`를 넣습니다.

### GitHub Pages

1. 저장소 **Settings → Pages → Source: GitHub Actions**  
2. `main` 푸시 시 워크플로가 `VITE_BASE_PATH=/저장소이름/`으로 빌드합니다.  
3. GitHub Pages에서는 서버 API가 없어 **URL만으로 타 기기 매칭은 되지 않습니다.** (정적 호스팅 한계)

## 환경 변수 요약

| 변수 | 용도 |
|------|------|
| `VITE_BASE_PATH` | GitHub Actions 등에서 `/repo-name/` 형태로 설정 (기본 `/`) |
| `VITE_USE_REMOTE_LOBBY` | `true`/`false`로 강제. 미설정 시 `*.vercel.app`·프로덕션+비-github.io·비-localhost면 원격 API 사용 (정적 호스트만 쓰는 도메인이면 `false`) |

## 폴더 구조 (요약)

- `src/pages/` — 홈, 매칭, 오목, 빙고  
- `src/lib/matchRoom*.ts` — 매칭 방 (로컬 / Vercel 원격)  
- `src/lib/omokSync.ts`, `omokEngine.ts` — 오목 상태  
- `api/match-room.ts` — Vercel API 엔드포인트  
- `api/omokServer.ts` — API 번들용 오목 규칙 (`src/lib/omokEngine` 과 규칙 동기화 필요)  

---

## 👥 제작

- 기획: 아델.lee  
- 디자인: 홍디  
- 프론트엔드: Oxy  
- 백엔드: (탈주) → Claude AI  

## 📧 버그 리포트

nugbugreport@gmail.com
