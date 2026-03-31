import { Redis } from '@upstash/redis';
import type { VercelRequest, VercelResponse } from '@vercel/node';

/* -------------------------------------------------------------------------- */
/* 오목 (API 단일 파일 — Vercel 번들에서 형제 모듈 누락 방지. src/lib/omokEngine 과 동기화) */
/* -------------------------------------------------------------------------- */

const OMOK_SIZE = 15;
type OmokStone = 0 | 1 | 2;
type OmokWinner = 0 | 1 | 2 | 'draw';

const OMOK_TURN_MS = 30_000;

type OmokGameState = {
  board: OmokStone[][];
  turn: 1 | 2;
  winner: OmokWinner;
  updatedAt: number;
  pendingPass?: { r: number; c: number } | null;
  turnDeadline?: number;
};

function emptyOmokBoard(): OmokStone[][] {
  return Array.from({ length: OMOK_SIZE }, () =>
    Array.from({ length: OMOK_SIZE }, () => 0 as OmokStone)
  );
}

function countLine(
  board: OmokStone[][],
  r: number,
  c: number,
  dr: number,
  dc: number,
  color: 1 | 2
): number {
  let n = 0;
  let rr = r + dr;
  let cc = c + dc;
  while (
    rr >= 0 &&
    rr < OMOK_SIZE &&
    cc >= 0 &&
    cc < OMOK_SIZE &&
    board[rr][cc] === color
  ) {
    n++;
    rr += dr;
    cc += dc;
  }
  return n;
}

const OMOK_LINE_DIRS: [number, number][] = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

function checkOmokWin(board: OmokStone[][], r: number, c: number, color: 1 | 2): boolean {
  for (const [dr, dc] of OMOK_LINE_DIRS) {
    const total = 1 + countLine(board, r, c, dr, dc, color) + countLine(board, r, c, -dr, -dc, color);
    if (total >= 5) return true;
  }
  return false;
}

function countOmokOpenThreesAt(board: OmokStone[][], r: number, c: number, color: 1 | 2): number {
  let total = 0;
  for (const [dr, dc] of OMOK_LINE_DIRS) {
    let tMin = 0;
    let tMax = 0;
    while (true) {
      const nr = r + (tMin - 1) * dr;
      const nc = c + (tMin - 1) * dc;
      if (nr < 0 || nr >= OMOK_SIZE || nc < 0 || nc >= OMOK_SIZE || board[nr][nc] !== color) break;
      tMin--;
    }
    while (true) {
      const nr = r + (tMax + 1) * dr;
      const nc = c + (tMax + 1) * dc;
      if (nr < 0 || nr >= OMOK_SIZE || nc < 0 || nc >= OMOK_SIZE || board[nr][nc] !== color) break;
      tMax++;
    }
    for (let a = tMin; a <= tMax - 2; a++) {
      if (a > 0 || a + 2 < 0) continue;
      const lr = r + (a - 1) * dr;
      const lc = c + (a - 1) * dc;
      const rr = r + (a + 3) * dr;
      const rc = c + (a + 3) * dc;
      if (lr < 0 || lr >= OMOK_SIZE || lc < 0 || lc >= OMOK_SIZE) continue;
      if (rr < 0 || rr >= OMOK_SIZE || rc < 0 || rc >= OMOK_SIZE) continue;
      if (board[lr][lc] !== 0 || board[rr][rc] !== 0) continue;
      total++;
    }
  }
  return total;
}

function isBoardFull(board: OmokStone[][]): boolean {
  for (let r = 0; r < OMOK_SIZE; r++) {
    for (let c = 0; c < OMOK_SIZE; c++) {
      if (board[r][c] === 0) return false;
    }
  }
  return true;
}

function cloneBoard(b: OmokStone[][]): OmokStone[][] {
  return b.map((row) => [...row]);
}

function advanceTurnAfterPassOrTimeout(state: OmokGameState): OmokGameState {
  const nextTurn: 1 | 2 = state.turn === 1 ? 2 : 1;
  return {
    ...state,
    turn: nextTurn,
    pendingPass: undefined,
    turnDeadline: Date.now() + OMOK_TURN_MS,
    updatedAt: Date.now(),
  };
}

function normalizeOmokState(state: OmokGameState): OmokGameState {
  if (state.winner !== 0) {
    return { ...state, pendingPass: undefined, turnDeadline: undefined };
  }
  if (state.turnDeadline == null) {
    return { ...state, turnDeadline: Date.now() + OMOK_TURN_MS, updatedAt: Date.now() };
  }
  return state;
}

function resolveOmokTimeouts(state: OmokGameState): OmokGameState {
  let s = normalizeOmokState(state);
  if (s.winner !== 0) return s;
  for (let i = 0; i < 8; i++) {
    const dl = s.turnDeadline ?? Date.now() + OMOK_TURN_MS;
    if (Date.now() <= dl) {
      return { ...s, turnDeadline: dl };
    }
    s = advanceTurnAfterPassOrTimeout({ ...s, pendingPass: undefined });
    if (s.winner !== 0) return s;
  }
  return s;
}

function omokStateNeedsPersist(before: OmokGameState, after: OmokGameState): boolean {
  return (
    before.turn !== after.turn ||
    before.turnDeadline !== after.turnDeadline ||
    before.winner !== after.winner ||
    JSON.stringify(before.pendingPass ?? null) !== JSON.stringify(after.pendingPass ?? null) ||
    before.updatedAt !== after.updatedAt
  );
}

function applyOmokPlaceState(
  state: OmokGameState,
  r: number,
  c: number,
  asColor: 1 | 2
): OmokGameState | null {
  const s = resolveOmokTimeouts(state);
  if (s.winner !== 0) return null;
  if (s.turn !== asColor) return null;
  if (s.pendingPass != null) return null;
  if (r < 0 || r >= OMOK_SIZE || c < 0 || c >= OMOK_SIZE) return null;
  if (s.board[r][c] !== 0) return null;

  const board = cloneBoard(s.board);
  board[r][c] = asColor;

  if (checkOmokWin(board, r, c, asColor)) {
    return {
      board,
      turn: asColor,
      winner: asColor,
      updatedAt: Date.now(),
      pendingPass: undefined,
      turnDeadline: undefined,
    };
  }

  if (countOmokOpenThreesAt(board, r, c, asColor) >= 2) {
    return null;
  }

  if (isBoardFull(board)) {
    return {
      board,
      turn: asColor,
      winner: 'draw',
      updatedAt: Date.now(),
      pendingPass: undefined,
      turnDeadline: undefined,
    };
  }

  return {
    ...s,
    board,
    pendingPass: { r, c },
    updatedAt: Date.now(),
  };
}

function applyOmokPassTurnState(state: OmokGameState, asColor: 1 | 2): OmokGameState | null {
  const s = resolveOmokTimeouts(state);
  if (s.winner !== 0) return null;
  if (s.turn !== asColor) return null;
  if (s.pendingPass == null) return null;
  return advanceTurnAfterPassOrTimeout({ ...s, pendingPass: undefined });
}

function initialOmokState(): OmokGameState {
  return {
    board: emptyOmokBoard(),
    turn: 1,
    winner: 0,
    updatedAt: Date.now(),
    turnDeadline: Date.now() + OMOK_TURN_MS,
  };
}

/* 빙고 — src/lib/bingoEngine.ts 와 동기화 */
/** 5×5 빙고 — 오목과 분리된 순수 규칙 (API match-room.ts 와 동기화) */

const BINGO_SIZE = 5;
const BINGO_CELL_COUNT = 25;
const BINGO_SETUP_MS = 30_000;
const BINGO_PLAY_TURN_MS = 15_000;

type BingoSubjectId = 'fruit' | 'flower' | 'animal';

type BingoGamePhase = 'setup' | 'play';

type BingoWinner = 0 | 1 | 2 | 'draw';

type BingoEndReason = 'line' | 'full' | 'double_pass';

type BingoGameState = {
  subjectId: BingoSubjectId;
  labels: string[][];
  phase: BingoGamePhase;
  setupDeadline: number;
  hostReady: boolean;
  guestReady: boolean;
  turn: 1 | 2;
  markedByIndex: (0 | 1 | 2)[];
  pendingWord: string | null;
  turnDeadline: number;
  winner: BingoWinner;
  hostLayoutFlat: string[] | null;
  guestLayoutFlat: string[] | null;
  emptyPassStreak?: number;
  endReason?: BingoEndReason;
  updatedAt: number;
};

/* src/lib/bingoGrid.ts 와 동일 목록 유지 */
const FRUIT_POOL = [
  '사과',
  '바나나',
  '오렌지',
  '귤',
  '딸기',
  '망고',
  '포도',
  '배',
  '참외',
  '수박',
  '두리안',
  '레몬',
  '체리',
  '키위',
  '복숭아',
  '무화과',
  '매실',
  '블루베리',
  '유자',
  '감',
  '자두',
  '용과',
  '자몽',
  '파인애플',
  '석류',
];

const FLOWER_POOL = [
  '민들레',
  '해바라기',
  '장미',
  '국화',
  '나팔꽃',
  '무궁화',
  '초롱꽃',
  '은방울꽃',
  '데이지',
  '수선화',
  '벚꽃',
  '개나리',
  '히아신스',
  '팬지',
  '연꽃',
  '목련',
  '패랭이꽃',
  '카네이션',
  '구절초',
  '동백꽃',
  '수국',
  '봉선화',
  '코스모스',
  '튤립',
  '할미꽃',
];

const ANIMAL_POOL = [
  '개',
  '고양이',
  '낙타',
  '타조',
  '비둘기',
  '펭귄',
  '곰',
  '호랑이',
  '사자',
  '말',
  '치타',
  '사슴',
  '두더지',
  '코끼리',
  '원숭이',
  '햄스터',
  '앵무새',
  '다람쥐',
  '너구리',
  '하마',
  '캥거루',
  '늑대',
  '박쥐',
  '토끼',
  '여우',
];

const POOLS: Record<BingoSubjectId, string[]> = {
  fruit: FRUIT_POOL,
  flower: FLOWER_POOL,
  animal: ANIMAL_POOL,
};

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function pickRandomSubject(): BingoSubjectId {
  const keys: BingoSubjectId[] = ['fruit', 'flower', 'animal'];
  return keys[Math.floor(Math.random() * keys.length)];
}

function buildShuffledGrid5(subjectId: BingoSubjectId): string[][] {
  const pool = [...POOLS[subjectId]];
  shuffleInPlace(pool);
  const flat = pool.slice(0, BINGO_CELL_COUNT);
  const labels: string[][] = [];
  for (let r = 0; r < BINGO_SIZE; r++) {
    labels.push(flat.slice(r * BINGO_SIZE, r * BINGO_SIZE + BINGO_SIZE));
  }
  return labels;
}

const canonicalSortedCache: Partial<Record<BingoSubjectId, string[]>> = {};

function canonicalSortedWords(subjectId: BingoSubjectId): string[] {
  if (!canonicalSortedCache[subjectId]) {
    canonicalSortedCache[subjectId] = [...POOLS[subjectId]].sort();
  }
  return canonicalSortedCache[subjectId]!;
}

function wordToCanonicalIndex(subjectId: BingoSubjectId, word: string): number {
  return canonicalSortedWords(subjectId).indexOf(word);
}

function isWordInSubjectPool(subjectId: BingoSubjectId, word: string): boolean {
  return wordToCanonicalIndex(subjectId, word) >= 0;
}

function validateLayoutFlatForSubject(flat: string[] | null | undefined, subjectId: BingoSubjectId): boolean {
  if (!flat || flat.length !== BINGO_CELL_COUNT) return false;
  const want = [...POOLS[subjectId]].sort();
  const got = [...flat].sort();
  return want.length === got.length && want.every((w, i) => w === got[i]);
}

function emptyMarkedByIndex(): (0 | 1 | 2)[] {
  return Array.from({ length: BINGO_CELL_COUNT }, () => 0 as 0 | 1 | 2);
}

/** `Boolean("false")===true` 방지 — true | 1 | '1' 만 참 */
function coerceRedisBool(v: unknown): boolean {
  return v === true || v === 1 || v === '1';
}

function normalizeMarkCell(v: unknown): 0 | 1 | 2 {
  if (v === 1 || v === '1') return 1;
  if (v === 2 || v === '2') return 2;
  return 0;
}

function coerceBingoWinner(w: unknown): BingoWinner {
  if (w === 'draw') return 'draw';
  if (w === 2 || w === '2') return 2;
  if (w === 1 || w === '1') return 1;
  return 0;
}

function coerceBingoTurn(t: unknown): 1 | 2 {
  return t === 2 || t === '2' ? 2 : 1;
}

function coerceBingoFromRedis(raw: unknown): BingoGameState | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const subjectId = o.subjectId as BingoSubjectId;
  if (subjectId !== 'fruit' && subjectId !== 'flower' && subjectId !== 'animal') return null;

  const labelsIn =
    o.labels && Array.isArray(o.labels) && (o.labels as string[][]).length === BINGO_SIZE
      ? (o.labels as string[][])
      : null;

  let markedByIndex = o.markedByIndex as unknown[] | undefined;
  if (Array.isArray(markedByIndex) && markedByIndex.length === BINGO_CELL_COUNT) {
    markedByIndex = markedByIndex.map((cell) => normalizeMarkCell(cell)) as (0 | 1 | 2)[];
  } else {
    markedByIndex = emptyMarkedByIndex();
    const legacyMarked = o.marked as (0 | 1 | 2)[][] | undefined;
    const labels = labelsIn;
    if (legacyMarked && labels) {
      for (let r = 0; r < BINGO_SIZE; r++) {
        const row = labels[r];
        if (!row || row.length !== BINGO_SIZE) continue;
        for (let c = 0; c < BINGO_SIZE; c++) {
          const v = normalizeMarkCell(legacyMarked[r]?.[c]);
          if (v === 0) continue;
          const idx = wordToCanonicalIndex(subjectId, row[c] ?? '');
          if (idx >= 0) markedByIndex[idx] = v;
        }
      }
    }
  }

  const labels = labelsIn ?? buildShuffledGrid5(subjectId);

  const pendingWord =
    typeof o.pendingWord === 'string'
      ? o.pendingWord
      : (() => {
          const pm = o.pendingMark as { r?: number; c?: number } | null | undefined;
          if (pm != null && typeof pm.r === 'number' && typeof pm.c === 'number') {
            const rr = labels[pm.r]?.[pm.c];
            return typeof rr === 'string' ? rr : null;
          }
          return null;
        })();

  return {
    subjectId,
    labels,
    phase: o.phase === 'play' ? 'play' : 'setup',
    setupDeadline: Number(o.setupDeadline) || Date.now() + BINGO_SETUP_MS,
    hostReady: coerceRedisBool(o.hostReady),
    guestReady: coerceRedisBool(o.guestReady),
    turn: coerceBingoTurn(o.turn),
    markedByIndex,
    pendingWord,
    turnDeadline: Number(o.turnDeadline) || Date.now() + BINGO_PLAY_TURN_MS,
    winner: coerceBingoWinner(o.winner),
    hostLayoutFlat: Array.isArray(o.hostLayoutFlat) ? (o.hostLayoutFlat as string[]) : null,
    guestLayoutFlat: Array.isArray(o.guestLayoutFlat) ? (o.guestLayoutFlat as string[]) : null,
    emptyPassStreak: typeof o.emptyPassStreak === 'number' ? o.emptyPassStreak : 0,
    endReason: o.endReason as BingoEndReason | undefined,
    updatedAt: Number(o.updatedAt) || Date.now(),
  };
}

function flattenLabels(g: string[][]): string[] {
  return g.flat();
}

function initialBingoStateForSubject(subjectId: BingoSubjectId): BingoGameState {
  return {
    subjectId,
    labels: buildShuffledGrid5(subjectId),
    phase: 'setup',
    setupDeadline: Date.now() + BINGO_SETUP_MS,
    hostReady: false,
    guestReady: false,
    turn: 1,
    markedByIndex: emptyMarkedByIndex(),
    pendingWord: null,
    turnDeadline: Date.now() + BINGO_PLAY_TURN_MS,
    winner: 0,
    hostLayoutFlat: null,
    guestLayoutFlat: null,
    emptyPassStreak: 0,
    updatedAt: Date.now(),
  };
}

const LINE_INDEXES: [number, number][][] = [
  ...Array.from({ length: BINGO_SIZE }, (_, r) =>
    Array.from({ length: BINGO_SIZE }, (_, c) => [r, c] as [number, number])
  ),
  ...Array.from({ length: BINGO_SIZE }, (_, c) =>
    Array.from({ length: BINGO_SIZE }, (_, r) => [r, c] as [number, number])
  ),
  [
    [0, 0],
    [1, 1],
    [2, 2],
    [3, 3],
    [4, 4],
  ],
  [
    [0, 4],
    [1, 3],
    [2, 2],
    [3, 1],
    [4, 0],
  ],
];

function flatCellIndex(r: number, c: number): number {
  return r * BINGO_SIZE + c;
}

function checkLayoutLineWin(
  flat25: string[],
  markedByIndex: (0 | 1 | 2)[],
  subjectId: BingoSubjectId,
  color: 1 | 2
): boolean {
  if (flat25.length !== BINGO_CELL_COUNT) return false;
  return LINE_INDEXES.some((line) =>
    line.every(([r, c]) => {
      const w = flat25[flatCellIndex(r, c)];
      const idx = wordToCanonicalIndex(subjectId, w);
      return idx >= 0 && normalizeMarkCell(markedByIndex[idx]) === color;
    })
  );
}

function isMarkedIndexFull(markedByIndex: (0 | 1 | 2)[]): boolean {
  return markedByIndex.every((v) => normalizeMarkCell(v) !== 0);
}

function advancePlayTurn(state: BingoGameState): BingoGameState {
  const nextTurn: 1 | 2 = state.turn === 1 ? 2 : 1;
  return {
    ...state,
    turn: nextTurn,
    pendingWord: null,
    turnDeadline: Date.now() + BINGO_PLAY_TURN_MS,
    updatedAt: Date.now(),
  };
}

function applyEmptyPassAdvance(state: BingoGameState, passer: 1 | 2): BingoGameState {
  const streak = (state.emptyPassStreak ?? 0) + 1;
  if (streak >= 2) {
    const winner: 1 | 2 = passer === 1 ? 2 : 1;
    return {
      ...state,
      winner,
      endReason: 'double_pass',
      emptyPassStreak: 0,
      pendingWord: null,
      updatedAt: Date.now(),
    };
  }
  return advancePlayTurn({ ...state, emptyPassStreak: streak });
}

function resolveWinAfterMark(
  state: BingoGameState,
  markedByIndex: (0 | 1 | 2)[]
): BingoGameState {
  const marks = markedByIndex.map((v) => normalizeMarkCell(v));
  const { subjectId, hostLayoutFlat, guestLayoutFlat } = state;
  const p1 =
    hostLayoutFlat && validateLayoutFlatForSubject(hostLayoutFlat, subjectId)
      ? checkLayoutLineWin(hostLayoutFlat, marks, subjectId, 1)
      : false;
  const p2 =
    guestLayoutFlat && validateLayoutFlatForSubject(guestLayoutFlat, subjectId)
      ? checkLayoutLineWin(guestLayoutFlat, marks, subjectId, 2)
      : false;
  const base: BingoGameState = {
    ...state,
    markedByIndex: marks,
    pendingWord: null,
    updatedAt: Date.now(),
  };
  if (p1 && p2) {
    return { ...base, winner: 'draw', endReason: 'line' };
  }
  if (p1) {
    return { ...base, winner: 1, endReason: 'line' };
  }
  if (p2) {
    return { ...base, winner: 2, endReason: 'line' };
  }
  if (isMarkedIndexFull(marks)) {
    return { ...base, winner: 'draw', endReason: 'full' };
  }
  return advancePlayTurn({ ...base, emptyPassStreak: 0 });
}

function commitPendingMark(state: BingoGameState): BingoGameState | null {
  if (state.phase !== 'play' || state.pendingWord == null) return null;
  const color = state.turn;
  const idx = wordToCanonicalIndex(state.subjectId, state.pendingWord);
  if (idx < 0) return null;
  const nextIdx = state.markedByIndex.map((v) => normalizeMarkCell(v));
  if (nextIdx[idx] !== 0) return null;
  nextIdx[idx] = color;
  return resolveWinAfterMark(state, nextIdx);
}

function tryFinishSetupPhase(state: BingoGameState): BingoGameState {
  if (state.phase !== 'setup') return state;
  if (state.hostReady !== true || state.guestReady !== true) return state;

  let hostLayoutFlat = state.hostLayoutFlat;
  let guestLayoutFlat = state.guestLayoutFlat;
  if (!hostLayoutFlat || !validateLayoutFlatForSubject(hostLayoutFlat, state.subjectId)) {
    hostLayoutFlat = flattenLabels(buildShuffledGrid5(state.subjectId));
  }
  if (!guestLayoutFlat || !validateLayoutFlatForSubject(guestLayoutFlat, state.subjectId)) {
    guestLayoutFlat = flattenLabels(buildShuffledGrid5(state.subjectId));
  }

  return {
    ...state,
    phase: 'play',
    turn: 1,
    hostLayoutFlat,
    guestLayoutFlat,
    markedByIndex: emptyMarkedByIndex(),
    pendingWord: null,
    turnDeadline: Date.now() + BINGO_PLAY_TURN_MS,
    emptyPassStreak: 0,
    endReason: undefined,
    updatedAt: Date.now(),
  };
}

function normalizeBingoState(state: BingoGameState): BingoGameState {
  if (state.winner !== 0 && state.winner !== 'draw') {
    return { ...state, pendingWord: null };
  }
  if (state.phase === 'setup') {
    if (state.setupDeadline == null) {
      return { ...state, setupDeadline: Date.now() + BINGO_SETUP_MS, updatedAt: Date.now() };
    }
    return tryFinishSetupPhase(state);
  }
  if (state.turnDeadline == null && state.winner === 0) {
    return { ...state, turnDeadline: Date.now() + BINGO_PLAY_TURN_MS, updatedAt: Date.now() };
  }
  return state;
}

function resolveBingoPlayTimeouts(state: BingoGameState): BingoGameState {
  let s = normalizeBingoState(state);
  if (s.phase !== 'play' || s.winner !== 0) return s;
  for (let i = 0; i < 16; i++) {
    const dl = s.turnDeadline ?? Date.now() + BINGO_PLAY_TURN_MS;
    if (Date.now() <= dl) {
      return { ...s, turnDeadline: dl };
    }
    if (s.pendingWord != null) {
      const committed = commitPendingMark(s);
      if (!committed) {
        return applyEmptyPassAdvance({ ...s, pendingWord: null }, s.turn);
      }
      s = committed;
      if (s.winner !== 0) return s;
      continue;
    }
    s = applyEmptyPassAdvance(s, s.turn);
  }
  return s;
}

function resolveBingoAll(state: BingoGameState): BingoGameState {
  let s = normalizeBingoState(state);
  s = tryFinishSetupPhase(s);
  if (s.phase === 'play' && s.winner === 0) {
    s = resolveBingoPlayTimeouts(s);
  }
  return s;
}

function bingoStateNeedsPersist(before: BingoGameState, after: BingoGameState): boolean {
  return JSON.stringify(before) !== JSON.stringify(after);
}

function applyBingoSetupReady(
  state: BingoGameState,
  role: 'host' | 'guest',
  layoutFlat: string[]
): BingoGameState | null {
  let s = resolveBingoAll(state);
  if (s.phase !== 'setup') return null;
  if (!validateLayoutFlatForSubject(layoutFlat, s.subjectId)) return null;
  if (role === 'host') {
    s = { ...s, hostLayoutFlat: layoutFlat, hostReady: true, updatedAt: Date.now() };
  } else {
    s = { ...s, guestLayoutFlat: layoutFlat, guestReady: true, updatedAt: Date.now() };
  }
  return tryFinishSetupPhase(s);
}

function applyBingoSelect(state: BingoGameState, word: string, asColor: 1 | 2): BingoGameState | null {
  let s = resolveBingoAll(state);
  if (s.phase !== 'play' || s.winner !== 0) return null;
  s = resolveBingoPlayTimeouts(s);
  if (s.phase !== 'play' || s.winner !== 0) return null;
  if (s.turn !== asColor) return null;
  if (s.pendingWord != null) return null;
  if (!isWordInSubjectPool(s.subjectId, word)) return null;
  const idx = wordToCanonicalIndex(s.subjectId, word);
  if (idx < 0) return null;
  const nextIdx = s.markedByIndex.map((v) => normalizeMarkCell(v));
  if (nextIdx[idx] !== 0) return null;
  nextIdx[idx] = asColor;
  return resolveWinAfterMark(s, nextIdx);
}

function applyBingoPass(state: BingoGameState, asColor: 1 | 2): BingoGameState | null {
  let s = resolveBingoAll(state);
  if (s.phase !== 'play' || s.winner !== 0) return null;
  s = resolveBingoPlayTimeouts(s);
  if (s.phase !== 'play' || s.winner !== 0) return null;
  if (s.turn !== asColor) return null;
  if (s.pendingWord != null) {
    return commitPendingMark(s);
  }
  return applyEmptyPassAdvance(s, asColor);
}


/* -------------------------------------------------------------------------- */
/* 매칭 로비 + Redis */
/* -------------------------------------------------------------------------- */

type RoomStatus = 'waiting' | 'joined' | 'started' | 'cancelled';

type RematchState = {
  hostFinal: boolean;
  guestFinal: boolean;
  deadline: number;
};

type AbandonPayload = {
  by: 'host' | 'guest';
  ts: number;
};

type StoredRoom = {
  hostNickname: string;
  guestNickname: string | null;
  gameId: string;
  status: RoomStatus;
  updatedAt: number;
  /** 빙고 방: 호스트 `ensure` 시 1회 랜덤 결정. 오목은 null */
  subjectId: BingoSubjectId | null;
  omok: OmokGameState | null;
  bingo: BingoGameState | null;
  rematch: RematchState | null;
  abandon: AbandonPayload | null;
};

const KEY_PREFIX = 'match-lobby:v1:';
const TTL_SEC = 60 * 60;

function roomKey(roomId: string): string {
  return `${KEY_PREFIX}${roomId}`;
}

function sanitizeNick(raw: string): string {
  const trimmed = raw.replace(/[^\p{L}\p{N}]/gu, '');
  return trimmed.slice(0, 8) || '';
}

function isBingoSubjectId(v: unknown): v is BingoSubjectId {
  return v === 'fruit' || v === 'flower' || v === 'animal';
}

/** 레거시 `bingoSubjectId`·빈 페이로드까지 `subjectId`로 통일 */
function normalize(r: StoredRoom & { bingoSubjectId?: BingoSubjectId | null }): StoredRoom {
  let subjectId: BingoSubjectId | null = null;
  if (isBingoSubjectId(r.subjectId)) {
    subjectId = r.subjectId;
  } else if (isBingoSubjectId(r.bingoSubjectId)) {
    subjectId = r.bingoSubjectId;
  } else if (r.bingo && isBingoSubjectId(r.bingo.subjectId)) {
    subjectId = r.bingo.subjectId;
  }
  if (r.gameId !== 'bingo') {
    subjectId = null;
  }

  let bingo: BingoGameState | null = r.bingo ?? null;
  if (bingo != null) {
    const c = coerceBingoFromRedis(bingo);
    if (c) bingo = c;
  }

  return {
    hostNickname: r.hostNickname,
    guestNickname: r.guestNickname,
    gameId: r.gameId,
    status: r.status,
    updatedAt: r.updatedAt,
    subjectId,
    omok: r.omok ?? null,
    bingo,
    rematch: r.rematch ?? null,
    abandon: r.abandon ?? null,
  };
}

let _redis: Redis | null = null;

function getRedis(): Redis {
  if (_redis) return _redis;
  const url = (
    process.env.KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL ||
    ''
  ).trim();
  const token = (
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    ''
  ).trim();
  if (!url || !token) {
    throw new Error(
      'Redis REST 자격 증명 없음: KV_REST_* 또는 UPSTASH_REDIS_REST_* 환경 변수 필요'
    );
  }
  _redis = new Redis({ url, token });
  return _redis;
}

async function getRoom(roomId: string): Promise<StoredRoom | null> {
  const raw = await getRedis().get<StoredRoom>(roomKey(roomId));
  if (raw == null) return null;
  return normalize(raw as StoredRoom);
}

async function save(roomId: string, room: StoredRoom): Promise<void> {
  await getRedis().set(roomKey(roomId), normalize(room), { ex: TTL_SEC });
}

async function getRoomWithResolvedOmok(roomId: string): Promise<StoredRoom | null> {
  const room = await getRoom(roomId);
  if (!room?.omok || room.omok.winner !== 0) return room;
  const omok = resolveOmokTimeouts(normalizeOmokState(room.omok));
  if (!omokStateNeedsPersist(room.omok, omok)) {
    return { ...room, omok };
  }
  const next: StoredRoom = { ...room, omok, updatedAt: Date.now() };
  await save(roomId, next);
  return next;
}

async function getRoomResolved(roomId: string): Promise<StoredRoom | null> {
  let room = await getRoom(roomId);
  if (!room) return null;
  let patched = false;
  if (room.omok && room.omok.winner === 0) {
    const omok = resolveOmokTimeouts(normalizeOmokState(room.omok));
    if (omokStateNeedsPersist(room.omok, omok)) {
      room = { ...room, omok, updatedAt: Date.now() };
      patched = true;
    } else {
      room = { ...room, omok };
    }
  }
  if (room.bingo) {
    const bingo = resolveBingoAll(normalizeBingoState(room.bingo));
    if (bingoStateNeedsPersist(room.bingo, bingo)) {
      room = { ...room, bingo, updatedAt: Date.now() };
      patched = true;
    } else {
      room = { ...room, bingo };
    }
  }
  if (patched) await save(roomId, room);
  return room;
}

function parseBingoLayoutFlatBody(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length !== BINGO_CELL_COUNT) return null;
  return raw.map((c) => String(c ?? ''));
}

const playOk = (s: RoomStatus) => s === 'joined' || s === 'started';

function queryPing(req: VercelRequest): boolean {
  const p = req.query.ping;
  const v = Array.isArray(p) ? p[0] : p;
  return String(v ?? '') === '1';
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    if (req.method === 'GET') {
      if (queryPing(req)) {
        const pong = await getRedis().ping();
        res.status(200).json({ ok: true, storage: 'redis', ping: pong });
        return;
      }
      const roomId = String(
        Array.isArray(req.query.roomId) ? req.query.roomId[0] : (req.query.roomId ?? '')
      );
      if (!roomId) {
        res.status(400).json({ error: 'roomId required' });
        return;
      }
      const room = await getRoomResolved(roomId);
      res.status(200).json({ room });
      return;
    }

    if (req.method === 'POST') {
      const body = (typeof req.body === 'object' && req.body !== null ? req.body : {}) as Record<
        string,
        unknown
      >;
      const action = String(body.action ?? '');
      const roomId = String(body.roomId ?? '');

      if (!roomId) {
        res.status(400).json({ error: 'roomId required' });
        return;
      }

      if (action === 'ensure') {
        const hostNickname = String(body.hostNickname ?? '');
        const gameId = String(body.gameId ?? 'omok');
        const host = sanitizeNick(hostNickname) || 'host';
        const existing = await getRoom(roomId);

        if (!existing) {
          const next: StoredRoom = {
            hostNickname: host,
            guestNickname: null,
            gameId,
            status: 'waiting',
            updatedAt: Date.now(),
            subjectId: gameId === 'bingo' ? pickRandomSubject() : null,
            omok: null,
            bingo: null,
            rematch: null,
            abandon: null,
          };
          await save(roomId, next);
          res.status(200).json({ room: next });
          return;
        }

        if (existing.status === 'cancelled' || existing.status === 'started') {
          const next: StoredRoom = {
            hostNickname: host,
            guestNickname: null,
            gameId,
            status: 'waiting',
            updatedAt: Date.now(),
            subjectId: gameId === 'bingo' ? pickRandomSubject() : null,
            omok: null,
            bingo: null,
            rematch: null,
            abandon: null,
          };
          await save(roomId, next);
          res.status(200).json({ room: next });
          return;
        }

        const next: StoredRoom = {
          ...existing,
          hostNickname: host,
          gameId,
          updatedAt: Date.now(),
        };
        if (gameId !== 'bingo') {
          next.subjectId = null;
        } else if (existing.gameId !== 'bingo') {
          next.subjectId = pickRandomSubject();
        }
        await save(roomId, next);
        res.status(200).json({ room: next });
        return;
      }

      if (action === 'join') {
        const guestNickname = String(body.guestNickname ?? '');
        const room = await getRoom(roomId);
        if (!room || room.status !== 'waiting' || room.guestNickname) {
          res.status(200).json({ room: room ?? null, ok: false });
          return;
        }
        const guest = sanitizeNick(guestNickname) || 'guest';
        const next: StoredRoom = {
          ...room,
          guestNickname: guest,
          status: 'joined',
          updatedAt: Date.now(),
        };
        await save(roomId, next);
        res.status(200).json({ room: next, ok: true });
        return;
      }

      if (action === 'start') {
        const room = await getRoom(roomId);
        if (!room) {
          res.status(200).json({ room: null });
          return;
        }
        const next: StoredRoom = {
          ...room,
          status: 'started',
          updatedAt: Date.now(),
        };
        await save(roomId, next);
        res.status(200).json({ room: next });
        return;
      }

      if (action === 'cancel') {
        const room = await getRoom(roomId);
        if (!room) {
          res.status(200).json({ room: null });
          return;
        }
        const next: StoredRoom = {
          ...room,
          status: 'cancelled',
          updatedAt: Date.now(),
          subjectId: null,
          omok: null,
          bingo: null,
          rematch: null,
          abandon: null,
        };
        await save(roomId, next);
        res.status(200).json({ room: next });
        return;
      }

      if (action === 'omokEnsure') {
        const room = await getRoom(roomId);
        if (!room || !playOk(room.status)) {
          res.status(200).json({ room: room ?? null, ok: false });
          return;
        }
        const omok = room.omok ?? initialOmokState();
        const next: StoredRoom = { ...room, omok, updatedAt: Date.now() };
        await save(roomId, next);
        res.status(200).json({ room: next, ok: true });
        return;
      }

      if (action === 'omokReset') {
        const room = await getRoom(roomId);
        if (!room || !playOk(room.status)) {
          res.status(200).json({ room: room ?? null, ok: false });
          return;
        }
        const next: StoredRoom = {
          ...room,
          omok: initialOmokState(),
          rematch: null,
          abandon: null,
          updatedAt: Date.now(),
        };
        await save(roomId, next);
        res.status(200).json({ room: next, ok: true });
        return;
      }

      if (action === 'omokMove') {
        let room = await getRoomWithResolvedOmok(roomId);
        if (!room || !playOk(room.status)) {
          res.status(200).json({ room: room ?? null, ok: false });
          return;
        }
        const r = Number(body.r);
        const c = Number(body.c);
        const asColor = body.asColor === 2 ? 2 : 1;
        let state = room.omok;
        if (!state) {
          state = initialOmokState();
        }
        state = resolveOmokTimeouts(normalizeOmokState(state));
        const nextState = applyOmokPlaceState(state, r, c, asColor);
        if (!nextState) {
          res.status(200).json({ room, ok: false });
          return;
        }
        const next: StoredRoom = {
          ...room,
          omok: nextState,
          updatedAt: Date.now(),
        };
        await save(roomId, next);
        res.status(200).json({ room: next, ok: true });
        return;
      }

      if (action === 'omokPass') {
        let room = await getRoomWithResolvedOmok(roomId);
        if (!room || !playOk(room.status)) {
          res.status(200).json({ room: room ?? null, ok: false });
          return;
        }
        const asColor = body.asColor === 2 ? 2 : 1;
        let state = room.omok;
        if (!state) {
          state = initialOmokState();
        }
        state = resolveOmokTimeouts(normalizeOmokState(state));
        const nextState = applyOmokPassTurnState(state, asColor);
        if (!nextState) {
          res.status(200).json({ room, ok: false });
          return;
        }
        const next: StoredRoom = {
          ...room,
          omok: nextState,
          updatedAt: Date.now(),
        };
        await save(roomId, next);
        res.status(200).json({ room: next, ok: true });
        return;
      }

      if (action === 'bingoEnsure') {
        const room = await getRoom(roomId);
        if (!room || !playOk(room.status) || room.gameId !== 'bingo') {
          res.status(200).json({ room: room ?? null, ok: false });
          return;
        }
        const normalized = normalize(room);
        let subjectId: BingoSubjectId | undefined = isBingoSubjectId(normalized.subjectId)
          ? normalized.subjectId
          : normalized.bingo?.subjectId;
        if (!isBingoSubjectId(subjectId)) {
          subjectId = pickRandomSubject();
        }
        const bingo = normalized.bingo ?? initialBingoStateForSubject(subjectId);
        const bingoAligned =
          bingo.subjectId === subjectId
            ? bingo
            : { ...bingo, subjectId, labels: buildShuffledGrid5(subjectId) };
        const next: StoredRoom = {
          ...normalized,
          bingo: bingoAligned,
          subjectId,
          updatedAt: Date.now(),
        };
        await save(roomId, next);
        res.status(200).json({ room: next, ok: true });
        return;
      }

      if (action === 'bingoGrid') {
        const room = await getRoomResolved(roomId);
        if (!room || !playOk(room.status) || room.gameId !== 'bingo' || !room.bingo) {
          res.status(200).json({ room: room ?? null, ok: false });
          return;
        }
        res.status(200).json({ room, ok: true });
        return;
      }

      if (action === 'bingoReady') {
        let room = await getRoomResolved(roomId);
        if (!room || !playOk(room.status) || room.gameId !== 'bingo' || !room.bingo) {
          res.status(200).json({ room: room ?? null, ok: false });
          return;
        }
        const layoutFlat = parseBingoLayoutFlatBody(body.layoutFlat);
        if (!layoutFlat) {
          res.status(200).json({ room, ok: false });
          return;
        }
        const role = body.role === 'guest' ? 'guest' : 'host';
        const nextBingo = applyBingoSetupReady(room.bingo, role, layoutFlat);
        if (!nextBingo) {
          res.status(200).json({ room, ok: false });
          return;
        }
        const next: StoredRoom = { ...room, bingo: nextBingo, updatedAt: Date.now() };
        await save(roomId, next);
        const out = (await getRoomResolved(roomId)) ?? next;
        res.status(200).json({ room: out, ok: true });
        return;
      }

      if (action === 'bingoSelect') {
        let room = await getRoomResolved(roomId);
        if (!room || !playOk(room.status) || room.gameId !== 'bingo' || !room.bingo) {
          res.status(200).json({ room: room ?? null, ok: false });
          return;
        }
        const word = String(body.word ?? '');
        const asColor = body.asColor === 2 ? 2 : 1;
        const nextBingo = applyBingoSelect(room.bingo, word, asColor);
        if (!nextBingo) {
          res.status(200).json({ room, ok: false });
          return;
        }
        const next: StoredRoom = { ...room, bingo: nextBingo, updatedAt: Date.now() };
        await save(roomId, next);
        res.status(200).json({ room: next, ok: true });
        return;
      }

      if (action === 'bingoPass') {
        let room = await getRoomResolved(roomId);
        if (!room || !playOk(room.status) || room.gameId !== 'bingo' || !room.bingo) {
          res.status(200).json({ room: room ?? null, ok: false });
          return;
        }
        const asColor = body.asColor === 2 ? 2 : 1;
        const nextBingo = applyBingoPass(room.bingo, asColor);
        if (!nextBingo) {
          res.status(200).json({ room, ok: false });
          return;
        }
        const next: StoredRoom = { ...room, bingo: nextBingo, updatedAt: Date.now() };
        await save(roomId, next);
        res.status(200).json({ room: next, ok: true });
        return;
      }

      if (action === 'bingoReset') {
        const room = await getRoom(roomId);
        if (!room || !playOk(room.status) || room.gameId !== 'bingo' || !room.bingo) {
          res.status(200).json({ room: room ?? null, ok: false });
          return;
        }
        if (room.bingo.winner === 0) {
          res.status(200).json({ room, ok: false });
          return;
        }
        const subjectId = isBingoSubjectId(room.subjectId)
          ? room.subjectId
          : room.bingo.subjectId;
        const next: StoredRoom = {
          ...room,
          bingo: initialBingoStateForSubject(subjectId),
          subjectId,
          updatedAt: Date.now(),
        };
        await save(roomId, next);
        res.status(200).json({ room: next, ok: true });
        return;
      }

      if (action === 'rematchEnsure') {
        const room = await getRoom(roomId);
        if (!room || !playOk(room.status)) {
          res.status(200).json({ room: room ?? null, ok: false });
          return;
        }
        if (room.rematch) {
          res.status(200).json({ room, ok: true });
          return;
        }
        const rematch: RematchState = {
          hostFinal: false,
          guestFinal: false,
          deadline: Date.now() + 15_000,
        };
        const next: StoredRoom = { ...room, rematch, updatedAt: Date.now() };
        await save(roomId, next);
        res.status(200).json({ room: next, ok: true });
        return;
      }

      if (action === 'rematchPress') {
        const role = body.role === 'guest' ? 'guest' : 'host';
        const room = await getRoom(roomId);
        if (!room || !room.rematch || Date.now() > room.rematch.deadline) {
          res.status(200).json({ room: room ?? null, ok: false });
          return;
        }
        const rematch: RematchState = {
          ...room.rematch,
          hostFinal: role === 'host' ? true : room.rematch.hostFinal,
          guestFinal: role === 'guest' ? true : room.rematch.guestFinal,
        };
        const next: StoredRoom = { ...room, rematch, updatedAt: Date.now() };
        await save(roomId, next);
        res.status(200).json({ room: next, ok: true });
        return;
      }

      if (action === 'rematchClear') {
        const room = await getRoom(roomId);
        if (!room) {
          res.status(200).json({ room: null, ok: false });
          return;
        }
        const next: StoredRoom = { ...room, rematch: null, updatedAt: Date.now() };
        await save(roomId, next);
        res.status(200).json({ room: next, ok: true });
        return;
      }

      if (action === 'abandonSignal') {
        const role = body.role === 'guest' ? 'guest' : 'host';
        const room = await getRoom(roomId);
        if (!room) {
          res.status(200).json({ room: null, ok: false });
          return;
        }
        const abandon: AbandonPayload = { by: role, ts: Date.now() };
        const next: StoredRoom = { ...room, abandon, updatedAt: Date.now() };
        await save(roomId, next);
        res.status(200).json({ room: next, ok: true });
        return;
      }

      if (action === 'abandonClear') {
        const room = await getRoom(roomId);
        if (!room) {
          res.status(200).json({ room: null, ok: false });
          return;
        }
        const next: StoredRoom = { ...room, abandon: null, updatedAt: Date.now() };
        await save(roomId, next);
        res.status(200).json({ room: next, ok: true });
        return;
      }

      res.status(400).json({ error: 'unknown action' });
      return;
    }

    res.setHeader('Allow', 'GET, POST');
    res.status(405).end();
  } catch (err) {
    console.error('[match-room] error', err);
    if (!res.headersSent) {
      res.status(503).json({ error: 'Storage temporarily unavailable' });
    }
  }
}
