import {
  checkOmokWin,
  emptyOmokBoard,
  isBoardFull,
  type OmokStone,
  OMOK_SIZE,
} from './omokRules';

export type OmokWinner = 0 | 1 | 2 | 'draw';

export type OmokGameState = {
  board: OmokStone[][];
  turn: 1 | 2;
  winner: OmokWinner;
  updatedAt: number;
};

export function cloneOmokBoard(b: OmokStone[][]): OmokStone[][] {
  return b.map((row) => [...row]);
}

function cloneBoard(b: OmokStone[][]): OmokStone[][] {
  return cloneOmokBoard(b);
}

/** 흑(1) 선공. 현재 turn과 같은 색만 둘 수 있음. */
export function applyOmokMoveState(
  state: OmokGameState,
  r: number,
  c: number,
  asColor: 1 | 2
): OmokGameState | null {
  if (state.winner !== 0) return null;
  if (state.turn !== asColor) return null;
  if (r < 0 || r >= OMOK_SIZE || c < 0 || c >= OMOK_SIZE) return null;
  if (state.board[r][c] !== 0) return null;

  const board = cloneBoard(state.board);
  board[r][c] = asColor;

  if (checkOmokWin(board, r, c, asColor)) {
    return {
      board,
      turn: asColor,
      winner: asColor,
      updatedAt: Date.now(),
    };
  }

  if (isBoardFull(board)) {
    return {
      board,
      turn: asColor,
      winner: 'draw',
      updatedAt: Date.now(),
    };
  }

  const nextTurn: 1 | 2 = asColor === 1 ? 2 : 1;
  return {
    board,
    turn: nextTurn,
    winner: 0,
    updatedAt: Date.now(),
  };
}

export function initialOmokState(): OmokGameState {
  return {
    board: emptyOmokBoard(),
    turn: 1,
    winner: 0,
    updatedAt: Date.now(),
  };
}
