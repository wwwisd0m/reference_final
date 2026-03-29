import { sanitizeNickname } from './nickname';

const ROOM_PREFIX = 'game-lobby-room:v1:';
const CHANNEL = 'game-lobby-match';

export type RoomStatus = 'waiting' | 'joined' | 'started' | 'cancelled';

export type RoomState = {
  hostNickname: string;
  guestNickname: string | null;
  gameId: string;
  status: RoomStatus;
  updatedAt: number;
};

function roomKey(roomId: string): string {
  return ROOM_PREFIX + roomId;
}

function broadcast(roomId: string): void {
  try {
    const bc = new BroadcastChannel(CHANNEL);
    bc.postMessage({ type: 'room-update', roomId });
    bc.close();
  } catch {
    /* noop */
  }
}

function setRoom(roomId: string, state: RoomState): void {
  try {
    localStorage.setItem(roomKey(roomId), JSON.stringify(state));
    broadcast(roomId);
  } catch {
    /* noop */
  }
}

export function getRoom(roomId: string): RoomState | null {
  if (!roomId) return null;
  try {
    const raw = localStorage.getItem(roomKey(roomId));
    if (!raw) return null;
    return JSON.parse(raw) as RoomState;
  } catch {
    return null;
  }
}

export function ensureHostRoom(roomId: string, hostNickname: string, gameId: string): void {
  const host = sanitizeNickname(hostNickname) || 'host';
  const existing = getRoom(roomId);

  if (!existing) {
    setRoom(roomId, {
      hostNickname: host,
      guestNickname: null,
      gameId,
      status: 'waiting',
      updatedAt: Date.now(),
    });
    return;
  }

  if (existing.status === 'cancelled' || existing.status === 'started') {
    setRoom(roomId, {
      hostNickname: host,
      guestNickname: null,
      gameId,
      status: 'waiting',
      updatedAt: Date.now(),
    });
    return;
  }

  if (existing.status === 'waiting') {
    setRoom(roomId, {
      ...existing,
      hostNickname: host,
      gameId,
      updatedAt: Date.now(),
    });
  }
}

export function joinRoom(roomId: string, guestNickname: string): boolean {
  const room = getRoom(roomId);
  if (!room || room.status !== 'waiting' || room.guestNickname) return false;

  const guest = sanitizeNickname(guestNickname) || 'guest';
  setRoom(roomId, {
    ...room,
    guestNickname: guest,
    status: 'joined',
    updatedAt: Date.now(),
  });
  return true;
}

export function markRoomStarted(roomId: string): void {
  const room = getRoom(roomId);
  if (!room) return;
  setRoom(roomId, {
    ...room,
    status: 'started',
    updatedAt: Date.now(),
  });
}

export function cancelRoom(roomId: string): void {
  const room = getRoom(roomId);
  if (!room) return;
  setRoom(roomId, {
    ...room,
    status: 'cancelled',
    updatedAt: Date.now(),
  });
}

export function subscribeRoom(roomId: string, cb: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === roomKey(roomId)) cb();
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
