import { createClient, type VercelKV } from '@vercel/kv';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  applyOmokMoveState,
  initialOmokState,
  type OmokGameState,
} from './omokServer';

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
/** 방 키 TTL(초). 갱신될 때마다 연장됨 */
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

/**
 * 기본 `import { kv } from '@vercel/kv'` 는 KV_REST_* 만 읽습니다.
 * Upstash Redis(Vercel) 연동은 UPSTASH_REDIS_REST_* 만 주입하는 경우가 있어 둘 다 지원합니다.
 */
let _kv: VercelKV | null = null;

function getKv(): VercelKV {
  if (_kv) return _kv;
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
      'Redis REST 자격 증명 없음: KV_REST_API_URL+KV_REST_API_TOKEN 또는 UPSTASH_REDIS_REST_URL+UPSTASH_REDIS_REST_TOKEN'
    );
  }
  _kv = createClient({ url, token });
  return _kv;
}

async function getRoom(roomId: string): Promise<StoredRoom | null> {
  const raw = await getKv().get<StoredRoom>(roomKey(roomId));
  if (raw == null) return null;
  return normalize(raw as StoredRoom);
}

async function save(roomId: string, room: StoredRoom): Promise<void> {
  await getKv().set(roomKey(roomId), normalize(room), { ex: TTL_SEC });
}

const playOk = (s: RoomStatus) => s === 'joined' || s === 'started';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    if (req.method === 'GET') {
      if (req.query.ping === '1') {
        await getKv().ping();
        res.status(200).json({ ok: true, storage: 'redis' });
        return;
      }
      const roomId = String(req.query.roomId ?? '');
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
    console.error('[match-room] KV error', err);
    if (!res.headersSent) {
      res.status(503).json({ error: 'Storage temporarily unavailable' });
    }
  }
}
