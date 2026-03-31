import { Redis } from '@upstash/redis';
import type { VercelRequest, VercelResponse } from '@vercel/node';

/* -------------------------------------------------------------------------- */
/* 오목 (API 단일 파일 — Vercel 번들에서 형제 모듈 누락 방지. src/lib/omokEngine 과 동기화) */
/* -------------------------------------------------------------------------- */

const OMOK_SIZE = 15;
type OmokStone = 0 | 1 | 2;
type OmokWinner = 0 | 1 | 2 | 'draw';

const OMOK_TURN_MS = 30_000;

type OmokGameState = {
  board: OmokStone[][];
  turn: 1 | 2;
  winner: OmokWinner;
  updatedAt: number;
  pendingPass?: { r: number; c: number } | null;
  turnDeadline?: number;
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

function advanceTurnAfterPassOrTimeout(state: OmokGameState): OmokGameState {
  const nextTurn: 1 | 2 = state.turn === 1 ? 2 : 1;
  return {
    ...state,
    turn: nextTurn,
    pendingPass: undefined,
    turnDeadline: Date.now() + OMOK_TURN_MS,
    updatedAt: Date.now(),
  };
}

function normalizeOmokState(state: OmokGameState): OmokGameState {
  if (state.winner !== 0) {
    return { ...state, pendingPass: undefined, turnDeadline: undefined };
  }
  if (state.turnDeadline == null) {
    return { ...state, turnDeadline: Date.now() + OMOK_TURN_MS, updatedAt: Date.now() };
  }
  return state;
}

function resolveOmokTimeouts(state: OmokGameState): OmokGameState {
  let s = normalizeOmokState(state);
  if (s.winner !== 0) return s;
  for (let i = 0; i < 8; i++) {
    const dl = s.turnDeadline ?? Date.now() + OMOK_TURN_MS;
    if (Date.now() <= dl) {
      return { ...s, turnDeadline: dl };
    }
    s = advanceTurnAfterPassOrTimeout({ ...s, pendingPass: undefined });
    if (s.winner !== 0) return s;
  }
  return s;
}

function omokStateNeedsPersist(before: OmokGameState, after: OmokGameState): boolean {
  return (
    before.turn !== after.turn ||
    before.turnDeadline !== after.turnDeadline ||
    before.winner !== after.winner ||
    JSON.stringify(before.pendingPass ?? null) !== JSON.stringify(after.pendingPass ?? null) ||
    before.updatedAt !== after.updatedAt
  );
}

function applyOmokPlaceState(
  state: OmokGameState,
  r: number,
  c: number,
  asColor: 1 | 2
): OmokGameState | null {
  const s = resolveOmokTimeouts(state);
  if (s.winner !== 0) return null;
  if (s.turn !== asColor) return null;
  if (s.pendingPass != null) return null;
  if (r < 0 || r >= OMOK_SIZE || c < 0 || c >= OMOK_SIZE) return null;
  if (s.board[r][c] !== 0) return null;

  const board = cloneBoard(s.board);
  board[r][c] = asColor;

  if (checkOmokWin(board, r, c, asColor)) {
    return {
      board,
      turn: asColor,
      winner: asColor,
      updatedAt: Date.now(),
      pendingPass: undefined,
      turnDeadline: undefined,
    };
  }

  if (isBoardFull(board)) {
    return {
      board,
      turn: asColor,
      winner: 'draw',
      updatedAt: Date.now(),
      pendingPass: undefined,
      turnDeadline: undefined,
    };
  }

  return {
    ...s,
    board,
    pendingPass: { r, c },
    updatedAt: Date.now(),
  };
}

function applyOmokPassTurnState(state: OmokGameState, asColor: 1 | 2): OmokGameState | null {
  const s = resolveOmokTimeouts(state);
  if (s.winner !== 0) return null;
  if (s.turn !== asColor) return null;
  if (s.pendingPass == null) return null;
  return advanceTurnAfterPassOrTimeout({ ...s, pendingPass: undefined });
}

function initialOmokState(): OmokGameState {
  return {
    board: emptyOmokBoard(),
    turn: 1,
    winner: 0,
    updatedAt: Date.now(),
    turnDeadline: Date.now() + OMOK_TURN_MS,
  };
}

/* 빙고 — src/lib/bingoEngine.ts 와 동기화 */
/** 5×5 빙고 — 오목과 분리된 순수 규칙 (API match-room.ts 와 동기화) */

const BINGO_SIZE = 5;
const BINGO_SETUP_MS = 30_000;
const BINGO_PLAY_TURN_MS = 15_000;

type BingoSubjectId = 'fruit' | 'flower' | 'animal';

const BINGO_SUBJECT_LABEL: Record<BingoSubjectId, string> = {
  fruit: '과일',
  flower: '꽃',
  animal: '동물',
};

type BingoGamePhase = 'setup' | 'play';

type BingoWinner = 0 | 1 | 2 | 'draw';

type BingoEndReason = 'line' | 'full' | 'double_pass';

type BingoGameState = {
  subjectId: BingoSubjectId;
  labels: string[][];
  phase: BingoGamePhase;
  setupDeadline: number;
  hostReady: boolean;
  guestReady: boolean;
  turn: 1 | 2;
  marked: (0 | 1 | 2)[][];
  pendingMark: { r: number; c: number } | null;
  turnDeadline: number;
  winner: BingoWinner;
  emptyPassStreak?: number;
  endReason?: BingoEndReason;
  updatedAt: number;
};

/* src/lib/bingoGrid.ts 와 동일 목록 유지 */
const FRUIT_POOL = [
  '사과',
  '바나나',
  '오렌지',
  '귤',
  '딸기',
  '망고',
  '포도',
  '배',
  '참외',
  '수박',
  '두리안',
  '레몬',
  '체리',
  '키위',
  '복숭아',
  '무화과',
  '매실',
  '블루베리',
  '유자',
  '감',
  '자두',
  '용과',
  '자몽',
  '파인애플',
  '석류',
];

const FLOWER_POOL = [
  '민들레',
  '해바라기',
  '장미',
  '국화',
  '나팔꽃',
  '무궁화',
  '초롱꽃',
  '은방울꽃',
  '데이지',
  '수선화',
  '벚꽃',
  '개나리',
  '히아신스',
  '팬지',
  '연꽃',
  '목련',
  '패랭이꽃',
  '카네이션',
  '구절초',
  '동백꽃',
  '수국',
  '봉선화',
  '코스모스',
  '튤립',
  '할미꽃',
];

const ANIMAL_POOL = [
  '개',
  '고양이',
  '낙타',
  '타조',
  '비둘기',
  '펭귄',
  '곰',
  '호랑이',
  '사자',
  '말',
  '치타',
  '사슴',
  '두더지',
  '코끼리',
  '원숭이',
  '햄스터',
  '앵무새',
  '다람쥐',
  '너구리',
  '하마',
  '캥거루',
  '늑대',
  '박쥐',
  '토끼',
  '여우',
];

const POOLS: Record<BingoSubjectId, string[]> = {
  fruit: FRUIT_POOL,
  flower: FLOWER_POOL,
  animal: ANIMAL_POOL,
};

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function pickRandomSubject(): BingoSubjectId {
  const keys: BingoSubjectId[] = ['fruit', 'flower', 'animal'];
  return keys[Math.floor(Math.random() * keys.length)];
}

function buildShuffledGrid5(subjectId: BingoSubjectId): string[][] {
  const pool = [...POOLS[subjectId]];
  shuffleInPlace(pool);
  const flat = pool.slice(0, 25);
  const labels: string[][] = [];
  for (let r = 0; r < BINGO_SIZE; r++) {
    labels.push(flat.slice(r * BINGO_SIZE, r * BINGO_SIZE + BINGO_SIZE));
  }
  return labels;
}

function emptyMarked(): (0 | 1 | 2)[][] {
  return Array.from({ length: BINGO_SIZE }, () =>
    Array.from({ length: BINGO_SIZE }, () => 0 as 0 | 1 | 2)
  );
}

function initialBingoStateForSubject(subjectId: BingoSubjectId): BingoGameState {
  return {
    subjectId,
    labels: buildShuffledGrid5(subjectId),
    phase: 'setup',
    setupDeadline: Date.now() + BINGO_SETUP_MS,
    hostReady: false,
    guestReady: false,
    turn: 1,
    marked: emptyMarked(),
    pendingMark: null,
    turnDeadline: Date.now() + BINGO_PLAY_TURN_MS,
    winner: 0,
    emptyPassStreak: 0,
    updatedAt: Date.now(),
  };
}

function initialBingoState(): BingoGameState {
  return initialBingoStateForSubject(pickRandomSubject());
}

function flattenLabels(g: string[][]): string[] {
  return g.flat();
}

function sameLabelMultiset(a: string[][], b: string[][]): boolean {
  const x = [...flattenLabels(a)].sort();
  const y = [...flattenLabels(b)].sort();
  if (x.length !== y.length) return false;
  return x.every((v, i) => v === y[i]);
}

function cloneMarked(m: (0 | 1 | 2)[][]): (0 | 1 | 2)[][] {
  return m.map((row) => [...row]);
}

const LINE_INDEXES: [number, number][][] = [
  ...Array.from({ length: BINGO_SIZE }, (_, r) =>
    Array.from({ length: BINGO_SIZE }, (_, c) => [r, c] as [number, number])
  ),
  ...Array.from({ length: BINGO_SIZE }, (_, c) =>
    Array.from({ length: BINGO_SIZE }, (_, r) => [r, c] as [number, number])
  ),
  [
    [0, 0],
    [1, 1],
    [2, 2],
    [3, 3],
    [4, 4],
  ],
  [
    [0, 4],
    [1, 3],
    [2, 2],
    [3, 1],
    [4, 0],
  ],
];

function checkBingoLineWin(marked: (0 | 1 | 2)[][], color: 1 | 2): boolean {
  return LINE_INDEXES.some((line) => line.every(([r, c]) => marked[r][c] === color));
}

function isMarkedBoardFull(marked: (0 | 1 | 2)[][]): boolean {
  for (let r = 0; r < BINGO_SIZE; r++) {
    for (let c = 0; c < BINGO_SIZE; c++) {
      if (marked[r][c] === 0) return false;
    }
  }
  return true;
}

function advancePlayTurn(state: BingoGameState): BingoGameState {
  const nextTurn: 1 | 2 = state.turn === 1 ? 2 : 1;
  return {
    ...state,
    turn: nextTurn,
    pendingMark: null,
    turnDeadline: Date.now() + BINGO_PLAY_TURN_MS,
    updatedAt: Date.now(),
  };
}

function applyEmptyPassAdvance(state: BingoGameState, passer: 1 | 2): BingoGameState {
  const streak = (state.emptyPassStreak ?? 0) + 1;
  if (streak >= 2) {
    const winner: 1 | 2 = passer === 1 ? 2 : 1;
    return {
      ...state,
      winner,
      endReason: 'double_pass',
      emptyPassStreak: 0,
      pendingMark: null,
      updatedAt: Date.now(),
    };
  }
  return advancePlayTurn({ ...state, emptyPassStreak: streak });
}

function commitPendingMark(state: BingoGameState): BingoGameState | null {
  if (state.phase !== 'play' || state.pendingMark == null) return null;
  const { r, c } = state.pendingMark;
  const color = state.turn;
  if (state.marked[r][c] !== 0) return null;
  const marked = cloneMarked(state.marked);
  marked[r][c] = color;
  const next: BingoGameState = {
    ...state,
    marked,
    pendingMark: null,
    updatedAt: Date.now(),
  };
  if (checkBingoLineWin(marked, color)) {
    return { ...next, winner: color, endReason: 'line' };
  }
  if (isMarkedBoardFull(marked)) {
    return { ...next, winner: 'draw', endReason: 'full' };
  }
  return advancePlayTurn({ ...next, emptyPassStreak: 0 });
}

/** setup → play (둘 다 준비 또는 시간 초과) */
function tryFinishSetupPhase(state: BingoGameState): BingoGameState {
  if (state.phase !== 'setup') return state;
  const timeUp = Date.now() > state.setupDeadline;
  const bothReady = state.hostReady && state.guestReady;
  if (!timeUp && !bothReady) return state;
  return {
    ...state,
    phase: 'play',
    turn: 1,
    marked: emptyMarked(),
    pendingMark: null,
    turnDeadline: Date.now() + BINGO_PLAY_TURN_MS,
    emptyPassStreak: 0,
    endReason: undefined,
    updatedAt: Date.now(),
  };
}

function normalizeBingoState(state: BingoGameState): BingoGameState {
  if (state.winner !== 0 && state.winner !== 'draw') {
    return { ...state, pendingMark: null };
  }
  if (state.phase === 'setup') {
    if (state.setupDeadline == null) {
      return { ...state, setupDeadline: Date.now() + BINGO_SETUP_MS, updatedAt: Date.now() };
    }
    return tryFinishSetupPhase(state);
  }
  if (state.turnDeadline == null && state.winner === 0) {
    return { ...state, turnDeadline: Date.now() + BINGO_PLAY_TURN_MS, updatedAt: Date.now() };
  }
  return state;
}

/** 플레이 페이즈 제한 시간 — pending 있으면 확정 후 턴 넘김, 없으면 그냥 턴 넘김 */
function resolveBingoPlayTimeouts(state: BingoGameState): BingoGameState {
  let s = normalizeBingoState(state);
  if (s.phase !== 'play' || s.winner !== 0) return s;
  for (let i = 0; i < 16; i++) {
    const dl = s.turnDeadline ?? Date.now() + BINGO_PLAY_TURN_MS;
    if (Date.now() <= dl) {
      return { ...s, turnDeadline: dl };
    }
    if (s.pendingMark != null) {
      const committed = commitPendingMark(s);
      if (!committed) {
        return applyEmptyPassAdvance({ ...s, pendingMark: null }, s.turn);
      }
      s = committed;
      if (s.winner !== 0) return s;
      continue;
    }
    s = applyEmptyPassAdvance(s, s.turn);
  }
  return s;
}

function resolveBingoAll(state: BingoGameState): BingoGameState {
  let s = normalizeBingoState(state);
  s = tryFinishSetupPhase(s);
  if (s.phase === 'play' && s.winner === 0) {
    s = resolveBingoPlayTimeouts(s);
  }
  return s;
}

function bingoStateNeedsPersist(before: BingoGameState, after: BingoGameState): boolean {
  return JSON.stringify(before) !== JSON.stringify(after);
}

function applyBingoSetupGrid(state: BingoGameState, labels: string[][]): BingoGameState | null {
  const s = resolveBingoAll(state);
  if (s.phase !== 'setup') return null;
  if (!labels || labels.length !== BINGO_SIZE) return null;
  for (const row of labels) {
    if (!row || row.length !== BINGO_SIZE) return null;
  }
  if (!sameLabelMultiset(s.labels, labels)) return null;
  return { ...s, labels, updatedAt: Date.now() };
}

function applyBingoSetupReady(state: BingoGameState, role: 'host' | 'guest'): BingoGameState | null {
  let s = resolveBingoAll(state);
  if (s.phase !== 'setup') return null;
  if (role === 'host') s = { ...s, hostReady: true, updatedAt: Date.now() };
  else s = { ...s, guestReady: true, updatedAt: Date.now() };
  return tryFinishSetupPhase(s);
}

function applyBingoSelect(
  state: BingoGameState,
  r: number,
  c: number,
  asColor: 1 | 2
): BingoGameState | null {
  let s = resolveBingoAll(state);
  if (s.phase !== 'play' || s.winner !== 0) return null;
  s = resolveBingoPlayTimeouts(s);
  if (s.phase !== 'play' || s.winner !== 0) return null;
  if (s.turn !== asColor) return null;
  if (s.pendingMark != null) return null;
  if (r < 0 || r >= BINGO_SIZE || c < 0 || c >= BINGO_SIZE) return null;
  if (s.marked[r][c] !== 0) return null;
  return { ...s, pendingMark: { r, c }, updatedAt: Date.now() };
}

function applyBingoPass(state: BingoGameState, asColor: 1 | 2): BingoGameState | null {
  let s = resolveBingoAll(state);
  if (s.phase !== 'play' || s.winner !== 0) return null;
  s = resolveBingoPlayTimeouts(s);
  if (s.phase !== 'play' || s.winner !== 0) return null;
  if (s.turn !== asColor) return null;
  if (s.pendingMark != null) {
    const next = commitPendingMark(s);
    return next;
  }
  return applyEmptyPassAdvance(s, asColor);
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
  /** 빙고 방: 호스트가 방을 만들 때 정해진 주제 — bingoEnsure 시 공통 단어 풀에 사용 */
  bingoSubjectId: BingoSubjectId | null;
  omok: OmokGameState | null;
  bingo: BingoGameState | null;
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
  const bingoSubjectId =
    r.bingoSubjectId ?? (r.bingo ? r.bingo.subjectId : null) ?? null;
  return {
    ...r,
    bingoSubjectId,
    omok: r.omok ?? null,
    bingo: r.bingo ?? null,
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

async function getRoomWithResolvedOmok(roomId: string): Promise<StoredRoom | null> {
  const room = await getRoom(roomId);
  if (!room?.omok || room.omok.winner !== 0) return room;
  const omok = resolveOmokTimeouts(normalizeOmokState(room.omok));
  if (!omokStateNeedsPersist(room.omok, omok)) {
    return { ...room, omok };
  }
  const next: StoredRoom = { ...room, omok, updatedAt: Date.now() };
  await save(roomId, next);
  return next;
}

async function getRoomResolved(roomId: string): Promise<StoredRoom | null> {
  let room = await getRoom(roomId);
  if (!room) return null;
  let patched = false;
  if (room.omok && room.omok.winner === 0) {
    const omok = resolveOmokTimeouts(normalizeOmokState(room.omok));
    if (omokStateNeedsPersist(room.omok, omok)) {
      room = { ...room, omok, updatedAt: Date.now() };
      patched = true;
    } else {
      room = { ...room, omok };
    }
  }
  if (room.bingo) {
    const bingo = resolveBingoAll(normalizeBingoState(room.bingo));
    if (bingoStateNeedsPersist(room.bingo, bingo)) {
      room = { ...room, bingo, updatedAt: Date.now() };
      patched = true;
    } else {
      room = { ...room, bingo };
    }
  }
  if (patched) await save(roomId, room);
  return room;
}

function parseBingoLabelsBody(raw: unknown): string[][] | null {
  if (!Array.isArray(raw) || raw.length !== BINGO_SIZE) return null;
  const out: string[][] = [];
  for (const row of raw) {
    if (!Array.isArray(row) || row.length !== BINGO_SIZE) return null;
    out.push(row.map((c) => String(c ?? '')));
  }
  return out;
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
      const room = await getRoomResolved(roomId);
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
            bingoSubjectId: gameId === 'bingo' ? pickRandomSubject() : null,
            omok: null,
            bingo: null,
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
            bingoSubjectId: gameId === 'bingo' ? pickRandomSubject() : null,
            omok: null,
            bingo: null,
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
        if (gameId !== 'bingo') {
          next.bingoSubjectId = null;
        } else if (existing.gameId !== 'bingo') {
          next.bingoSubjectId = pickRandomSubject();
        }
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
          bingoSubjectId: null,
          omok: null,
          bingo: null,
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
        let room = await getRoomWithResolvedOmok(roomId);
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
        state = resolveOmokTimeouts(normalizeOmokState(state));
        const nextState = applyOmokPlaceState(state, r, c, asColor);
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

      if (action === 'omokPass') {
        let room = await getRoomWithResolvedOmok(roomId);
        if (!room || !playOk(room.status)) {
          res.status(200).json({ room: room ?? null, ok: false });
          return;
        }
        const asColor = body.asColor === 2 ? 2 : 1;
        let state = room.omok;
        if (!state) {
          state = initialOmokState();
        }
        state = resolveOmokTimeouts(normalizeOmokState(state));
        const nextState = applyOmokPassTurnState(state, asColor);
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

      if (action === 'bingoEnsure') {
        const room = await getRoom(roomId);
        if (!room || !playOk(room.status) || room.gameId !== 'bingo') {
          res.status(200).json({ room: room ?? null, ok: false });
          return;
        }
        const normalized = normalize(room);
        const subjectId =
          normalized.bingo?.subjectId ??
          normalized.bingoSubjectId ??
          pickRandomSubject();
        const bingo = normalized.bingo ?? initialBingoStateForSubject(subjectId);
        const next: StoredRoom = {
          ...normalized,
          bingo,
          bingoSubjectId: bingo.subjectId,
          updatedAt: Date.now(),
        };
        await save(roomId, next);
        res.status(200).json({ room: next, ok: true });
        return;
      }

      if (action === 'bingoGrid') {
        let room = await getRoomResolved(roomId);
        if (!room || !playOk(room.status) || room.gameId !== 'bingo' || !room.bingo) {
          res.status(200).json({ room: room ?? null, ok: false });
          return;
        }
        const labels = parseBingoLabelsBody(body.labels);
        if (!labels) {
          res.status(200).json({ room, ok: false });
          return;
        }
        const nextBingo = applyBingoSetupGrid(room.bingo, labels);
        if (!nextBingo) {
          res.status(200).json({ room, ok: false });
          return;
        }
        const next: StoredRoom = { ...room, bingo: nextBingo, updatedAt: Date.now() };
        await save(roomId, next);
        res.status(200).json({ room: next, ok: true });
        return;
      }

      if (action === 'bingoReady') {
        let room = await getRoomResolved(roomId);
        if (!room || !playOk(room.status) || room.gameId !== 'bingo' || !room.bingo) {
          res.status(200).json({ room: room ?? null, ok: false });
          return;
        }
        const role = body.role === 'guest' ? 'guest' : 'host';
        const nextBingo = applyBingoSetupReady(room.bingo, role);
        if (!nextBingo) {
          res.status(200).json({ room, ok: false });
          return;
        }
        const next: StoredRoom = { ...room, bingo: nextBingo, updatedAt: Date.now() };
        await save(roomId, next);
        res.status(200).json({ room: next, ok: true });
        return;
      }

      if (action === 'bingoSelect') {
        let room = await getRoomResolved(roomId);
        if (!room || !playOk(room.status) || room.gameId !== 'bingo' || !room.bingo) {
          res.status(200).json({ room: room ?? null, ok: false });
          return;
        }
        const r = Number(body.r);
        const c = Number(body.c);
        const asColor = body.asColor === 2 ? 2 : 1;
        const nextBingo = applyBingoSelect(room.bingo, r, c, asColor);
        if (!nextBingo) {
          res.status(200).json({ room, ok: false });
          return;
        }
        const next: StoredRoom = { ...room, bingo: nextBingo, updatedAt: Date.now() };
        await save(roomId, next);
        res.status(200).json({ room: next, ok: true });
        return;
      }

      if (action === 'bingoPass') {
        let room = await getRoomResolved(roomId);
        if (!room || !playOk(room.status) || room.gameId !== 'bingo' || !room.bingo) {
          res.status(200).json({ room: room ?? null, ok: false });
          return;
        }
        const asColor = body.asColor === 2 ? 2 : 1;
        const nextBingo = applyBingoPass(room.bingo, asColor);
        if (!nextBingo) {
          res.status(200).json({ room, ok: false });
          return;
        }
        const next: StoredRoom = { ...room, bingo: nextBingo, updatedAt: Date.now() };
        await save(roomId, next);
        res.status(200).json({ room: next, ok: true });
        return;
      }

      if (action === 'bingoReset') {
        const room = await getRoom(roomId);
        if (!room || !playOk(room.status) || room.gameId !== 'bingo' || !room.bingo) {
          res.status(200).json({ room: room ?? null, ok: false });
          return;
        }
        if (room.bingo.winner === 0) {
          res.status(200).json({ room, ok: false });
          return;
        }
        const subjectId = pickRandomSubject();
        const next: StoredRoom = {
          ...room,
          bingo: initialBingoStateForSubject(subjectId),
          bingoSubjectId: subjectId,
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
