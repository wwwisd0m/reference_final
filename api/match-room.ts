import type { VercelRequest, VercelResponse } from '@vercel/node';

type RoomStatus = 'waiting' | 'joined' | 'started' | 'cancelled';

type RoomState = {
  hostNickname: string;
  guestNickname: string | null;
  gameId: string;
  status: RoomStatus;
  updatedAt: number;
};

function sanitizeNick(raw: string): string {
  const trimmed = raw.replace(/[^\p{L}\p{N}]/gu, '');
  return trimmed.slice(0, 8) || '';
}

declare global {
  var __matchLobbyStore: Map<string, RoomState> | undefined;
}

const store = globalThis.__matchLobbyStore ??= new Map();

const TTL_MS = 60 * 60 * 1000;

function prune(): void {
  const now = Date.now();
  for (const [id, r] of store) {
    if (now - r.updatedAt > TTL_MS) store.delete(id);
  }
}

function getRoom(roomId: string): RoomState | null {
  return store.get(roomId) ?? null;
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
        const next: RoomState = {
          hostNickname: host,
          guestNickname: null,
          gameId,
          status: 'waiting',
          updatedAt: Date.now(),
        };
        store.set(roomId, next);
        res.status(200).json({ room: next });
        return;
      }

      if (existing.status === 'cancelled' || existing.status === 'started') {
        const next: RoomState = {
          hostNickname: host,
          guestNickname: null,
          gameId,
          status: 'waiting',
          updatedAt: Date.now(),
        };
        store.set(roomId, next);
        res.status(200).json({ room: next });
        return;
      }

      const next: RoomState = {
        ...existing,
        hostNickname: host,
        gameId,
        updatedAt: Date.now(),
      };
      store.set(roomId, next);
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
      const next: RoomState = {
        ...room,
        guestNickname: guest,
        status: 'joined',
        updatedAt: Date.now(),
      };
      store.set(roomId, next);
      res.status(200).json({ room: next, ok: true });
      return;
    }

    if (action === 'start') {
      const room = getRoom(roomId);
      if (!room) {
        res.status(200).json({ room: null });
        return;
      }
      const next: RoomState = {
        ...room,
        status: 'started',
        updatedAt: Date.now(),
      };
      store.set(roomId, next);
      res.status(200).json({ room: next });
      return;
    }

    if (action === 'cancel') {
      const room = getRoom(roomId);
      if (!room) {
        res.status(200).json({ room: null });
        return;
      }
      const next: RoomState = {
        ...room,
        status: 'cancelled',
        updatedAt: Date.now(),
      };
      store.set(roomId, next);
      res.status(200).json({ room: next });
      return;
    }

    res.status(400).json({ error: 'unknown action' });
    return;
  }

  res.setHeader('Allow', 'GET, POST');
  res.status(405).end();
}
