# Reference.final

<!-- 소개글 고정: 아래 두 단락은 의도된 카피입니다. 수정하지 마세요. -->

월급루팡이라뇨? 쉴 때조차 두뇌를 활성화하는 바람직한 직장인이죠!

레퍼런스 파이널은 쉬는 시간에 가볍게 직장인의 두뇌 시냅스를 두드려줄 미니 게임들을 제공합니다. 사무실 컴퓨터 화면에서도 이질적이지 않은 각종 테마스킨으로 당당하고 떳떳한 휴식을 누리세요. 그리고 때로는, 같은 처지의 사람들의 존재에서 사이버 온기도 느껴볼 수 있을 겁니다.

## 스택

- React 18, TypeScript, Vite 5  
- React Router 6  
- Vercel Serverless (`api/match-room.ts`) + **Upstash Redis** (`@upstash/redis`) — 방·오목 등 상태 저장 (서버리스 인스턴스 간 공유)

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
2. 프로젝트에 **KV 또는 Upstash Redis** 스토리지를 연결합니다. 주입 이름은 **`KV_REST_API_URL` / `KV_REST_API_TOKEN`** 또는 **`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`** — API는 둘 다 읽습니다.  
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

- `src/pages/` — 홈, 매칭(`MatchPage`), 오목·빙고 플레이. 매칭 완료 시 호스트·게스트 모두 `sessionStorage`에 `playRoomId`·`matchRole` 저장(빙고·오목 공통). 게스트 초대 링크는 `/match/:gameId?guest=1&room=<roomId>`; 플레이 URL만 공유할 때는 `/play/omok`·`/play/bingo`에 동일 쿼리를 붙이면 진입 시 세션이 보강됩니다. `/play/*`에서 세션이 비어 있으면 홈으로 보냄. 닉네임은 `getRoom(roomId)`의 `hostNickname` / `guestNickname`.  
- `src/lib/matchRoom*.ts` — 매칭 방 (로컬 / Vercel 원격)  
- `src/lib/omokSync.ts`, `omokEngine.ts`, `omokRules.ts` — 오목 상태·규칙(쌍삼 금수: 열린 3이 동시에 2개 이상이면 금지, 5목 완성 수는 예외). `api/match-room.ts` 오목 수 두기와 동일 로직 유지  
- `src/lib/bingoSync.ts`, `bingoEngine.ts` — 빙고 상태 (`slideRowLabels` / `slideColLabels`, 레거시 flat 삽입 `insertFlatReorder` 등)  
- `src/pages/game-play.css`, `BingoPage.tsx` — 빙고 시트/그리드. Excel 테마(`data-theme='excel'`) 빙고는 Figma A_G2 계열 토큰으로 배치·선택/플레이 색을 맞춤(bingo_02 팔레트: 플레이어 톤·포커스/플레이 가능 링 `#a1d4b8` 등). 로컬 셋업은 **포인터(마우스·터치)**: 드래그 방향으로 축이 잠기면 **같은 행만 가로 슬라이드** 또는 **같은 열만 세로 슬라이드**(`slideRowLabels` / `slideColLabels`), 빈 칸 없이 밀기; 미리보기·드롭 후 **FLIP** 약 180ms.  
- `api/match-room.ts` — Vercel API (오목·빙고 로직 인라인 — `src/lib/*Engine` 과 동기화 유지). **빙고(온라인)**: `bingoEnsure` 시 서버가 **동일한 초기 `labels` 5×5**를 Redis에 두고, 호스트·게스트가 같은 SUBJECT·같은 25단어에서 시작합니다. **완료** 시 `bingoReady`로 각자 `layoutFlat`을 저장(`hostLayoutFlat` / `guestLayoutFlat`). **`hostReady` / `guestReady`**는 JSON에서 `true`·`1`·`'1'`만 참으로 파싱해 `Boolean("false")===true` 류 오인을 막고, **`hostReady === true` 이고 `guestReady === true` 일 때만** `phase: play`로 전환합니다. 플레이 중 표시는 서버 `markedByIndex`·`pendingWord`(단어 문자열)를 폴링으로 받아 각자 판에 매핑합니다. **`bingo.turn` / 타임아웃**은 Redis·`getRoomResolved` 권한, 원격 클라는 폴링 값만 표시. 레거시 `bingoSubjectId`는 `normalize`에서 `subjectId`로 흡수.  

---

## 👥 제작

- 기획: 아델.lee  
- 디자인: 홍디  
- 프론트엔드: Oxy  
- 백엔드: (탈주) → Cursor AI 

## 📧 버그 리포트

nugbugreport@gmail.com
