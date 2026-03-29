import { isRemoteLobby } from './lobbyMode';
import { getRoom, subscribeRoom } from './matchRoom';
import { postLobbyAction } from './matchRoomRemote';
import {
  applyBingoPass,
  applyBingoSelect,
  applyBingoSetupGrid,
  applyBingoSetupReady,
  bingoStateNeedsPersist,
  initialBingoState,
  normalizeBingoState,
  resolveBingoAll,
  type BingoGameState,
} from './bingoEngine';
import { setRoom } from './matchRoomLocal';

export type { BingoGameState };

function patchLocalRoomBingo(roomId: string, nextBingo: BingoGameState): void {
  const room = getRoom(roomId);
  if (!room) return;
  setRoom(roomId, { ...room, bingo: nextBingo, updatedAt: Date.now() });
}

export function getBingoGame(roomId: string): BingoGameState | null {
  if (isRemoteLobby()) {
    const b = getRoom(roomId)?.bingo ?? null;
    if (!b) return null;
    return resolveBingoAll(normalizeBingoState(b));
  }
  const room = getRoom(roomId);
  if (!room?.bingo) return null;
  const raw = room.bingo;
  const resolved = resolveBingoAll(normalizeBingoState(raw));
  if (bingoStateNeedsPersist(raw, resolved)) {
    patchLocalRoomBingo(roomId, resolved);
  }
  return resolved;
}

export async function ensureBingoGame(roomId: string): Promise<void> {
  if (isRemoteLobby()) {
    await postLobbyAction({ action: 'bingoEnsure', roomId });
    return;
  }
  const room = getRoom(roomId);
  if (!room || room.gameId !== 'bingo') return;
  if (room.bingo) return;
  patchLocalRoomBingo(roomId, initialBingoState());
}

export async function tryBingoSetupGrid(roomId: string, labels: string[][]): Promise<boolean> {
  if (isRemoteLobby()) {
    const { ok } = await postLobbyAction({ action: 'bingoGrid', roomId, labels });
    return ok === true;
  }
  const state = getBingoGame(roomId);
  if (!state) return false;
  const next = applyBingoSetupGrid(state, labels);
  if (!next) return false;
  patchLocalRoomBingo(roomId, next);
  return true;
}

export async function tryBingoSetupReady(roomId: string, role: 'host' | 'guest'): Promise<boolean> {
  if (isRemoteLobby()) {
    const { ok } = await postLobbyAction({ action: 'bingoReady', roomId, role });
    return ok === true;
  }
  const state = getBingoGame(roomId);
  if (!state) return false;
  const next = applyBingoSetupReady(state, role);
  if (!next) return false;
  patchLocalRoomBingo(roomId, next);
  return true;
}

export async function tryBingoSelect(
  roomId: string,
  r: number,
  c: number,
  asColor: 1 | 2
): Promise<boolean> {
  if (isRemoteLobby()) {
    const { ok } = await postLobbyAction({ action: 'bingoSelect', roomId, r, c, asColor });
    return ok === true;
  }
  const state = getBingoGame(roomId);
  if (!state) return false;
  const next = applyBingoSelect(state, r, c, asColor);
  if (!next) return false;
  patchLocalRoomBingo(roomId, next);
  return true;
}

export async function tryBingoPass(roomId: string, asColor: 1 | 2): Promise<boolean> {
  if (isRemoteLobby()) {
    const { ok } = await postLobbyAction({ action: 'bingoPass', roomId, asColor });
    return ok === true;
  }
  const state = getBingoGame(roomId);
  if (!state) return false;
  const next = applyBingoPass(state, asColor);
  if (!next) return false;
  patchLocalRoomBingo(roomId, next);
  return true;
}

/** 종료된 판 이후 새 주제·그리드로 재시작 (원격: bingoReset) */
export async function tryBingoReset(roomId: string): Promise<boolean> {
  if (isRemoteLobby()) {
    const { ok } = await postLobbyAction({ action: 'bingoReset', roomId });
    return ok === true;
  }
  const room = getRoom(roomId);
  if (!room?.bingo || room.bingo.winner === 0) return false;
  patchLocalRoomBingo(roomId, initialBingoState());
  return true;
}

export function subscribeBingoGame(roomId: string, cb: () => void): () => void {
  return subscribeRoom(roomId, cb);
}
