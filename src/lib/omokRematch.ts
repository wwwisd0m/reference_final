const PREFIX = 'game-lobby-rematch:v1:';
const CHANNEL = 'game-lobby-rematch';

export const REMATCH_SECONDS = 15;

export type RematchState = {
  hostFinal: boolean;
  guestFinal: boolean;
  /** 이 시각 이후 미완료 시 홈으로 */
  deadline: number;
};

function k(roomId: string): string {
  return PREFIX + roomId;
}

function broadcast(roomId: string): void {
  try {
    const bc = new BroadcastChannel(CHANNEL);
    bc.postMessage({ roomId });
    bc.close();
  } catch {
    /* noop */
  }
}

export function getRematch(roomId: string): RematchState | null {
  if (!roomId) return null;
  try {
    const raw = localStorage.getItem(k(roomId));
    if (!raw) return null;
    return JSON.parse(raw) as RematchState;
  } catch {
    return null;
  }
}

export function setRematch(roomId: string, state: RematchState): void {
  try {
    localStorage.setItem(k(roomId), JSON.stringify(state));
    broadcast(roomId);
  } catch {
    /* noop */
  }
}

export function clearRematch(roomId: string): void {
  try {
    localStorage.removeItem(k(roomId));
    broadcast(roomId);
  } catch {
    /* noop */
  }
}

/** 게임 종료 직후 한 번만 — 양쪽 클라이언트가 동시에 호출해도 최초 1회만 생성 */
export function ensureRematchAfterGameEnd(roomId: string): void {
  if (getRematch(roomId)) return;
  setRematch(roomId, {
    hostFinal: false,
    guestFinal: false,
    deadline: Date.now() + REMATCH_SECONDS * 1000,
  });
}

export function pressRematchFinal(roomId: string, role: 'host' | 'guest'): void {
  const r = getRematch(roomId);
  if (!r || Date.now() > r.deadline) return;
  const next: RematchState = {
    ...r,
    hostFinal: role === 'host' ? true : r.hostFinal,
    guestFinal: role === 'guest' ? true : r.guestFinal,
  };
  setRematch(roomId, next);
}

export function subscribeRematch(roomId: string, cb: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === k(roomId)) cb();
  };
  window.addEventListener('storage', onStorage);
  let bc: BroadcastChannel | null = null;
  try {
    bc = new BroadcastChannel(CHANNEL);
    bc.onmessage = (ev: MessageEvent<{ roomId?: string }>) => {
      if (ev.data?.roomId === roomId) cb();
    };
  } catch {
    /* noop */
  }
  return () => {
    window.removeEventListener('storage', onStorage);
    bc?.close();
  };
}
