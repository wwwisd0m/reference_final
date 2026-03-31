import type { RoomState } from './matchRoomLocal';
import { isRemoteLobby } from './lobbyMode';

export type PlayGameId = 'omok' | 'bingo';

/**
 * `/play/*?guest=1&room=<roomId>` 로 직접 들어온 경우 sessionStorage 보강.
 * `MatchPage`는 `useSearchParams`로 `/match/:gameId?guest=1&room=` 를 처리함.
 */
export function syncPlaySessionFromUrl(): void {
  if (typeof window === 'undefined') return;
  const sp = new URLSearchParams(window.location.search);
  const room = sp.get('room')?.trim();
  if (!room) return;
  if (sp.get('guest') !== '1') return;
  sessionStorage.setItem('playRoomId', room);
  sessionStorage.setItem('matchRole', 'guest');
}

/**
 * 플레이 페이지에서 `getRoom` 스냅샷 기준으로 이탈할 경로.
 * - `null`: 유지(원격에서 아직 캐시 없음 → 폴링 대기)
 * - `string`: `navigate(..., { replace: true })`
 */
export function playPageExitPathIfInvalid(roomSnap: RoomState | null, expected: PlayGameId): string | null {
  if (roomSnap == null) {
    return isRemoteLobby() ? null : '/';
  }
  if (roomSnap.status === 'cancelled') return '/';
  if (roomSnap.gameId !== expected) {
    if (roomSnap.gameId === 'omok') return '/play/omok';
    if (roomSnap.gameId === 'bingo') return '/play/bingo';
    return '/';
  }
  return null;
}
