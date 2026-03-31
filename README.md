# Reference.final

<!-- 소개글 고정: 아래 두 단락은 의도된 카피입니다. 수정하지 마세요. -->

월급루팡이라뇨? 쉴 때조차 두뇌를 활성화하는 바람직한 직장인이죠!

레퍼런스 파이널은 쉬는 시간에 가볍게 직장인의 두뇌 시냅스를 두드려줄 미니 게임들을 제공합니다. 사무실 컴퓨터 화면에서도 이질적이지 않은 각종 테마스킨으로 당당하고 떳떳한 휴식을 누리세요. 그리고 때로는, 같은 처지의 사람들의 존재에서 사이버 온기도 느껴볼 수 있을 겁니다.

브라우저에서 동작하는 **미니 게임 로비**입니다. 닉네임·방 링크로 친구와 **오목·빙고**를 할 수 있고, Excel / Adobe / Simple 세 가지 **UI 스킨**을 고를 수 있습니다.

---

## 목차

- [주요 기능](#주요-기능)
- [기술 스택](#기술-스택)
- [시작하기](#시작하기)
- [개발](#개발)
- [배포](#배포)
- [환경 변수](#환경-변수)
- [프로젝트 구조](#프로젝트-구조)
- [제작](#-제작)
- [버그 리포트](#-버그-리포트)

## 주요 기능

- **매칭**: 호스트가 방을 만들고, 게스트는 초대 URL로 입장
- **오목** · **빙고**: 온라인 대전(원격 API + Redis) 또는 로컬 개발 시 `localStorage` 기반
- **테마**: `excel` / `adobe` / `vscode` 스킨 전환
- **정적 배포**: GitHub Pages용 빌드·SPA 404 처리 스크립트 포함

## 기술 스택

| 구분 | 사용 |
|------|------|
| 프론트 | React 18, TypeScript, Vite 5, React Router 6 |
| API | Vercel Serverless (`api/match-room.ts`) |
| 저장소 | Upstash Redis (`@upstash/redis`) — 방·게임 상태 |

## 시작하기

### 요구 사항

- **Node.js** 18 이상 권장  
- 패키지 매니저: npm

### 설치

```bash
git clone <저장소 URL>
cd reference_final
npm install
```

### 스크립트

| 명령 | 설명 |
|------|------|
| `npm run dev` | 개발 서버 (기본적으로 **로컬 로비** — `localStorage`) |
| `npm run build` | TypeScript 검사 + Vite 프로덕션 빌드 + GitHub Pages용 `404.html` 생성 |
| `npm run preview` | 빌드 결과 미리보기 |

## 개발

- `npm run dev`만 실행하면 **원격 로비 API를 쓰지 않습니다.** 같은 PC에서 탭을 나누면 매칭·게임이 `localStorage`로 동작합니다.
- API와 함께 로컬에서 돌리려면 [Vercel CLI](https://vercel.com/docs/cli)로 `vercel dev`를 사용하세요.

## 배포

### Vercel (원격 매칭)

1. 저장소를 Vercel에 연결합니다.  
2. **Redis**를 연결합니다. 환경 변수 이름은 **`KV_REST_API_URL` / `KV_REST_API_TOKEN`** 또는 **`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`** — API가 둘 다 읽습니다.  
3. 배포 후 `GET /api/match-room?ping=1` 응답에 `"storage":"redis"`가 보이면 연결이 정상입니다.  
4. **`*.vercel.app`** 호스트에서는 기본적으로 원격 로비가 켜집니다.  
5. **커스텀 도메인**만 쓸 때는 빌드 환경 변수에 `VITE_USE_REMOTE_LOBBY=true`를 설정합니다.

### GitHub Pages

- 저장소 **Settings → Pages → Source: GitHub Actions**  
- `main` 푸시 시 워크플로가 `VITE_BASE_PATH=/저장소이름/` 형태로 빌드합니다.  
- 정적 호스팅이라 **서버 API는 없으며**, URL만으로 타 기기와 매칭하는 것은 제한됩니다.

## 환경 변수

| 변수 | 설명 |
|------|------|
| `VITE_BASE_PATH` | GitHub Pages 등에서 base path (기본 `/`) |
| `VITE_USE_REMOTE_LOBBY` | `true` / `false`로 원격 로비 사용 여부 강제. 미설정 시 호스트에 따라 자동 판별 |

## 프로젝트 구조

```
src/
  pages/        홈, 매칭, 오목·빙고 플레이
  components/   UI·프레임
  lib/          매칭 방, 오목·빙고 동기화·규칙
api/
  match-room.ts Vercel API (게임 로직은 src/lib 엔진과 맞춤 유지)
```

---

## 👥 제작

- 기획: 아델.lee  
- 디자인: 홍디  
- 프론트엔드: Oxy  
- 백엔드: (탈주) → Cursor AI 

## 📧 버그 리포트

nugbugreport@gmail.com
