/**
 * Vercel Serverless 번들이 `../src/` 를 안 잡는 경우가 있어 API 전용 복본.
 * 클라이언트 규칙과 맞추려면 `src/lib/omokRules.ts`, `src/lib/omokEngine.ts` 와 동기화할 것.
 */

const OMOK_SIZE = 15;
type OmokStone = 0 | 1 | 2;

export type OmokWinner = 0 | 1 | 2 | 'draw';

export type OmokGameState = {
  board: OmokStone[][];
  turn: 1 | 2;
  winner: OmokWinner;
  updatedAt: number;
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

function checkOmokWin(board: OmokStone[][], r: number, c: number, color: 1 | 2): boolean {
  const dirs: [number, number][] = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];
  for (const [dr, dc] of dirs) {
    const total = 1 + countLine(board, r, c, dr, dc, color) + countLine(board, r, c, -dr, -dc, color);
    if (total >= 5) return true;
  }
  return false;
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
