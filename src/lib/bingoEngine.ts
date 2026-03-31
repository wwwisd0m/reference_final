/** 5×5 빙고 — 오목과 분리된 순수 규칙 (API match-room.ts 와 동기화) */

import { BINGO_WORD_POOLS } from './bingoGrid';

export const BINGO_SIZE = 5;
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

export type BingoGameState = {
  subjectId: BingoSubjectId;
  labels: string[][];
  phase: BingoGamePhase;
  setupDeadline: number;
  hostReady: boolean;
  guestReady: boolean;
  turn: 1 | 2;
  marked: (0 | 1 | 2)[][];
  pendingMark: { r: number; c: number } | null;
  turnDeadline: number;
  winner: BingoWinner;
  /** 연속으로 '돌 없이' 턴이 넘어간 횟수 (표시 확정 시 0으로 리셋) */
  emptyPassStreak?: number;
  /** 게임 종료 사유 (승패 모달용) */
  endReason?: BingoEndReason;
  updatedAt: number;
};

const POOLS: Record<BingoSubjectId, string[]> = BINGO_WORD_POOLS;

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

export function pickRandomSubject(): BingoSubjectId {
  const keys: BingoSubjectId[] = ['fruit', 'flower', 'animal'];
  return keys[Math.floor(Math.random() * keys.length)];
}

export function buildShuffledGrid5(subjectId: BingoSubjectId): string[][] {
  const pool = [...POOLS[subjectId]];
  shuffleInPlace(pool);
  const flat = pool.slice(0, 25);
  const labels: string[][] = [];
  for (let r = 0; r < BINGO_SIZE; r++) {
    labels.push(flat.slice(r * BINGO_SIZE, r * BINGO_SIZE + BINGO_SIZE));
  }
  return labels;
}

export function emptyMarked(): (0 | 1 | 2)[][] {
  return Array.from({ length: BINGO_SIZE }, () =>
    Array.from({ length: BINGO_SIZE }, () => 0 as 0 | 1 | 2)
  );
}

/** `subjectId` 생략 시 연습 모드용 랜덤 주제 */
export function initialBingoState(subjectId?: BingoSubjectId): BingoGameState {
  const id = subjectId ?? pickRandomSubject();
  return {
    subjectId: id,
    labels: buildShuffledGrid5(id),
    phase: 'setup',
    setupDeadline: Date.now() + BINGO_SETUP_MS,
    hostReady: false,
    guestReady: false,
    turn: 1,
    marked: emptyMarked(),
    pendingMark: null,
    turnDeadline: Date.now() + BINGO_PLAY_TURN_MS,
    winner: 0,
    emptyPassStreak: 0,
    updatedAt: Date.now(),
  };
}

/** 종료 후 재대국 시 동일 진입점 */
export const resetBingoState = (): BingoGameState => initialBingoState();

export function flattenLabels(g: string[][]): string[] {
  return g.flat();
}

export function sameLabelMultiset(a: string[][], b: string[][]): boolean {
  const x = [...flattenLabels(a)].sort();
  const y = [...flattenLabels(b)].sort();
  if (x.length !== y.length) return false;
  return x.every((v, i) => v === y[i]);
}

function cloneMarked(m: (0 | 1 | 2)[][]): (0 | 1 | 2)[][] {
  return m.map((row) => [...row]);
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

export function checkBingoLineWin(marked: (0 | 1 | 2)[][], color: 1 | 2): boolean {
  return LINE_INDEXES.some((line) => line.every(([r, c]) => marked[r][c] === color));
}

export function isMarkedBoardFull(marked: (0 | 1 | 2)[][]): boolean {
  for (let r = 0; r < BINGO_SIZE; r++) {
    for (let c = 0; c < BINGO_SIZE; c++) {
      if (marked[r][c] === 0) return false;
    }
  }
  return true;
}

function advancePlayTurn(state: BingoGameState): BingoGameState {
  const nextTurn: 1 | 2 = state.turn === 1 ? 2 : 1;
  return {
    ...state,
    turn: nextTurn,
    pendingMark: null,
    turnDeadline: Date.now() + BINGO_PLAY_TURN_MS,
    updatedAt: Date.now(),
  };
}

/** 빈 턴(표시 없이 넘김) 누적 2회 시 직전에 패스한 쪽 패배 처리 */
function applyEmptyPassAdvance(state: BingoGameState, passer: 1 | 2): BingoGameState {
  const streak = (state.emptyPassStreak ?? 0) + 1;
  if (streak >= 2) {
    const winner: 1 | 2 = passer === 1 ? 2 : 1;
    return {
      ...state,
      winner,
      endReason: 'double_pass',
      emptyPassStreak: 0,
      pendingMark: null,
      updatedAt: Date.now(),
    };
  }
  return advancePlayTurn({ ...state, emptyPassStreak: streak });
}

function commitPendingMark(state: BingoGameState): BingoGameState | null {
  if (state.phase !== 'play' || state.pendingMark == null) return null;
  const { r, c } = state.pendingMark;
  const color = state.turn;
  if (state.marked[r][c] !== 0) return null;
  const marked = cloneMarked(state.marked);
  marked[r][c] = color;
  const next: BingoGameState = {
    ...state,
    marked,
    pendingMark: null,
    updatedAt: Date.now(),
  };
  if (checkBingoLineWin(marked, color)) {
    return { ...next, winner: color, endReason: 'line' };
  }
  if (isMarkedBoardFull(marked)) {
    return { ...next, winner: 'draw', endReason: 'full' };
  }
  return advancePlayTurn({ ...next, emptyPassStreak: 0 });
}

/** setup → play (둘 다 준비 또는 시간 초과) */
export function tryFinishSetupPhase(state: BingoGameState): BingoGameState {
  if (state.phase !== 'setup') return state;
  const timeUp = Date.now() > state.setupDeadline;
  const bothReady = state.hostReady && state.guestReady;
  if (!timeUp && !bothReady) return state;
  return {
    ...state,
    phase: 'play',
    turn: 1,
    marked: emptyMarked(),
    pendingMark: null,
    turnDeadline: Date.now() + BINGO_PLAY_TURN_MS,
    emptyPassStreak: 0,
    endReason: undefined,
    updatedAt: Date.now(),
  };
}

export function normalizeBingoState(state: BingoGameState): BingoGameState {
  if (state.winner !== 0 && state.winner !== 'draw') {
    return { ...state, pendingMark: null };
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

/** 플레이 페이즈 제한 시간 — pending 있으면 확정 후 턴 넘김, 없으면 그냥 턴 넘김 */
export function resolveBingoPlayTimeouts(state: BingoGameState): BingoGameState {
  let s = normalizeBingoState(state);
  if (s.phase !== 'play' || s.winner !== 0) return s;
  for (let i = 0; i < 16; i++) {
    const dl = s.turnDeadline ?? Date.now() + BINGO_PLAY_TURN_MS;
    if (Date.now() <= dl) {
      return { ...s, turnDeadline: dl };
    }
    if (s.pendingMark != null) {
      const committed = commitPendingMark(s);
      if (!committed) {
        return applyEmptyPassAdvance({ ...s, pendingMark: null }, s.turn);
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

export function applyBingoSetupReady(state: BingoGameState, role: 'host' | 'guest'): BingoGameState | null {
  let s = resolveBingoAll(state);
  if (s.phase !== 'setup') return null;
  if (role === 'host') s = { ...s, hostReady: true, updatedAt: Date.now() };
  else s = { ...s, guestReady: true, updatedAt: Date.now() };
  return tryFinishSetupPhase(s);
}

export function applyBingoSelect(
  state: BingoGameState,
  r: number,
  c: number,
  asColor: 1 | 2
): BingoGameState | null {
  let s = resolveBingoAll(state);
  if (s.phase !== 'play' || s.winner !== 0) return null;
  s = resolveBingoPlayTimeouts(s);
  if (s.phase !== 'play' || s.winner !== 0) return null;
  if (s.turn !== asColor) return null;
  if (s.pendingMark != null) return null;
  if (r < 0 || r >= BINGO_SIZE || c < 0 || c >= BINGO_SIZE) return null;
  if (s.marked[r][c] !== 0) return null;
  return { ...s, pendingMark: { r, c }, updatedAt: Date.now() };
}

export function applyBingoPass(state: BingoGameState, asColor: 1 | 2): BingoGameState | null {
  let s = resolveBingoAll(state);
  if (s.phase !== 'play' || s.winner !== 0) return null;
  s = resolveBingoPlayTimeouts(s);
  if (s.phase !== 'play' || s.winner !== 0) return null;
  if (s.turn !== asColor) return null;
  if (s.pendingMark != null) {
    const next = commitPendingMark(s);
    return next;
  }
  return applyEmptyPassAdvance(s, asColor);
}
