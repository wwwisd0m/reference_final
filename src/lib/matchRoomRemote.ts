import type { RoomState } from './matchRoomLocal';

const cache = new Map<string, RoomState | null>();

function apiUrl(): string {
  return new URL('api/match-room', window.location.origin + import.meta.env.BASE_URL).href;
}

function setCache(roomId: string, room: RoomState | null): void {
  cache.set(roomId, room);
}

export function getCachedRoom(roomId: string): RoomState | null {
  if (!roomId) return null;
  if (!cache.has(roomId)) return null;
  return cache.get(roomId)!;
}

export async function pullRoom(roomId: string): Promise<void> {
  const u = new URL(apiUrl());
  u.searchParams.set('roomId', roomId);
  const res = await fetch(u.href);
  if (!res.ok) {
    setCache(roomId, null);
    return;
  }
  const data = (await res.json()) as { room: RoomState | null };
  setCache(roomId, data.room ?? null);
}

async function post(body: Record<string, unknown>): Promise<{ room: RoomState | null; ok?: boolean }> {
  const res = await fetch(apiUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { room?: RoomState | null; ok?: boolean };
  return { room: data.room ?? null, ok: data.ok };
}

/** 오목·재매칭 등 로비 부가 액션 — 응답 room으로 캐시 갱신 */
export async function postLobbyAction(
  body: Record<string, unknown>
): Promise<{ room: RoomState | null; ok?: boolean }> {
  const roomId = String(body.roomId ?? '');
  const { room, ok } = await post(body);
  if (roomId) setCache(roomId, room);
  return { room, ok };
}

export async function ensureHostRoom(
  roomId: string,
  hostNickname: string,
  gameId: string
): Promise<void> {
  const { room } = await post({ action: 'ensure', roomId, hostNickname, gameId });
  setCache(roomId, room);
}

export async function joinRoom(roomId: string, guestNickname: string): Promise<boolean> {
  const { room, ok } = await post({ action: 'join', roomId, guestNickname });
  setCache(roomId, room);
  return ok === true;
}

export async function markRoomStarted(roomId: string): Promise<void> {
  const { room } = await post({ action: 'start', roomId });
  setCache(roomId, room);
}

export async function cancelRoom(roomId: string): Promise<void> {
  const { room } = await post({ action: 'cancel', roomId });
  setCache(roomId, room);
}

const listeners = new Map<string, Set<() => void>>();
const timers = new Map<string, ReturnType<typeof setInterval>>();

function notify(roomId: string): void {
  listeners.get(roomId)?.forEach((f) => f());
}

export function subscribeRoom(roomId: string, cb: () => void): () => void {
  void pullRoom(roomId).then(() => notify(roomId));

  if (!listeners.has(roomId)) {
    listeners.set(roomId, new Set());
    timers.set(
      roomId,
      setInterval(() => {
        void pullRoom(roomId).then(() => notify(roomId));
      }, 1000)
    );
  }
  listeners.get(roomId)!.add(cb);

  return () => {
    const set = listeners.get(roomId);
    set?.delete(cb);
    if (set && set.size === 0) {
      listeners.delete(roomId);
      clearInterval(timers.get(roomId)!);
      timers.delete(roomId);
    }
  };
}
