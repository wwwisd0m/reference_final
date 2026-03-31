import {
  checkOmokWin,
  countOmokOpenThreesAt,
  emptyOmokBoard,
  isBoardFull,
  isOmokDoubleThreeForbiddenMove,
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
  /** 현재 차례: 확정 전 착점(보드에는 아직 없음). 턴 넘기기 시 보드에 반영 */
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
    if (s.pendingPass != null) {
      const committed = commitPendingStoneToBoard(s, s.turn);
      s = committed ?? advanceTurnAfterPassOrTimeout({ ...s, pendingPass: undefined });
    } else {
      s = advanceTurnAfterPassOrTimeout(s);
    }
    if (s.winner !== 0) return s;
  }
  return s;
}

export function omokStateNeedsPersist(before: OmokGameState, after: OmokGameState): boolean {
  return (
    before.turn !== after.turn ||
    before.turnDeadline !== after.turnDeadline ||
    before.winner !== after.winner ||
    JSON.stringify(before.board) !== JSON.stringify(after.board) ||
    JSON.stringify(before.pendingPass ?? null) !== JSON.stringify(after.pendingPass ?? null) ||
    before.updatedAt !== after.updatedAt
  );
}

/** pendingPass만 보드에 올리고 승/무/턴 진행(타임아웃 처리 시 resolve 루프에서 사용) */
function commitPendingStoneToBoard(s: OmokGameState, asColor: 1 | 2): OmokGameState | null {
  if (s.winner !== 0) return null;
  if (s.turn !== asColor) return null;
  const p = s.pendingPass;
  if (p == null) return null;
  const { r, c } = p;
  if (r < 0 || r >= OMOK_SIZE || c < 0 || c >= OMOK_SIZE) return null;
  if (s.board[r][c] !== 0) return null;

  const board = cloneBoard(s.board);
  board[r][c] = asColor;

  if (checkOmokWin(board, r, c, asColor)) {
    return {
      ...s,
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
      ...s,
      board,
      turn: asColor,
      winner: 'draw',
      updatedAt: Date.now(),
      pendingPass: undefined,
      turnDeadline: undefined,
    };
  }

  return advanceTurnAfterPassOrTimeout({
    ...s,
    board,
    pendingPass: undefined,
  });
}

/** 확정 전 착점만 갱신(보드 불변). 같은 교차점 재클릭 시 취소, 다른 빈칸이면 이동. */
export function applyOmokPlaceState(
  state: OmokGameState,
  r: number,
  c: number,
  asColor: 1 | 2
): OmokGameState | null {
  const s = resolveOmokTimeouts(state);
  if (s.winner !== 0) return null;
  if (s.turn !== asColor) return null;
  if (r < 0 || r >= OMOK_SIZE || c < 0 || c >= OMOK_SIZE) return null;

  if (s.pendingPass != null) {
    if (s.pendingPass.r === r && s.pendingPass.c === c) {
      return { ...s, pendingPass: undefined, updatedAt: Date.now() };
    }
    if (s.board[r][c] !== 0) return null;
    if (isOmokDoubleThreeForbiddenMove(s.board, r, c, asColor)) return null;
    return { ...s, pendingPass: { r, c }, updatedAt: Date.now() };
  }

  if (s.board[r][c] !== 0) return null;
  if (isOmokDoubleThreeForbiddenMove(s.board, r, c, asColor)) return null;
  return { ...s, pendingPass: { r, c }, updatedAt: Date.now() };
}

/** 턴 넘기기 — pending를 보드에 반영한 뒤 승패·턴 진행. */
export function applyOmokPassTurnState(state: OmokGameState, asColor: 1 | 2): OmokGameState | null {
  const s = resolveOmokTimeouts(state);
  return commitPendingStoneToBoard(s, asColor);
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
