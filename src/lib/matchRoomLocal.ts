import { sanitizeNickname } from './nickname';
import type { BingoGameState, BingoSubjectId } from './bingoEngine';
import type { OmokGameState } from './omokEngine';

/** 호스트가 빙고 방을 처음 만들 때만 — `bingoEngine`에는 두지 않음 (서버 `ensure`와 동일 역할) */
function drawRoomBingoSubject(): BingoSubjectId {
  const keys: BingoSubjectId[] = ['fruit', 'flower', 'animal'];
  return keys[Math.floor(Math.random() * keys.length)];
}

/** omokRematch / 서버 JSON과 구조만 맞춤 (순환 import 방지) */
type RematchSnap = { hostFinal: boolean; guestFinal: boolean; deadline: number };
type AbandonSnap = { by: 'host' | 'guest'; ts: number };

const ROOM_PREFIX = 'game-lobby-room:v1:';
const CHANNEL = 'game-lobby-match';

export type RoomStatus = 'waiting' | 'joined' | 'started' | 'cancelled';

export type RoomState = {
  hostNickname: string;
  guestNickname: string | null;
  gameId: string;
  status: RoomStatus;
  updatedAt: number;
  /** 빙고 방: 호스트 `ensureHostRoom` 시 1회 결정. 오목은 null/미설정 (원격 API `StoredRoom.subjectId` 와 동일) */
  subjectId?: BingoSubjectId | null;
  /** Vercel 등 원격 로비에서만 서버가 채움 */
  omok?: OmokGameState | null;
  bingo?: BingoGameState | null;
  rematch?: RematchSnap | null;
  abandon?: AbandonSnap | null;
};

function roomKey(roomId: string): string {
  return ROOM_PREFIX + roomId;
}

function migrateLegacyRoom(raw: RoomState & { bingoSubjectId?: BingoSubjectId | null }): RoomState {
  if (raw.subjectId == null && raw.bingoSubjectId != null) {
    return { ...raw, subjectId: raw.bingoSubjectId };
  }
  return raw;
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

export function setRoom(roomId: string, state: RoomState): void {
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
    const parsed = JSON.parse(raw) as RoomState & { bingoSubjectId?: BingoSubjectId | null };
    return migrateLegacyRoom(parsed);
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
      subjectId: gameId === 'bingo' ? drawRoomBingoSubject() : null,
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
      subjectId: gameId === 'bingo' ? drawRoomBingoSubject() : null,
    });
    return;
  }

  if (existing.status === 'waiting') {
    const next: RoomState = {
      ...existing,
      hostNickname: host,
      gameId,
      updatedAt: Date.now(),
    };
    if (gameId !== 'bingo') {
      next.subjectId = null;
    } else if (existing.gameId !== 'bingo') {
      next.subjectId = drawRoomBingoSubject();
    }
    setRoom(roomId, next);
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
