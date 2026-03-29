import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  applyOmokMoveState,
  initialOmokState,
  type OmokGameState,
} from '../src/lib/omokEngine';

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

declare global {
  var __matchLobbyStore: Map<string, StoredRoom> | undefined;
}

const store = globalThis.__matchLobbyStore ??= new Map();

const TTL_MS = 60 * 60 * 1000;

function prune(): void {
  const now = Date.now();
  for (const [id, r] of store) {
    if (now - r.updatedAt > TTL_MS) store.delete(id);
  }
}

function getRoom(roomId: string): StoredRoom | null {
  const r = store.get(roomId);
  return r ? normalize(r) : null;
}

function save(roomId: string, room: StoredRoom): void {
  store.set(roomId, normalize(room));
}

export default function handler(req: VercelRequest, res: VercelResponse): void {
  prune();

  if (req.method === 'GET') {
    const roomId = String(req.query.roomId ?? '');
    if (!roomId) {
      res.status(400).json({ error: 'roomId required' });
      return;
    }
    res.status(200).json({ room: getRoom(roomId) });
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
      const existing = getRoom(roomId);

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
        save(roomId, next);
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
        save(roomId, next);
        res.status(200).json({ room: next });
        return;
      }

      const next: StoredRoom = {
        ...existing,
        hostNickname: host,
        gameId,
        updatedAt: Date.now(),
      };
      save(roomId, next);
      res.status(200).json({ room: next });
      return;
    }

    if (action === 'join') {
      const guestNickname = String(body.guestNickname ?? '');
      const room = getRoom(roomId);
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
      save(roomId, next);
      res.status(200).json({ room: next, ok: true });
      return;
    }

    if (action === 'start') {
      const room = getRoom(roomId);
      if (!room) {
        res.status(200).json({ room: null });
        return;
      }
      const next: StoredRoom = {
        ...room,
        status: 'started',
        updatedAt: Date.now(),
      };
      save(roomId, next);
      res.status(200).json({ room: next });
      return;
    }

    if (action === 'cancel') {
      const room = getRoom(roomId);
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
      save(roomId, next);
      res.status(200).json({ room: next });
      return;
    }

    const playOk = (s: RoomStatus) => s === 'joined' || s === 'started';

    if (action === 'omokEnsure') {
      const room = getRoom(roomId);
      if (!room || !playOk(room.status)) {
        res.status(200).json({ room: room ?? null, ok: false });
        return;
      }
      const omok = room.omok ?? initialOmokState();
      const next: StoredRoom = { ...room, omok, updatedAt: Date.now() };
      save(roomId, next);
      res.status(200).json({ room: next, ok: true });
      return;
    }

    if (action === 'omokReset') {
      const room = getRoom(roomId);
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
      save(roomId, next);
      res.status(200).json({ room: next, ok: true });
      return;
    }

    if (action === 'omokMove') {
      const room = getRoom(roomId);
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
      save(roomId, next);
      res.status(200).json({ room: next, ok: true });
      return;
    }

    if (action === 'rematchEnsure') {
      const room = getRoom(roomId);
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
      save(roomId, next);
      res.status(200).json({ room: next, ok: true });
      return;
    }

    if (action === 'rematchPress') {
      const role = body.role === 'guest' ? 'guest' : 'host';
      const room = getRoom(roomId);
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
      save(roomId, next);
      res.status(200).json({ room: next, ok: true });
      return;
    }

    if (action === 'rematchClear') {
      const room = getRoom(roomId);
      if (!room) {
        res.status(200).json({ room: null, ok: false });
        return;
      }
      const next: StoredRoom = { ...room, rematch: null, updatedAt: Date.now() };
      save(roomId, next);
      res.status(200).json({ room: next, ok: true });
      return;
    }

    if (action === 'abandonSignal') {
      const role = body.role === 'guest' ? 'guest' : 'host';
      const room = getRoom(roomId);
      if (!room) {
        res.status(200).json({ room: null, ok: false });
        return;
      }
      const abandon: AbandonPayload = { by: role, ts: Date.now() };
      const next: StoredRoom = { ...room, abandon, updatedAt: Date.now() };
      save(roomId, next);
      res.status(200).json({ room: next, ok: true });
      return;
    }

    if (action === 'abandonClear') {
      const room = getRoom(roomId);
      if (!room) {
        res.status(200).json({ room: null, ok: false });
        return;
      }
      const next: StoredRoom = { ...room, abandon: null, updatedAt: Date.now() };
      save(roomId, next);
      res.status(200).json({ room: next, ok: true });
      return;
    }

    res.status(400).json({ error: 'unknown action' });
    return;
  }

  res.setHeader('Allow', 'GET, POST');
  res.status(405).end();
}
