import { isRemoteLobby } from './lobbyMode';
import { getRoom, subscribeRoom } from './matchRoom';
import { postLobbyAction } from './matchRoomRemote';
import { emptyOmokBoard } from './omokRules';
import { applyOmokMoveState, cloneOmokBoard, type OmokGameState } from './omokEngine';

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

export function getOmokGame(roomId: string): OmokGameState | null {
  if (!roomId) return null;
  if (isRemoteLobby()) {
    return getRoom(roomId)?.omok ?? null;
  }
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
  setOmokGame(roomId, {
    board: emptyOmokBoard(),
    turn: 1,
    winner: 0,
    updatedAt: Date.now(),
  });
}

export async function ensureOmokGame(roomId: string): Promise<void> {
  if (isRemoteLobby()) {
    await postLobbyAction({ action: 'omokEnsure', roomId });
    return;
  }
  if (getOmokGame(roomId)) return;
  await resetOmokGame(roomId);
}

/**
 * 흑(1) 선공. 현재 turn과 같은 색만 둘 수 있음.
 * 승리 시 winner 설정, 무승부 시 winner === 'draw'
 */
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
  const next = applyOmokMoveState(state, r, c, asColor);
  if (!next) return false;
  setOmokGame(roomId, next);
  return true;
}

/** 로컬(연습) 모드용 — 동일 규칙, 저장소 없음 */
export { applyOmokMoveState } from './omokEngine';

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
