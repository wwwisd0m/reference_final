/** 5×5 빙고 — 오목과 분리된 순수 규칙 (API match-room.ts 와 동기화) */

import { BINGO_WORD_POOLS } from './bingoGrid';

export const BINGO_SIZE = 5;
export const BINGO_CELL_COUNT = BINGO_SIZE * BINGO_SIZE;
export const BINGO_SETUP_MS = 30_000;
export const BINGO_PLAY_TURN_MS = 15_000;

export type BingoSubjectId = 'fruit' | 'flower' | 'animal';

export const BINGO_SUBJECT_LABEL: Record<BingoSubjectId, string> = {
  fruit: '과일',
  flower: '꽃',
  animal: '동물',
};

export type BingoGamePhase = 'setup' | 'play';

export type BingoWinner = 0 | 1 | 2 | 'draw';

export type BingoEndReason = 'line' | 'full' | 'double_pass';

const POOLS: Record<BingoSubjectId, string[]> = BINGO_WORD_POOLS;

const canonicalSortedCache: Partial<Record<BingoSubjectId, string[]>> = {};

/** 정렬된 풀 순서 — markedByIndex[i] 가 이 단어에 대응 */
export function canonicalSortedWords(subjectId: BingoSubjectId): string[] {
  if (!canonicalSortedCache[subjectId]) {
    canonicalSortedCache[subjectId] = [...POOLS[subjectId]].sort();
  }
  return canonicalSortedCache[subjectId]!;
}

export function wordToCanonicalIndex(subjectId: BingoSubjectId, word: string): number {
  return canonicalSortedWords(subjectId).indexOf(word);
}

export function isWordInSubjectPool(subjectId: BingoSubjectId, word: string): boolean {
  return wordToCanonicalIndex(subjectId, word) >= 0;
}

/** 25칸 단어 나열이 해당 주제 풀과 동일(각 1회)한지 */
export function validateLayoutFlatForSubject(
  flat: string[] | null | undefined,
  subjectId: BingoSubjectId
): boolean {
  if (!flat || flat.length !== BINGO_CELL_COUNT) return false;
  const want = [...POOLS[subjectId]].sort();
  const got = [...flat].sort();
  return want.length === got.length && want.every((w, i) => w === got[i]);
}

export type BingoGameState = {
  subjectId: BingoSubjectId;
  /** 내 판 배치 (연습·로컬 병합). 서버는 동기화하지 않음 */
  labels: string[][];
  phase: BingoGamePhase;
  setupDeadline: number;
  hostReady: boolean;
  guestReady: boolean;
  turn: 1 | 2;
  /** canonicalSortedWords 순서 기준 — 같은 단어는 양쪽 판에서 동시에 표시 */
  markedByIndex: (0 | 1 | 2)[];
  pendingWord: string | null;
  turnDeadline: number;
  winner: BingoWinner;
  /** 호스트(색 1) 판 25칸 단어 — 행 우선 */
  hostLayoutFlat: string[] | null;
  /** 게스트(색 2) 판 25칸 단어 */
  guestLayoutFlat: string[] | null;
  emptyPassStreak?: number;
  endReason?: BingoEndReason;
  updatedAt: number;
};

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/** 연습 모드 등 서버·방 `subjectId` 없이 쓸 때만 사용 (매칭 빙고 주제와 무관) */
export const PRACTICE_DEFAULT_BINGO_SUBJECT: BingoSubjectId = 'fruit';

export function buildShuffledGrid5(subjectId: BingoSubjectId): string[][] {
  const pool = [...POOLS[subjectId]];
  shuffleInPlace(pool);
  const flat = pool.slice(0, BINGO_CELL_COUNT);
  const labels: string[][] = [];
  for (let r = 0; r < BINGO_SIZE; r++) {
    labels.push(flat.slice(r * BINGO_SIZE, r * BINGO_SIZE + BINGO_SIZE));
  }
  return labels;
}

export function emptyMarkedByIndex(): (0 | 1 | 2)[] {
  return Array.from({ length: BINGO_CELL_COUNT }, () => 0 as 0 | 1 | 2);
}

/** 반드시 방·서버에서 정해진 `subjectId`로 생성 (연습은 `PRACTICE_DEFAULT_BINGO_SUBJECT` 등) */
export function initialBingoState(subjectId: BingoSubjectId): BingoGameState {
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

export function resetBingoState(subjectId: BingoSubjectId = PRACTICE_DEFAULT_BINGO_SUBJECT): BingoGameState {
  return initialBingoState(subjectId);
}

/** Redis 등 구형 JSON(marked 2D) → 단어 인덱스 형식 */
export function coerceBingoGameState(raw: unknown): BingoGameState | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const subjectId = o.subjectId as BingoSubjectId;
  if (subjectId !== 'fruit' && subjectId !== 'flower' && subjectId !== 'animal') return null;

  const labelsIn =
    o.labels && Array.isArray(o.labels) && (o.labels as string[][]).length === BINGO_SIZE
      ? (o.labels as string[][])
      : null;

  function normalizeMarkVal(v: unknown): 0 | 1 | 2 {
    if (v === 1 || v === '1') return 1;
    if (v === 2 || v === '2') return 2;
    return 0;
  }

  let markedByIndex: (0 | 1 | 2)[];
  const rawMarks = o.markedByIndex as unknown[] | undefined;
  if (Array.isArray(rawMarks) && rawMarks.length === BINGO_CELL_COUNT) {
    markedByIndex = rawMarks.map((cell) => normalizeMarkVal(cell));
  } else {
    markedByIndex = emptyMarkedByIndex();
    const legacyMarked = o.marked as (0 | 1 | 2)[][] | undefined;
    const labels = labelsIn;
    if (legacyMarked && labels) {
      for (let r = 0; r < BINGO_SIZE; r++) {
        const row = labels[r];
        if (!row || row.length !== BINGO_SIZE) continue;
        for (let c = 0; c < BINGO_SIZE; c++) {
          const v = normalizeMarkVal(legacyMarked[r]?.[c]);
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
    hostReady: Boolean(o.hostReady),
    guestReady: Boolean(o.guestReady),
    turn: o.turn === 2 ? 2 : 1,
    markedByIndex,
    pendingWord,
    turnDeadline: Number(o.turnDeadline) || Date.now() + BINGO_PLAY_TURN_MS,
    winner: (o.winner === 'draw' ? 'draw' : o.winner === 2 ? 2 : o.winner === 1 ? 1 : 0) as BingoWinner,
    hostLayoutFlat: Array.isArray(o.hostLayoutFlat) ? (o.hostLayoutFlat as string[]) : null,
    guestLayoutFlat: Array.isArray(o.guestLayoutFlat) ? (o.guestLayoutFlat as string[]) : null,
    emptyPassStreak: typeof o.emptyPassStreak === 'number' ? o.emptyPassStreak : 0,
    endReason: o.endReason as BingoEndReason | undefined,
    updatedAt: Number(o.updatedAt) || Date.now(),
  };
}

export function flattenLabels(g: string[][]): string[] {
  return g.flat();
}

export function unflattenLabelsFlat(flat: string[]): string[][] {
  const out: string[][] = [];
  for (let r = 0; r < BINGO_SIZE; r++) {
    out.push(flat.slice(r * BINGO_SIZE, r * BINGO_SIZE + BINGO_SIZE));
  }
  return out;
}

export function sameLabelMultiset(a: string[][], b: string[][]): boolean {
  const x = [...flattenLabels(a)].sort();
  const y = [...flattenLabels(b)].sort();
  if (x.length !== y.length) return false;
  return x.every((v, i) => v === y[i]);
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

/** 한 플레이어의 25칸 배치(flat)에서 color 가 한 줄을 채웠는지 */
export function checkLayoutLineWin(
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
      return idx >= 0 && markedByIndex[idx] === color;
    })
  );
}

export function derivedMarkedGrid(
  labels: string[][],
  subjectId: BingoSubjectId,
  markedByIndex: (0 | 1 | 2)[]
): (0 | 1 | 2)[][] {
  return labels.map((row) =>
    row.map((word) => {
      const idx = wordToCanonicalIndex(subjectId, word);
      if (idx < 0) return 0 as 0 | 1 | 2;
      const v = markedByIndex[idx] as unknown;
      if (v === 1 || v === '1') return 1;
      if (v === 2 || v === '2') return 2;
      return 0;
    })
  );
}

export function isMarkedIndexFull(markedByIndex: (0 | 1 | 2)[]): boolean {
  return markedByIndex.every((v) => v !== 0);
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
  const { subjectId, hostLayoutFlat, guestLayoutFlat } = state;
  const p1 =
    hostLayoutFlat && validateLayoutFlatForSubject(hostLayoutFlat, subjectId)
      ? checkLayoutLineWin(hostLayoutFlat, markedByIndex, subjectId, 1)
      : false;
  const p2 =
    guestLayoutFlat && validateLayoutFlatForSubject(guestLayoutFlat, subjectId)
      ? checkLayoutLineWin(guestLayoutFlat, markedByIndex, subjectId, 2)
      : false;
  const base: BingoGameState = {
    ...state,
    markedByIndex,
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
  if (isMarkedIndexFull(markedByIndex)) {
    return { ...base, winner: 'draw', endReason: 'full' };
  }
  return advancePlayTurn({ ...base, emptyPassStreak: 0 });
}

function commitPendingMark(state: BingoGameState): BingoGameState | null {
  if (state.phase !== 'play' || state.pendingWord == null) return null;
  const color = state.turn;
  const idx = wordToCanonicalIndex(state.subjectId, state.pendingWord);
  if (idx < 0) return null;
  if (state.markedByIndex[idx] !== 0) return null;
  const nextIdx = [...state.markedByIndex];
  nextIdx[idx] = color;
  return resolveWinAfterMark(state, nextIdx);
}

/** setup → play — 반드시 호스트·게스트 모두 완료를 눌러야 함 (시간 초과만으로는 시작 안 함) */
export function tryFinishSetupPhase(state: BingoGameState): BingoGameState {
  if (state.phase !== 'setup') return state;
  const bothReady = state.hostReady && state.guestReady;
  if (!bothReady) return state;

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

export function normalizeBingoState(state: BingoGameState): BingoGameState {
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

export function resolveBingoPlayTimeouts(state: BingoGameState): BingoGameState {
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

export function resolveBingoAll(state: BingoGameState): BingoGameState {
  let s = normalizeBingoState(state);
  s = tryFinishSetupPhase(s);
  if (s.phase === 'play' && s.winner === 0) {
    s = resolveBingoPlayTimeouts(s);
  }
  return s;
}

export function bingoStateNeedsPersist(before: BingoGameState, after: BingoGameState): boolean {
  return JSON.stringify(before) !== JSON.stringify(after);
}

export function applyBingoSetupGrid(state: BingoGameState, labels: string[][]): BingoGameState | null {
  const s = resolveBingoAll(state);
  if (s.phase !== 'setup') return null;
  if (!labels || labels.length !== BINGO_SIZE) return null;
  for (const row of labels) {
    if (!row || row.length !== BINGO_SIZE) return null;
  }
  if (!sameLabelMultiset(s.labels, labels)) return null;
  return { ...s, labels, updatedAt: Date.now() };
}

/**
 * layoutFlat: 완료 시점 25단어(행 우선). 생략 시 현재 labels 로 연습 모드용.
 */
export function applyBingoSetupReady(
  state: BingoGameState,
  role: 'host' | 'guest',
  layoutFlat?: string[] | null
): BingoGameState | null {
  let s = resolveBingoAll(state);
  if (s.phase !== 'setup') return null;
  const flat = layoutFlat ?? flattenLabels(s.labels);
  if (!validateLayoutFlatForSubject(flat, s.subjectId)) return null;
  if (role === 'host') {
    s = { ...s, hostLayoutFlat: flat, hostReady: true, updatedAt: Date.now() };
  } else {
    s = { ...s, guestLayoutFlat: flat, guestReady: true, updatedAt: Date.now() };
  }
  return tryFinishSetupPhase(s);
}

export function applyBingoSelect(
  state: BingoGameState,
  word: string,
  asColor: 1 | 2
): BingoGameState | null {
  let s = resolveBingoAll(state);
  if (s.phase !== 'play' || s.winner !== 0) return null;
  s = resolveBingoPlayTimeouts(s);
  if (s.phase !== 'play' || s.winner !== 0) return null;
  if (s.turn !== asColor) return null;
  if (s.pendingWord != null) return null;
  if (!isWordInSubjectPool(s.subjectId, word)) return null;
  const idx = wordToCanonicalIndex(s.subjectId, word);
  if (idx < 0 || s.markedByIndex[idx] !== 0) return null;
  return { ...s, pendingWord: word, updatedAt: Date.now() };
}

export function applyBingoPass(state: BingoGameState, asColor: 1 | 2): BingoGameState | null {
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
