import { isRemoteLobby } from './lobbyMode';
import { getRoom, subscribeRoom } from './matchRoom';
import { postLobbyAction } from './matchRoomRemote';
import {
  applyOmokPassTurnState,
  applyOmokPlaceState,
  cloneOmokBoard,
  initialOmokState,
  normalizeOmokState,
  omokStateNeedsPersist,
  resolveOmokTimeouts,
  type OmokGameState,
} from './omokEngine';

const PREFIX = 'game-lobby-omok:v1:';
const CHANNEL = 'game-lobby-omok';

export type OmokWinner = import('./omokEngine').OmokWinner;
export type { OmokGameState };

function key(roomId: string): string {
  return PREFIX + roomId;
}

function broadcast(roomId: string): void {
  try {
    const bc = new BroadcastChannel(CHANNEL);
    bc.postMessage({ type: 'omok-update', roomId });
    bc.close();
  } catch {
    /* noop */
  }
}

export { cloneOmokBoard };

function readRawOmok(roomId: string): OmokGameState | null {
  if (!roomId) return null;
  try {
    const raw = localStorage.getItem(key(roomId));
    if (!raw) return null;
    const o = JSON.parse(raw) as OmokGameState;
    if (!o.board || o.board.length !== 15) return null;
    return o;
  } catch {
    return null;
  }
}

export function getOmokGame(roomId: string): OmokGameState | null {
  if (isRemoteLobby()) {
    const omok = getRoom(roomId)?.omok ?? null;
    if (!omok) return null;
    return resolveOmokTimeouts(normalizeOmokState(omok));
  }
  const raw = readRawOmok(roomId);
  if (!raw) return null;
  const normalized = normalizeOmokState(raw);
  const resolved = resolveOmokTimeouts(normalized);
  if (omokStateNeedsPersist(raw, resolved)) {
    setOmokGame(roomId, resolved);
  }
  return resolved;
}

export function setOmokGame(roomId: string, state: OmokGameState): void {
  if (isRemoteLobby()) return;
  try {
    localStorage.setItem(key(roomId), JSON.stringify(state));
    broadcast(roomId);
  } catch {
    /* noop */
  }
}

export async function resetOmokGame(roomId: string): Promise<void> {
  if (isRemoteLobby()) {
    await postLobbyAction({ action: 'omokReset', roomId });
    return;
  }
  setOmokGame(roomId, initialOmokState());
}

export async function ensureOmokGame(roomId: string): Promise<void> {
  if (isRemoteLobby()) {
    await postLobbyAction({ action: 'omokEnsure', roomId });
    return;
  }
  if (getOmokGame(roomId)) return;
  await resetOmokGame(roomId);
}

export async function tryOmokMove(
  roomId: string,
  r: number,
  c: number,
  asColor: 1 | 2
): Promise<boolean> {
  if (isRemoteLobby()) {
    const { ok } = await postLobbyAction({
      action: 'omokMove',
      roomId,
      r,
      c,
      asColor,
    });
    return ok === true;
  }
  const state = getOmokGame(roomId);
  if (!state) return false;
  const next = applyOmokPlaceState(state, r, c, asColor);
  if (!next) return false;
  setOmokGame(roomId, next);
  return true;
}

export async function tryOmokPassTurn(roomId: string, asColor: 1 | 2): Promise<boolean> {
  if (isRemoteLobby()) {
    const { ok } = await postLobbyAction({
      action: 'omokPass',
      roomId,
      asColor,
    });
    return ok === true;
  }
  const state = getOmokGame(roomId);
  if (!state) return false;
  const next = applyOmokPassTurnState(state, asColor);
  if (!next) return false;
  setOmokGame(roomId, next);
  return true;
}

export { applyOmokPlaceState, applyOmokPassTurnState } from './omokEngine';

export function subscribeOmokGame(roomId: string, cb: () => void): () => void {
  if (isRemoteLobby()) {
    return subscribeRoom(roomId, cb);
  }
  const onStorage = (e: StorageEvent) => {
    if (e.key === key(roomId)) cb();
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
