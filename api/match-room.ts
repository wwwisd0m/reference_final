import { Redis } from '@upstash/redis';
import type { VercelRequest, VercelResponse } from '@vercel/node';

/* -------------------------------------------------------------------------- */
/* 오목 (API 단일 파일 — Vercel 번들에서 형제 모듈 누락 방지. src/lib/omokEngine 과 동기화) */
/* -------------------------------------------------------------------------- */

const OMOK_SIZE = 15;
type OmokStone = 0 | 1 | 2;
type OmokWinner = 0 | 1 | 2 | 'draw';

type OmokGameState = {
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

function applyOmokMoveState(
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

function initialOmokState(): OmokGameState {
  return {
    board: emptyOmokBoard(),
    turn: 1,
    winner: 0,
    updatedAt: Date.now(),
  };
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
  omok: OmokGameState | null;
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

function normalize(r: StoredRoom): StoredRoom {
  return {
    ...r,
    omok: r.omok ?? null,
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
      const room = await getRoom(roomId);
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
            omok: null,
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
            omok: null,
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
          omok: null,
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
        const room = await getRoom(roomId);
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
        const nextState = applyOmokMoveState(state, r, c, asColor);
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
