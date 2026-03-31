/**
 * 15×15 자유 오목: 양쪽 동일 규칙, 가로·세로·대각선 5연속(이상)이면 승리.
 * 쌍삼(Double Three): 한 수로 열린 3이 둘 이상 생기면 금지(단, 그 수로 5목이 되면 허용).
 */

export const OMOK_SIZE = 15;

/** 0 빈칸, 1 흑, 2 백 */
export type OmokStone = 0 | 1 | 2;

export function emptyOmokBoard(): OmokStone[][] {
  return Array.from({ length: OMOK_SIZE }, () =>
    Array.from({ length: OMOK_SIZE }, () => 0 as OmokStone)
  );
}

const LINE_DIRS: [number, number][] = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

function cloneOmokBoard(board: OmokStone[][]): OmokStone[][] {
  return board.map((row) => [...row]);
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

/** 마지막 둔 위치 기준 5목 이상 */
export function checkOmokWin(board: OmokStone[][], r: number, c: number, color: 1 | 2): boolean {
  for (const [dr, dc] of LINE_DIRS) {
    const total = 1 + countLine(board, r, c, dr, dc, color) + countLine(board, r, c, -dr, -dc, color);
    if (total >= 5) return true;
  }
  return false;
}

/**
 * 이미 (r,c)에 color가 둔 보드에서, 해당 축 방향별로
 * "연속 3칸이 모두 color이고 양쪽 끝 한 칸씩이 모두 빈칸(보드 안)"인 구간의 개수를 센다.
 * 구간은 t=0(두는 위치)을 포함해야 한다.
 */
export function countOmokOpenThreesAt(board: OmokStone[][], r: number, c: number, color: 1 | 2): number {
  let total = 0;
  for (const [dr, dc] of LINE_DIRS) {
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

/**
 * 두기 전 보드 기준: (r,c)에 color를 두면 쌍삼 금수인지.
 * 5목 완성이 되는 수는 false(허용).
 */
export function isOmokDoubleThreeForbiddenMove(
  board: OmokStone[][],
  r: number,
  c: number,
  color: 1 | 2
): boolean {
  if (r < 0 || r >= OMOK_SIZE || c < 0 || c >= OMOK_SIZE || board[r][c] !== 0) return false;
  const b = cloneOmokBoard(board);
  b[r][c] = color;
  if (checkOmokWin(b, r, c, color)) return false;
  return countOmokOpenThreesAt(b, r, c, color) >= 2;
}

export function isBoardFull(board: OmokStone[][]): boolean {
  for (let r = 0; r < OMOK_SIZE; r++) {
    for (let c = 0; c < OMOK_SIZE; c++) {
      if (board[r][c] === 0) return false;
    }
  }
  return true;
}
