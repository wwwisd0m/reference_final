/**
 * 원격 방 API 사용 여부.
 * - *.vercel.app: 자동 사용
 * - 프로덕션 빌드 + GitHub Pages가 아님 + localhost 아님: Vercel 커스텀 도메인 등에서 자동 사용
 * - GitHub Pages(github.io): 로컬 저장소만 (API 없음)
 * - `npm run dev` / localhost preview: 로컬 저장소
 */
export function isRemoteLobby(): boolean {
  if (import.meta.env.VITE_USE_REMOTE_LOBBY === 'false') return false;
  if (import.meta.env.VITE_USE_REMOTE_LOBBY === 'true') return true;
  if (typeof window !== 'undefined') {
    const h = window.location.hostname;
    if (h.endsWith('.github.io')) return false;
    if (h === 'localhost' || h === '127.0.0.1') return false;
    if (h.endsWith('.vercel.app')) return true;
    if (import.meta.env.PROD) return true;
  }
  return false;
}
