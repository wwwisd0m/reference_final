/**
 * 원격 방 API 사용 여부.
 * - *.vercel.app: 자동 사용
 * - 커스텀 도메인(Vercel): 빌드 시 VITE_USE_REMOTE_LOBBY=true
 * - GitHub Pages(github.io): 로컬 저장소만 (API 없음)
 */
export function isRemoteLobby(): boolean {
  if (import.meta.env.VITE_USE_REMOTE_LOBBY === 'false') return false;
  if (import.meta.env.VITE_USE_REMOTE_LOBBY === 'true') return true;
  if (typeof window !== 'undefined') {
    const h = window.location.hostname;
    if (h.endsWith('.vercel.app')) return true;
    if (h.endsWith('.github.io')) return false;
  }
  return false;
}
