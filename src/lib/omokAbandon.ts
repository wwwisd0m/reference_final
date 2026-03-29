import { isRemoteLobby } from './lobbyMode';
import { getRoom, subscribeRoom } from './matchRoom';
import { postLobbyAction } from './matchRoomRemote';

const PREFIX = 'game-lobby-abandon:v1:';
const CHANNEL = 'game-lobby-abandon';

export type AbandonPayload = {
  by: 'host' | 'guest';
  ts: number;
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

export async function signalAbandon(roomId: string, role: 'host' | 'guest'): Promise<void> {
  if (isRemoteLobby()) {
    await postLobbyAction({ action: 'abandonSignal', roomId, role });
    return;
  }
  try {
    const payload: AbandonPayload = { by: role, ts: Date.now() };
    localStorage.setItem(k(roomId), JSON.stringify(payload));
    broadcast(roomId);
  } catch {
    /* noop */
  }
}

export async function clearAbandon(roomId: string): Promise<void> {
  if (isRemoteLobby()) {
    await postLobbyAction({ action: 'abandonClear', roomId });
    return;
  }
  try {
    localStorage.removeItem(k(roomId));
    broadcast(roomId);
  } catch {
    /* noop */
  }
}

export function getAbandon(roomId: string): AbandonPayload | null {
  if (!roomId) return null;
  if (isRemoteLobby()) {
    return getRoom(roomId)?.abandon ?? null;
  }
  try {
    const raw = localStorage.getItem(k(roomId));
    if (!raw) return null;
    return JSON.parse(raw) as AbandonPayload;
  } catch {
    return null;
  }
}

export function subscribeAbandon(roomId: string, cb: () => void): () => void {
  if (isRemoteLobby()) {
    return subscribeRoom(roomId, cb);
  }
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
