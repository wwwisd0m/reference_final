import { isRemoteLobby } from './lobbyMode';
import { getRoom, subscribeRoom } from './matchRoom';
import { postLobbyAction } from './matchRoomRemote';
import {
  applyBingoPass,
  applyBingoSelect,
  applyBingoSetupGrid,
  applyBingoSetupReady,
  bingoStateNeedsPersist,
  buildShuffledGrid5,
  coerceBingoGameState,
  flattenLabels,
  initialBingoState,
  normalizeBingoState,
  pickRandomSubject,
  resolveBingoAll,
  type BingoGameState,
  type BingoSubjectId,
} from './bingoEngine';
import { setRoom } from './matchRoomLocal';

export type { BingoGameState };

const LOCAL_LAYOUT_PREFIX = 'bingoLocalLayout:v1:';

function localLayoutStorageKey(roomId: string): string {
  return LOCAL_LAYOUT_PREFIX + roomId;
}

/** 원격: 내 판 배치만 sessionStorage — 서버와 동기화하지 않음 */
export function persistLocalBingoLayout(
  roomId: string,
  subjectId: BingoSubjectId,
  labels: string[][]
): void {
  if (!roomId) return;
  try {
    sessionStorage.setItem(localLayoutStorageKey(roomId), JSON.stringify({ subjectId, labels }));
  } catch {
    /* noop */
  }
}

function readLocalLayout(
  roomId: string,
  subjectId: BingoSubjectId
): string[][] | null {
  try {
    const raw = sessionStorage.getItem(localLayoutStorageKey(roomId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { subjectId?: string; labels?: string[][] };
    if (parsed.subjectId !== subjectId || !parsed.labels || parsed.labels.length !== 5) {
      return null;
    }
    for (const row of parsed.labels) {
      if (!Array.isArray(row) || row.length !== 5) return null;
    }
    return parsed.labels;
  } catch {
    return null;
  }
}

function mergeRemoteLabels(roomId: string, serverBingo: BingoGameState): BingoGameState {
  const cached = readLocalLayout(roomId, serverBingo.subjectId);
  if (cached) {
    return { ...serverBingo, labels: cached };
  }
  const labels = buildShuffledGrid5(serverBingo.subjectId);
  persistLocalBingoLayout(roomId, serverBingo.subjectId, labels);
  return { ...serverBingo, labels };
}

function patchLocalRoomBingo(roomId: string, nextBingo: BingoGameState): void {
  const room = getRoom(roomId);
  if (!room) return;
  setRoom(roomId, { ...room, bingo: nextBingo, updatedAt: Date.now() });
}

function normalizeFromCache(raw: BingoGameState | null | undefined): BingoGameState | null {
  if (!raw) return null;
  return coerceBingoGameState(raw) ?? raw;
}

export function getBingoGame(roomId: string): BingoGameState | null {
  const rawRoom = getRoom(roomId);
  const b = normalizeFromCache(rawRoom?.bingo ?? null);
  if (!b) return null;
  const resolved = resolveBingoAll(normalizeBingoState(b));
  if (isRemoteLobby()) {
    return mergeRemoteLabels(roomId, resolved);
  }
  if (bingoStateNeedsPersist(b, resolved)) {
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
  const subjectId = room.bingoSubjectId ?? pickRandomSubject();
  const nextBingo = initialBingoState(subjectId);
  setRoom(roomId, {
    ...room,
    bingo: nextBingo,
    bingoSubjectId: subjectId,
    updatedAt: Date.now(),
  });
}

export async function tryBingoSetupGrid(roomId: string, labels: string[][]): Promise<boolean> {
  if (isRemoteLobby()) {
    const state = getBingoGame(roomId);
    if (!state) return false;
    const next = applyBingoSetupGrid(state, labels);
    if (!next) return false;
    persistLocalBingoLayout(roomId, next.subjectId, next.labels);
    return true;
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
    const state = getBingoGame(roomId);
    if (!state) return false;
    const layoutFlat = flattenLabels(state.labels);
    const { ok } = await postLobbyAction({
      action: 'bingoReady',
      roomId,
      role,
      layoutFlat,
    });
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
  word: string,
  asColor: 1 | 2
): Promise<boolean> {
  if (isRemoteLobby()) {
    const { ok } = await postLobbyAction({ action: 'bingoSelect', roomId, word, asColor });
    return ok === true;
  }
  const state = getBingoGame(roomId);
  if (!state) return false;
  const next = applyBingoSelect(state, word, asColor);
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

export async function tryBingoReset(roomId: string): Promise<boolean> {
  if (isRemoteLobby()) {
    try {
      sessionStorage.removeItem(localLayoutStorageKey(roomId));
    } catch {
      /* noop */
    }
    const { ok } = await postLobbyAction({ action: 'bingoReset', roomId });
    return ok === true;
  }
  const room = getRoom(roomId);
  if (!room?.bingo || room.bingo.winner === 0) return false;
  const subjectId = pickRandomSubject();
  setRoom(roomId, {
    ...room,
    bingo: initialBingoState(subjectId),
    bingoSubjectId: subjectId,
    updatedAt: Date.now(),
  });
  return true;
}

export function subscribeBingoGame(roomId: string, cb: () => void): () => void {
  return subscribeRoom(roomId, cb);
}
