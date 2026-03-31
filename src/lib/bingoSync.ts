import { isRemoteLobby } from './lobbyMode';
import { getRoom, subscribeRoom } from './matchRoom';
import { postLobbyAction } from './matchRoomRemote';
import {
  applyBingoPass,
  applyBingoSelect,
  applyBingoSetupGrid,
  applyBingoSetupReady,
  bingoStateNeedsPersist,
  BINGO_CELL_COUNT,
  BINGO_SIZE,
  buildShuffledGrid5,
  coerceBingoGameState,
  coerceBingoWinner,
  flattenLabels,
  initialBingoState,
  normalizeBingoState,
  resolveBingoAll,
  unflattenLabelsFlat,
  validateLayoutFlatForSubject,
  type BingoGameState,
  type BingoSubjectId,
} from './bingoEngine';
import { setRoom } from './matchRoomLocal';

export type { BingoGameState };

function isRoomBingoSubject(v: unknown): v is BingoSubjectId {
  return v === 'fruit' || v === 'flower' || v === 'animal';
}

const LOCAL_LAYOUT_PREFIX = 'bingoLocalLayout:v1:';

function localLayoutStorageKey(roomId: string): string {
  return LOCAL_LAYOUT_PREFIX + roomId;
}

/** 원격: 내 판 배치만 sessionStorage — 서버는 동기화하지 않음 */
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

function isSquareLabels5(labels: string[][] | undefined): boolean {
  return !!(
    labels &&
    labels.length === BINGO_SIZE &&
    labels.every((row) => Array.isArray(row) && row.length === BINGO_SIZE)
  );
}

function remoteMatchRole(): 'host' | 'guest' | null {
  try {
    const r = sessionStorage.getItem('matchRole');
    if (r === 'host' || r === 'guest') return r;
  } catch {
    /* noop */
  }
  return null;
}

/**
 * 원격: 서버 `labels`(ensure 1회) + 완료 시 `hostLayoutFlat`/`guestLayoutFlat`.
 * 역할별로 내 배치만 `labels`에 넣고, 클라에서 임의 `buildShuffledGrid5`로 서로 다른 판을 만들지 않음.
 */
function mergeRemoteBingoForRole(
  roomId: string,
  roomSubjectId: BingoSubjectId | null | undefined,
  serverBingo: BingoGameState,
  role: 'host' | 'guest'
): BingoGameState {
  const sid = isRoomBingoSubject(roomSubjectId) ? roomSubjectId : serverBingo.subjectId;
  const base: BingoGameState =
    serverBingo.subjectId === sid
      ? serverBingo
      : { ...serverBingo, subjectId: sid, labels: buildShuffledGrid5(sid) };

  const myReady = role === 'host' ? base.hostReady === true : base.guestReady === true;
  const myFlat = role === 'host' ? base.hostLayoutFlat : base.guestLayoutFlat;
  const hasValidMine =
    Array.isArray(myFlat) &&
    myFlat.length === BINGO_CELL_COUNT &&
    validateLayoutFlatForSubject(myFlat, base.subjectId);

  if (hasValidMine && (base.phase === 'play' || myReady)) {
    return { ...base, labels: unflattenLabelsFlat(myFlat) };
  }

  const cached = readLocalLayout(roomId, sid);
  if (cached) {
    return { ...base, labels: cached };
  }

  if (isSquareLabels5(base.labels)) {
    return base;
  }

  const labels = buildShuffledGrid5(sid);
  persistLocalBingoLayout(roomId, sid, labels);
  return { ...base, labels };
}

function mergeRemoteBingoNoRole(
  roomSubjectId: BingoSubjectId | null | undefined,
  serverBingo: BingoGameState
): BingoGameState {
  const sid = isRoomBingoSubject(roomSubjectId) ? roomSubjectId : serverBingo.subjectId;
  const base: BingoGameState =
    serverBingo.subjectId === sid
      ? serverBingo
      : { ...serverBingo, subjectId: sid, labels: buildShuffledGrid5(sid) };
  if (isSquareLabels5(base.labels)) return base;
  return { ...base, labels: buildShuffledGrid5(sid) };
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

/**
 * 원격(Upstash): GET은 서버 `getRoomResolved`에서 이미 `resolveBingoAll`(플레이 타임아웃) 반영.
 * 클라에서 `resolveBingoPlayTimeouts`를 다시 돌리면 기기 시각 차이로 `turn`이 서버와 어긋날 수 있음.
 */
function sanitizeRemoteBingoState(state: BingoGameState): BingoGameState {
  const winner = coerceBingoWinner(state.winner as unknown);
  const base = winner !== state.winner ? { ...state, winner } : state;
  if (base.winner !== 0 && base.winner !== 'draw') {
    return { ...base, pendingWord: null };
  }
  return base;
}

export function getBingoGame(roomId: string): BingoGameState | null {
  const rawRoom = getRoom(roomId);
  const roomSubjectId = rawRoom?.subjectId;
  const b = normalizeFromCache(rawRoom?.bingo ?? null);
  if (!b) return null;
  if (isRemoteLobby()) {
    const role = remoteMatchRole();
    const merged =
      role != null
        ? mergeRemoteBingoForRole(roomId, roomSubjectId, b, role)
        : mergeRemoteBingoNoRole(roomSubjectId, b);
    return sanitizeRemoteBingoState(merged);
  }
  let resolved = resolveBingoAll(normalizeBingoState(b));
  if (isRoomBingoSubject(roomSubjectId) && resolved.subjectId !== roomSubjectId) {
    resolved = {
      ...resolved,
      subjectId: roomSubjectId,
      labels: buildShuffledGrid5(roomSubjectId),
    };
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
  const subjectId = isRoomBingoSubject(room.subjectId) ? room.subjectId : null;
  if (!subjectId) return;
  const nextBingo = initialBingoState(subjectId);
  setRoom(roomId, {
    ...room,
    bingo: nextBingo,
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
  const subjectId = isRoomBingoSubject(room.subjectId)
    ? room.subjectId
    : room.bingo.subjectId;
  setRoom(roomId, {
    ...room,
    bingo: initialBingoState(subjectId),
    updatedAt: Date.now(),
  });
  return true;
}

export function subscribeBingoGame(roomId: string, cb: () => void): () => void {
  return subscribeRoom(roomId, cb);
}
