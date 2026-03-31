import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GameLayout } from '../components/game/GameLayout';
import { ExcelMotionLoading } from '../components/excel/ExcelMotionLoading';
import {
  BINGO_PLAY_TURN_MS,
  BINGO_SUBJECT_LABEL,
  derivedMarkedGrid,
  unflattenLabelsFlat,
  validateLayoutFlatForSubject,
  type BingoGameState,
} from '../lib/bingoEngine';
import {
  ensureBingoGame,
  getBingoGame,
  subscribeBingoGame,
  tryBingoPass,
  tryBingoReset,
  tryBingoSelect,
  tryBingoSetupGrid,
  tryBingoSetupReady,
} from '../lib/bingoSync';
import { isRemoteLobby } from '../lib/lobbyMode';
import { getRoom } from '../lib/matchRoom';
import './game-play.css';

type Color = 1 | 2;

function swapInGrid(grid: string[][], fr: number, fc: number, tr: number, tc: number): string[][] {
  const g = grid.map((row) => [...row]);
  const t = g[fr][fc];
  g[fr][fc] = g[tr][tc];
  g[tr][tc] = t;
  return g;
}

export function BingoPage() {
  const navigate = useNavigate();
  const playRoomId = sessionStorage.getItem('playRoomId');
  const matchRole = sessionStorage.getItem('matchRole') as 'host' | 'guest' | null;
  const online = Boolean(playRoomId && (matchRole === 'host' || matchRole === 'guest'));
  const myColor: Color = matchRole === 'guest' ? 2 : 1;
  const oppColor: Color = myColor === 1 ? 2 : 1;

  const [syncBingo, setSyncBingo] = useState<BingoGameState | null>(null);
  const [playClock, setPlayClock] = useState(0);
  const [dragFrom, setDragFrom] = useState<{ r: number; c: number } | null>(null);

  useEffect(() => {
    if (!playRoomId || (matchRole !== 'host' && matchRole !== 'guest')) {
      navigate('/', { replace: true });
    }
  }, [playRoomId, matchRole, navigate]);

  const room = useMemo(
    () => (playRoomId ? getRoom(playRoomId) : null),
    [playRoomId, syncBingo?.updatedAt]
  );

  const selfName = useMemo(() => {
    if (!room || !matchRole) return '나';
    if (matchRole === 'guest') return room.guestNickname ?? '게스트';
    return room.hostNickname ?? '호스트';
  }, [room, matchRole]);

  const oppName = useMemo(() => {
    if (!room || !matchRole) return '상대';
    return matchRole === 'guest' ? (room.hostNickname ?? '상대') : (room.guestNickname ?? '상대');
  }, [room, matchRole]);

  useEffect(() => {
    if (!online || !playRoomId) return;
    const routeIfWrongGame = (): boolean => {
      const r = getRoom(playRoomId);
      if (!r) {
        navigate('/');
        return true;
      }
      if (r.gameId !== 'bingo') {
        navigate(r.gameId === 'omok' ? '/play/omok' : '/');
        return true;
      }
      return false;
    };
    void ensureBingoGame(playRoomId).then(() => {
      if (routeIfWrongGame()) return;
      setSyncBingo(getBingoGame(playRoomId));
    });
    return subscribeBingoGame(playRoomId, () => {
      if (routeIfWrongGame()) return;
      setSyncBingo(getBingoGame(playRoomId));
    });
  }, [online, playRoomId, navigate]);

  useEffect(() => {
    if (!online || !playRoomId || isRemoteLobby()) return;
    const id = window.setInterval(() => {
      setSyncBingo(getBingoGame(playRoomId));
    }, 400);
    return () => clearInterval(id);
  }, [online, playRoomId]);

  const bingo = syncBingo;

  useEffect(() => {
    if (!bingo || bingo.winner !== 0) return;
    const id = window.setInterval(() => setPlayClock((x) => x + 1), 250);
    return () => clearInterval(id);
  }, [bingo?.winner, bingo?.phase]);

  if (!online) {
    return (
      <GameLayout docTitle="reference-final" onBack={() => navigate('/')}>
        <div className="bingo-play omok-loading-wrap">
          <ExcelMotionLoading size={31} label="대전 연결 필요" />
          <p className="omok-loading">매칭된 방에서만 입장할 수 있습니다.</p>
        </div>
      </GameLayout>
    );
  }

  const setupLeft = useMemo(() => {
    void playClock;
    if (!bingo || bingo.phase !== 'setup') return 0;
    return Math.max(0, Math.ceil((bingo.setupDeadline - Date.now()) / 1000));
  }, [bingo, playClock]);

  const turnSecs = useMemo(() => {
    void playClock;
    if (!bingo || bingo.phase !== 'play' || bingo.winner !== 0) return 0;
    const dl = bingo.turnDeadline ?? Date.now() + BINGO_PLAY_TURN_MS;
    return Math.max(0, Math.ceil((dl - Date.now()) / 1000));
  }, [bingo, playClock]);

  const topRowActive = bingo != null && bingo.phase === 'play' && bingo.winner === 0 && bingo.turn === oppColor;
  const bottomRowActive =
    bingo != null && bingo.phase === 'play' && bingo.winner === 0 && bingo.turn === myColor;

  const mySetupLocked = useMemo(() => {
    if (!bingo || bingo.phase !== 'setup' || !matchRole) return false;
    return matchRole === 'guest' ? bingo.guestReady === true : bingo.hostReady === true;
  }, [bingo, matchRole]);

  const onDragStartSetup = useCallback((r: number, c: number) => (e: React.DragEvent) => {
    if (!bingo || bingo.phase !== 'setup' || mySetupLocked) return;
    e.dataTransfer.setData('application/bingo-rc', JSON.stringify({ r, c }));
    e.dataTransfer.effectAllowed = 'move';
    setDragFrom({ r, c });
  }, [bingo, mySetupLocked]);

  const onDragEndSetup = useCallback(() => setDragFrom(null), []);

  const onDragOverSetup = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDropSetup = useCallback(
    (tr: number, tc: number) => (e: React.DragEvent) => {
      e.preventDefault();
      if (!bingo || bingo.phase !== 'setup' || mySetupLocked || !playRoomId) return;
      let fr: number;
      let fc: number;
      try {
        const raw = e.dataTransfer.getData('application/bingo-rc');
        const p = JSON.parse(raw) as { r: number; c: number };
        fr = p.r;
        fc = p.c;
      } catch {
        return;
      }
      if (fr === tr && fc === tc) return;
      const nextG = swapInGrid(bingo.labels, fr, fc, tr, tc);
      void tryBingoSetupGrid(playRoomId, nextG).then((ok) => {
        if (ok && playRoomId) setSyncBingo(getBingoGame(playRoomId));
      });
      setDragFrom(null);
    },
    [bingo, playRoomId, mySetupLocked]
  );

  const onSetupComplete = useCallback(() => {
    if (!bingo || bingo.phase !== 'setup' || !playRoomId || !matchRole) return;
    void tryBingoSetupReady(playRoomId, matchRole === 'guest' ? 'guest' : 'host').then((ok) => {
      if (ok) setSyncBingo(getBingoGame(playRoomId));
    });
  }, [bingo, playRoomId, matchRole]);

  const onSelectCell = useCallback(
    (r: number, c: number) => {
      if (!bingo || bingo.phase !== 'play' || bingo.winner !== 0 || !playRoomId) return;
      if (bingo.turn !== myColor) return;
      if (bingo.pendingWord != null) return;
      const word = bingo.labels[r]?.[c];
      if (typeof word !== 'string') return;
      const flatM = derivedMarkedGrid(bingo.labels, bingo.subjectId, bingo.markedByIndex);
      if (flatM[r][c] !== 0) return;
      void tryBingoSelect(playRoomId, word, myColor).then((ok) => {
        if (ok) setSyncBingo(getBingoGame(playRoomId));
      });
    },
    [bingo, playRoomId, myColor]
  );

  const onPassTurn = useCallback(() => {
    if (!bingo || bingo.phase !== 'play' || bingo.winner !== 0 || !playRoomId) return;
    if (bingo.turn !== myColor) return;
    void tryBingoPass(playRoomId, myColor).then((ok) => {
      if (ok) setSyncBingo(getBingoGame(playRoomId));
    });
  }, [bingo, playRoomId, myColor]);

  const canPassTurn = useMemo(() => {
    if (!bingo || bingo.phase !== 'play' || bingo.winner !== 0) return false;
    if (bingo.turn !== myColor) return false;
    return bingo.pendingWord != null;
  }, [bingo, myColor]);

  const setupWaitingPeer = useMemo(() => {
    if (!bingo || bingo.phase !== 'setup' || !matchRole) return false;
    const myReady = matchRole === 'guest' ? bingo.guestReady === true : bingo.hostReady === true;
    const peerReady = matchRole === 'guest' ? bingo.hostReady === true : bingo.guestReady === true;
    return myReady && !peerReady;
  }, [bingo, matchRole]);

  const goHome = useCallback(() => {
    const rid = sessionStorage.getItem('playRoomId');
    if (rid) {
      try {
        sessionStorage.removeItem(`bingoLocalLayout:v1:${rid}`);
      } catch {
        /* noop */
      }
    }
    sessionStorage.removeItem('playRoomId');
    navigate('/');
  }, [navigate]);

  const opponentLabelsSetup = useMemo(() => {
    if (!bingo || bingo.phase !== 'setup' || !matchRole) return null;
    const flat = matchRole === 'host' ? bingo.guestLayoutFlat : bingo.hostLayoutFlat;
    if (!flat || !validateLayoutFlatForSubject(flat, bingo.subjectId)) return null;
    return unflattenLabelsFlat(flat);
  }, [bingo, matchRole]);

  const opponentLabelsPlay = useMemo(() => {
    if (!bingo || bingo.phase !== 'play') return null;
    const flat = myColor === 1 ? bingo.guestLayoutFlat : bingo.hostLayoutFlat;
    if (!flat || !validateLayoutFlatForSubject(flat, bingo.subjectId)) return null;
    return unflattenLabelsFlat(flat);
  }, [bingo, myColor]);

  const opponentSetupCells = useMemo(() => {
    if (!opponentLabelsSetup) return null;
    return opponentLabelsSetup.map((row, ri) =>
      row.map((label, ci) => (
        <div
          key={`os-${ri}-${ci}`}
          className="bingo-cell bingo-cell--setup bingo-cell--opponent-preview"
          role="gridcell"
        >
          {label}
        </div>
      ))
    );
  }, [opponentLabelsSetup]);

  const opponentPlayCells = useMemo(() => {
    if (!bingo || !opponentLabelsPlay) return null;
    const marked = derivedMarkedGrid(opponentLabelsPlay, bingo.subjectId, bingo.markedByIndex);
    const { pendingWord } = bingo;
    return opponentLabelsPlay.map((row, ri) =>
      row.map((label, ci) => {
        const m = marked[ri][ci];
        const pendingHere = pendingWord != null && pendingWord === label;
        let cls = 'bingo-cell bingo-cell--opponent-preview';
        if (m === 1) cls += ' bingo-cell--p1';
        if (m === 2) cls += ' bingo-cell--p2';
        if (pendingHere) cls += ' bingo-cell--focus';
        return (
          <div key={`op-${ri}-${ci}`} className={cls} role="gridcell">
            <span className="bingo-cell__label">{label}</span>
          </div>
        );
      })
    );
  }, [bingo, opponentLabelsPlay]);

  const setupCells = useMemo(() => {
    if (!bingo || bingo.phase !== 'setup') return null;
    const { labels } = bingo;
    return labels.map((row, ri) =>
      row.map((label, ci) => {
        const dragging = dragFrom?.r === ri && dragFrom?.c === ci;
        return (
          <div
            key={`s-${ri}-${ci}`}
            role="button"
            tabIndex={0}
            draggable={!mySetupLocked}
            className={'bingo-cell bingo-cell--setup' + (dragging ? ' bingo-cell--drag' : '')}
            onDragStart={onDragStartSetup(ri, ci)}
            onDragEnd={onDragEndSetup}
            onDragOver={onDragOverSetup}
            onDrop={onDropSetup(ri, ci)}
          >
            {label}
          </div>
        );
      })
    );
  }, [bingo, dragFrom, mySetupLocked, onDragStartSetup, onDragEndSetup, onDragOverSetup, onDropSetup]);

  const playCells = useMemo(() => {
    if (!bingo || bingo.phase !== 'play') return null;
    const { labels, pendingWord, subjectId, markedByIndex } = bingo;
    const marked = derivedMarkedGrid(labels, subjectId, markedByIndex);
    return labels.map((row, ri) =>
      row.map((label, ci) => {
        const m = marked[ri][ci];
        const pendingHere = pendingWord === label;
        const isMyTurn = bingo.turn === myColor;
        const clickable = bingo.winner === 0 && isMyTurn && m === 0 && pendingWord == null;
        let cls = 'bingo-cell';
        if (m === 1) cls += ' bingo-cell--p1';
        if (m === 2) cls += ' bingo-cell--p2';
        if (pendingHere) cls += ' bingo-cell--focus';
        if (clickable) cls += ' bingo-cell--playable';
        const inner = <span className="bingo-cell__label">{label}</span>;
        if (clickable) {
          return (
            <button key={`p-${ri}-${ci}`} type="button" className={cls} onClick={() => onSelectCell(ri, ci)}>
              {inner}
            </button>
          );
        }
        return (
          <div key={`p-${ri}-${ci}`} className={cls} role="gridcell">
            {inner}
          </div>
        );
      })
    );
  }, [bingo, myColor, onSelectCell]);

  const statusHint = useMemo(() => {
    if (!bingo) return '…';
    if (bingo.winner === 'draw') return '무승부입니다.';
    if (bingo.winner === myColor) return '승리했습니다!';
    if (bingo.winner !== 0) return '패배했습니다.';
    if (bingo.phase === 'setup') {
      if (setupWaitingPeer) return '잠시만요 — 상대 준비를 기다리는 중입니다.';
      return '드래그하여 순서를 바꾼 뒤 완료를 누르세요. (호스트·게스트 모두 완료 시 시작)';
    }
    if (bingo.turn !== myColor) return '잠시만요 — 상대 차례입니다.';
    if (bingo.pendingWord != null) return '선택한 칸을 턴 넘기기로 확정하세요.';
    return '내 차례 — 칸을 눌러 표시하세요. (15초)';
  }, [bingo, myColor, setupWaitingPeer]);

  const onBingoRematch = useCallback(() => {
    if (!playRoomId) return;
    void tryBingoReset(playRoomId).then((ok) => {
      if (ok) setSyncBingo(getBingoGame(playRoomId));
    });
  }, [playRoomId]);

  if (syncBingo === null) {
    return (
      <GameLayout docTitle="reference-final" onBack={goHome}>
        <div className="bingo-play omok-loading-wrap">
          <ExcelMotionLoading size={31} label="빙고 로딩 중" />
          <p className="omok-loading">방 정보를 불러오는 중…</p>
        </div>
      </GameLayout>
    );
  }

  if (!bingo) return null;

  const subjectLine = `SUBJECT : ${BINGO_SUBJECT_LABEL[bingo.subjectId]}`;

  return (
    <>
      <GameLayout docTitle="reference-final" onBack={goHome}>
        <div className="bingo-play">
          {bingo.phase === 'setup' ? (
            <>
              <p className="bingo-subject">{subjectLine}</p>
              {opponentSetupCells && (
                <>
                  <p className="bingo-opponent-caption">{oppName}의 배치</p>
                  <div className="bingo-board-wrap bingo-board-wrap--opponent">
                    <div className="bingo-grid-5" role="grid">
                      {opponentSetupCells.flat()}
                    </div>
                  </div>
                </>
              )}
              <p className="bingo-my-board-caption">내 배치</p>
              <div className="bingo-board-wrap">
                <div className="bingo-grid-5" role="grid">
                  {setupCells?.flat()}
                </div>
              </div>
              <div className="bingo-footer-row">
                <p className="bingo-hint">드래그해서 순서를 바꾸세요</p>
                <div className="omok-player-row__time omok-player-row__time--active" aria-live="polite">
                  {setupLeft}
                </div>
              </div>
              <div className="action-buttons action-buttons--center bingo-setup-actions">
                <button
                  type="button"
                  className={
                    'bingo-btn ' + (setupWaitingPeer ? 'bingo-btn--idle' : 'bingo-btn--commit')
                  }
                  disabled={setupWaitingPeer}
                  onClick={onSetupComplete}
                >
                  {setupWaitingPeer ? '잠시만요' : '완료'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="bingo-player-row">
                <div className="omok-player-row__left">
                  <span
                    className={
                      'bingo-player-color-dot ' +
                      (oppColor === 1 ? 'bingo-player-color-dot--p1' : 'bingo-player-color-dot--p2')
                    }
                    aria-hidden
                  />
                  <span
                    className={
                      'bingo-player-name ' +
                      (oppColor === 1 ? 'bingo-player-name--p1' : 'bingo-player-name--p2')
                    }
                  >
                    {`${oppName} (${oppColor === 1 ? '호스트' : '게스트'})`}
                  </span>
                </div>
                <div
                  className={
                    'omok-player-row__time ' +
                    (topRowActive ? 'omok-player-row__time--active' : 'omok-player-row__time--inactive')
                  }
                  aria-live="polite"
                >
                  {bingo.winner === 0 && bingo.turn === oppColor ? String(turnSecs) : '—'}
                </div>
              </div>

              {opponentPlayCells && (
                <>
                  <p className="bingo-opponent-caption">{oppName}의 판</p>
                  <div className="bingo-board-wrap bingo-board-wrap--opponent">
                    <div className="bingo-grid-5" role="grid">
                      {opponentPlayCells.flat()}
                    </div>
                  </div>
                </>
              )}

              <p className="bingo-subject">{subjectLine}</p>
              <p className="bingo-my-board-caption">내 판</p>
              <div className="bingo-board-wrap">
                <div className="bingo-grid-5" role="grid">
                  {playCells?.flat()}
                </div>
              </div>

              <p className="omok-rules-hint bingo-status-hint" role="status">
                {statusHint}
              </p>

              <div className="bingo-player-row">
                <div className="omok-player-row__left">
                  <span
                    className={
                      'bingo-player-color-dot ' +
                      (myColor === 1 ? 'bingo-player-color-dot--p1' : 'bingo-player-color-dot--p2')
                    }
                    aria-hidden
                  />
                  <span
                    className={
                      'bingo-player-name ' +
                      (myColor === 1 ? 'bingo-player-name--p1' : 'bingo-player-name--p2')
                    }
                  >
                    {`${selfName} (${myColor === 1 ? '호스트' : '게스트'})`}
                  </span>
                </div>
                <div
                  className={
                    'omok-player-row__time ' +
                    (bottomRowActive ? 'omok-player-row__time--active' : 'omok-player-row__time--inactive')
                  }
                  aria-live="polite"
                >
                  {bingo.winner === 0 && bingo.turn === myColor ? String(turnSecs) : '—'}
                </div>
              </div>

              <div className="action-buttons action-buttons--center">
                <button
                  type="button"
                  className={'bingo-btn ' + (canPassTurn ? 'bingo-btn--commit' : 'bingo-btn--idle')}
                  disabled={!canPassTurn}
                  onClick={onPassTurn}
                >
                  {bingo.turn !== myColor && bingo.winner === 0 ? '잠시만요' : '턴 넘기기'}
                </button>
              </div>
            </>
          )}
        </div>
      </GameLayout>

      {bingo.winner !== 0 && (
        <div className="bingo-end-overlay" role="presentation">
          <div className="bingo-end-card" role="alertdialog" aria-modal="true">
            <h2 className="bingo-end-title">
              {bingo.winner === 'draw'
                ? '무승부'
                : bingo.winner === myColor
                  ? bingo.endReason === 'double_pass'
                    ? '승리 (상대 중단)'
                    : '승리'
                  : bingo.endReason === 'double_pass'
                    ? '패배 (중단 처리)'
                    : '패배'}
            </h2>
            <p className="bingo-end-sub">
              {bingo.winner === 'draw'
                ? '가득 찼습니다.'
                : bingo.winner === myColor
                  ? bingo.endReason === 'double_pass'
                    ? '연속으로 표시 없이 턴이 넘어가 상대가 중단한 것으로 처리되었습니다.'
                    : '한 줄을 완성했습니다.'
                  : bingo.endReason === 'double_pass'
                    ? '연속으로 표시 없이 턴이 넘어가 게임이 종료되었습니다.'
                    : '상대가 한 줄을 먼저 완성했습니다.'}
            </p>
            <div className="bingo-end-actions">
              <button type="button" className="bingo-btn bingo-btn--commit" onClick={onBingoRematch}>
                재대국
              </button>
              <button type="button" className="bingo-btn bingo-btn--idle" onClick={goHome}>
                홈으로
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
