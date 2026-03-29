import {
  checkOmokWin,
  emptyOmokBoard,
  isBoardFull,
  type OmokStone,
  OMOK_SIZE,
} from './omokRules';

const PREFIX = 'game-lobby-omok:v1:';
const CHANNEL = 'game-lobby-omok';

export type OmokWinner = 0 | 1 | 2 | 'draw';

export type OmokGameState = {
  board: OmokStone[][];
  /** 1 = 흑 차례, 2 = 백 차례 */
  turn: 1 | 2;
  winner: OmokWinner;
  updatedAt: number;
};

function key(roomId: string): string {
  return PREFIX + roomId;
}

function broadcast(roomId: string): void {
  try {
    const bc = new BroadcastChannel(CHANNEL);
    bc.postMessage({ type: 'omok-update', roomId });
    bc.close();
  } catch {
    /* noop */
  }
}

export function cloneOmokBoard(b: OmokStone[][]): OmokStone[][] {
  return b.map((row) => [...row]);
}

function cloneBoard(b: OmokStone[][]): OmokStone[][] {
  return cloneOmokBoard(b);
}

/** 로컬(연습) 모드용 — 동일 규칙, 저장소 없음 */
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

export function getOmokGame(roomId: string): OmokGameState | null {
  if (!roomId) return null;
  try {
    const raw = localStorage.getItem(key(roomId));
    if (!raw) return null;
    const o = JSON.parse(raw) as OmokGameState;
    if (!o.board || o.board.length !== OMOK_SIZE) return null;
    return o;
  } catch {
    return null;
  }
}

export function setOmokGame(roomId: string, state: OmokGameState): void {
  try {
    localStorage.setItem(key(roomId), JSON.stringify(state));
    broadcast(roomId);
  } catch {
    /* noop */
  }
}

export function resetOmokGame(roomId: string): void {
  setOmokGame(roomId, {
    board: emptyOmokBoard(),
    turn: 1,
    winner: 0,
    updatedAt: Date.now(),
  });
}

export function ensureOmokGame(roomId: string): void {
  if (getOmokGame(roomId)) return;
  resetOmokGame(roomId);
}

/**
 * 흑(1) 선공. 현재 turn과 같은 색만 둘 수 있음.
 * 승리 시 winner 설정, 무승부 시 winner === 'draw'
 */
export function tryOmokMove(roomId: string, r: number, c: number, asColor: 1 | 2): boolean {
  const state = getOmokGame(roomId);
  if (!state) return false;
  const next = applyOmokMoveState(state, r, c, asColor);
  if (!next) return false;
  setOmokGame(roomId, next);
  return true;
}

export function subscribeOmokGame(roomId: string, cb: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === key(roomId)) cb();
  };
  window.addEventListener('storage', onStorage);
  let bc: BroadcastChannel | null = null;
  try {
    bc = new BroadcastChannel(CHANNEL);
    bc.onmessage = (ev: MessageEvent<{ roomId?: string }>) => {
      if (ev.data?.roomId === roomId) cb();
    };
  } catch {
    /* noop */
  }
  return () => {
    window.removeEventListener('storage', onStorage);
    bc?.close();
  };
}
