import {
  checkOmokWin,
  emptyOmokBoard,
  isBoardFull,
  type OmokStone,
  OMOK_SIZE,
} from './omokRules';

export type OmokWinner = 0 | 1 | 2 | 'draw';

/** 한 차례당 제한 시간(초) — UI·서버·로컬 공통 */
export const OMOK_TURN_SEC = 30;
export const OMOK_TURN_MS = OMOK_TURN_SEC * 1000;

export type OmokGameState = {
  board: OmokStone[][];
  turn: 1 | 2;
  winner: OmokWinner;
  updatedAt: number;
  /** 현재 차례가 돌을 두었지만 아직 턴 넘기기 전 */
  pendingPass?: { r: number; c: number } | null;
  /** 이번 차례 종료 시각(ms). 시간 초과 시 자동으로 턴이 넘어감 */
  turnDeadline?: number;
};

export function cloneOmokBoard(b: OmokStone[][]): OmokStone[][] {
  return b.map((row) => [...row]);
}

function cloneBoard(b: OmokStone[][]): OmokStone[][] {
  return cloneOmokBoard(b);
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

/** 구버전 저장분: deadline 없으면 부여 */
export function normalizeOmokState(state: OmokGameState): OmokGameState {
  if (state.winner !== 0) {
    return { ...state, pendingPass: undefined, turnDeadline: undefined };
  }
  if (state.turnDeadline == null) {
    return { ...state, turnDeadline: Date.now() + OMOK_TURN_MS, updatedAt: Date.now() };
  }
  return state;
}

/**
 * 제한 시간 경과 시 자동 턴 전환(돌을 안 뒀거나, 뒀지만 넘기기 전이면 그대로 보드 유지 후 전환).
 * 서버 GET/POST·로컬 읽기 시 호출.
 */
export function resolveOmokTimeouts(state: OmokGameState): OmokGameState {
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

export function omokStateNeedsPersist(before: OmokGameState, after: OmokGameState): boolean {
  return (
    before.turn !== after.turn ||
    before.turnDeadline !== after.turnDeadline ||
    before.winner !== after.winner ||
    JSON.stringify(before.pendingPass ?? null) !== JSON.stringify(after.pendingPass ?? null) ||
    before.updatedAt !== after.updatedAt
  );
}

/** 돌만 두고 턴은 유지(승/무이면 즉시 종료). */
export function applyOmokPlaceState(
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

/** 턴 넘기기 — 직전에 돌을 둔 경우에만 가능. */
export function applyOmokPassTurnState(state: OmokGameState, asColor: 1 | 2): OmokGameState | null {
  const s = resolveOmokTimeouts(state);
  if (s.winner !== 0) return null;
  if (s.turn !== asColor) return null;
  if (s.pendingPass == null) return null;
  return advanceTurnAfterPassOrTimeout({ ...s, pendingPass: undefined });
}

export function initialOmokState(): OmokGameState {
  return {
    board: emptyOmokBoard(),
    turn: 1,
    winner: 0,
    updatedAt: Date.now(),
    turnDeadline: Date.now() + OMOK_TURN_MS,
  };
}
