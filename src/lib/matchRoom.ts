import type { RoomState } from './matchRoomLocal';
import { isRemoteLobby } from './lobbyMode';
import * as local from './matchRoomLocal';
import * as remote from './matchRoomRemote';

export type { RoomState, RoomStatus } from './matchRoomLocal';

export function getRoom(roomId: string): RoomState | null {
  return isRemoteLobby() ? remote.getCachedRoom(roomId) : local.getRoom(roomId);
}

export function ensureHostRoom(
  roomId: string,
  hostNickname: string,
  gameId: string
): Promise<void> {
  if (isRemoteLobby()) return remote.ensureHostRoom(roomId, hostNickname, gameId);
  local.ensureHostRoom(roomId, hostNickname, gameId);
  return Promise.resolve();
}

export function joinRoom(roomId: string, guestNickname: string): Promise<boolean> {
  if (isRemoteLobby()) return remote.joinRoom(roomId, guestNickname);
  return Promise.resolve(local.joinRoom(roomId, guestNickname));
}

export function markRoomStarted(roomId: string): Promise<void> {
  if (isRemoteLobby()) return remote.markRoomStarted(roomId);
  local.markRoomStarted(roomId);
  return Promise.resolve();
}

export function cancelRoom(roomId: string): Promise<void> {
  if (isRemoteLobby()) return remote.cancelRoom(roomId);
  local.cancelRoom(roomId);
  return Promise.resolve();
}

export function subscribeRoom(roomId: string, cb: () => void): () => void {
  return isRemoteLobby()
    ? remote.subscribeRoom(roomId, cb)
    : local.subscribeRoom(roomId, cb);
}
