import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { OmokEndModals } from '../components/game/OmokEndModals';
import { GameLayout } from '../components/game/GameLayout';
import { ExcelMotionLoading } from '../components/excel/ExcelMotionLoading';
import {
  BINGO_PLAY_TURN_MS,
  BINGO_SUBJECT_LABEL,
  coerceBingoWinner,
  derivedMarkedGrid,
  flattenLabels,
  insertFlatReorder,
  unflattenLabelsFlat,
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
import {
  clearAbandon,
  getAbandon,
  signalAbandon,
  subscribeAbandon,
} from '../lib/omokAbandon';
import {
  ensureRematchAfterGameEnd,
  clearRematch,
  getRematch,
  pressRematchFinal,
  subscribeRematch,
  REMATCH_SECONDS,
} from '../lib/omokRematch';
import { playPageExitPathIfInvalid, syncPlaySessionFromUrl } from '../lib/playSession';
import './game-play.css';

type Color = 1 | 2;
type EndModal = 'runway' | 'win' | 'lose' | 'draw' | null;

/** 플레이 칸은 항상 button으로 두어 턴 전환 시 div↔button 전환으로 레이아웃이 튀는 현상 방지 */
const BingoPlayCell = React.memo(function BingoPlayCell({
  ri,
  ci,
  label,
  mark,
  pendingHere,
  clickable,
  onPick,
}: {
  ri: number;
  ci: number;
  label: string;
  mark: 0 | 1 | 2;
  pendingHere: boolean;
  clickable: boolean;
  onPick: (r: number, c: number) => void;
}) {
  let cls = 'bingo-cell';
  if (mark === 1) cls += ' bingo-cell--p1';
  if (mark === 2) cls += ' bingo-cell--p2';
  if (pendingHere) cls += ' bingo-cell--focus';
  if (clickable) cls += ' bingo-cell--playable';
  return (
    <button type="button" className={cls} disabled={!clickable} onClick={() => onPick(ri, ci)}>
      <span className="bingo-cell__label">{label}</span>
    </button>
  );
});

export function BingoPage() {
  syncPlaySessionFromUrl();
  const navigate = useNavigate();
  const playRoomId = sessionStorage.getItem('playRoomId');
  const matchRole = sessionStorage.getItem('matchRole') as 'host' | 'guest' | null;
  const online = Boolean(playRoomId && (matchRole === 'host' || matchRole === 'guest'));
  const myColor: Color = matchRole === 'guest' ? 2 : 1;
  const oppColor: Color = myColor === 1 ? 2 : 1;

  const [syncBingo, setSyncBingo] = useState<BingoGameState | null>(null);
  const [playClock, setPlayClock] = useState(0);
  /** 셋업: 드래그 중인 단어(행 우선 재배치 미리보기) */
  const [dragSourceWord, setDragSourceWord] = useState<string | null>(null);
  const [dragHover, setDragHover] = useState<{ r: number; c: number } | null>(null);
  const [endModal, setEndModal] = useState<EndModal>(null);
  const [rematch, setRematch] = useState(() => (playRoomId ? getRematch(playRoomId) : null));
  const [abandonSnap, setAbandonSnap] = useState(() => (playRoomId ? getAbandon(playRoomId) : null));
  const [tick, setTick] = useState(0);
  const endHandledRef = useRef(false);

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
      const exit = playPageExitPathIfInvalid(getRoom(playRoomId), 'bingo');
      if (exit) {
        navigate(exit, { replace: true });
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
    if (!online || !playRoomId || isRemoteLobby() || endModal) return;
    const id = window.setInterval(() => {
      setSyncBingo(getBingoGame(playRoomId));
    }, 400);
    return () => clearInterval(id);
  }, [online, playRoomId, endModal]);

  const bingo = syncBingo;

  const gameLive = useMemo(
    () => (bingo ? coerceBingoWinner(bingo.winner as unknown) === 0 : false),
    [bingo]
  );

  useEffect(() => {
    if (!bingo || !gameLive || endModal || bingo.phase !== 'play') return;
    const id = window.setInterval(() => setPlayClock((x) => x + 1), 250);
    return () => clearInterval(id);
  }, [bingo, gameLive, endModal]);

  useEffect(() => {
    if (!online || !playRoomId) return;
    const sync = () => setRematch(getRematch(playRoomId));
    sync();
    return subscribeRematch(playRoomId, sync);
  }, [online, playRoomId]);

  useEffect(() => {
    if (!online || !playRoomId) return;
    const sync = () => setAbandonSnap(getAbandon(playRoomId));
    sync();
    return subscribeAbandon(playRoomId, sync);
  }, [online, playRoomId]);

  useEffect(() => {
    if (!online || !playRoomId || !matchRole || !abandonSnap) return;
    if (abandonSnap.by !== matchRole) {
      setEndModal('runway');
      void clearRematch(playRoomId);
    }
  }, [abandonSnap, online, playRoomId, matchRole]);

  useEffect(() => {
    if (!online || !playRoomId || !syncBingo) return;
    const w = coerceBingoWinner(syncBingo.winner as unknown);
    if (w === 0) {
      endHandledRef.current = false;
      return;
    }
    if (endHandledRef.current) return;
    endHandledRef.current = true;
    void ensureRematchAfterGameEnd(playRoomId).then(() => {
      setRematch(getRematch(playRoomId));
    });
    if (w === 'draw') setEndModal('draw');
    else if (myColor === w) setEndModal('win');
    else setEndModal('lose');
  }, [online, playRoomId, syncBingo, myColor]);

  useEffect(() => {
    if (!online || !playRoomId || !rematch) return;
    if (!rematch.hostFinal || !rematch.guestFinal) return;
    void (async () => {
      await tryBingoReset(playRoomId);
      await clearRematch(playRoomId);
      await clearAbandon(playRoomId);
      setSyncBingo(getBingoGame(playRoomId));
      setEndModal(null);
      endHandledRef.current = false;
    })();
  }, [rematch, online, playRoomId]);

  useEffect(() => {
    if (!online || !endModal || endModal === 'runway') return;
    const id = window.setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(id);
  }, [online, endModal]);

  useEffect(() => {
    if (!online || !playRoomId || !rematch) return;
    if (!endModal || endModal === 'runway') return;
    if (rematch.hostFinal && rematch.guestFinal) return;
    if (Date.now() <= rematch.deadline) return;
    void clearRematch(playRoomId).then(() => {
      sessionStorage.removeItem('playRoomId');
      navigate('/');
    });
  }, [tick, online, playRoomId, rematch, endModal, navigate]);

  useEffect(() => {
    if (!online || !playRoomId || !matchRole) return;
    return () => {
      const g = getBingoGame(playRoomId);
      if (g && coerceBingoWinner(g.winner as unknown) === 0) {
        void signalAbandon(playRoomId, matchRole);
      }
    };
  }, [online, playRoomId, matchRole]);

  const setupLeft = useMemo(() => {
    void playClock;
    if (!bingo || bingo.phase !== 'setup') return 0;
    return Math.max(0, Math.ceil((bingo.setupDeadline - Date.now()) / 1000));
  }, [bingo, playClock]);

  const turnSecs = useMemo(() => {
    void playClock;
    if (!bingo || bingo.phase !== 'play' || !gameLive || endModal) return 0;
    const dl = bingo.turnDeadline ?? Date.now() + BINGO_PLAY_TURN_MS;
    return Math.max(0, Math.ceil((dl - Date.now()) / 1000));
  }, [bingo, playClock, gameLive, endModal]);

  const topRowActive =
    bingo != null &&
    bingo.phase === 'play' &&
    gameLive &&
    !endModal &&
    bingo.turn === oppColor;
  const bottomRowActive =
    bingo != null &&
    bingo.phase === 'play' &&
    gameLive &&
    !endModal &&
    bingo.turn === myColor;

  const mySetupLocked = useMemo(() => {
    if (!bingo || bingo.phase !== 'setup' || !matchRole) return false;
    return matchRole === 'guest' ? bingo.guestReady === true : bingo.hostReady === true;
  }, [bingo, matchRole]);

  const setupPreviewLabels = useMemo((): string[][] | null => {
    if (!bingo || bingo.phase !== 'setup') return null;
    if (!dragSourceWord) return bingo.labels;
    const flat = flattenLabels(bingo.labels);
    const fromIdx = flat.indexOf(dragSourceWord);
    if (fromIdx < 0) return bingo.labels;
    if (!dragHover) return bingo.labels;
    const toIdx = dragHover.r * 5 + dragHover.c;
    if (fromIdx === toIdx) return bingo.labels;
    return unflattenLabelsFlat(insertFlatReorder(flat, fromIdx, toIdx));
  }, [bingo, dragSourceWord, dragHover]);

  const setupPreviewSig = useMemo(
    () => (setupPreviewLabels ? flattenLabels(setupPreviewLabels).join('|') : ''),
    [setupPreviewLabels]
  );

  const wordFlipRefs = useRef(new Map<string, HTMLDivElement | null>());
  const lastFlipRects = useRef<Map<string, DOMRect> | null>(null);

  useLayoutEffect(() => {
    if (!bingo || bingo.phase !== 'setup' || !dragSourceWord || !setupPreviewLabels) {
      if (!dragSourceWord) lastFlipRects.current = null;
      return;
    }
    const flat = flattenLabels(setupPreviewLabels);
    const newRects = new Map<string, DOMRect>();
    for (const w of flat) {
      const el = wordFlipRefs.current.get(w);
      if (el) newRects.set(w, el.getBoundingClientRect());
    }
    const prev = lastFlipRects.current;
    if (prev && newRects.size > 0) {
      for (const w of flat) {
        const el = wordFlipRefs.current.get(w);
        const o = prev.get(w);
        const n = newRects.get(w);
        if (el && o && n) {
          const dx = o.left - n.left;
          const dy = o.top - n.top;
          if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
            el.style.transform = `translate(${dx}px, ${dy}px)`;
            el.style.transition = 'none';
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                el.style.transition = 'transform 0.24s cubic-bezier(0.22, 1, 0.36, 1)';
                el.style.transform = '';
              });
            });
            window.setTimeout(() => {
              el.style.transition = '';
            }, 280);
          }
        }
      }
    }
    lastFlipRects.current = newRects;
  }, [bingo?.phase, dragSourceWord, setupPreviewSig]);

  const onDragStartSetup = useCallback(
    (word: string) => (e: React.DragEvent) => {
      if (!bingo || bingo.phase !== 'setup' || mySetupLocked) return;
      e.dataTransfer.setData('application/bingo-word', word);
      e.dataTransfer.effectAllowed = 'move';
      setDragSourceWord(word);
      setDragHover(null);
    },
    [bingo, mySetupLocked]
  );

  const onDragEndSetup = useCallback(() => {
    setDragSourceWord(null);
    setDragHover(null);
  }, []);

  const onDragOverGridSetup = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDragOverCellSetup = useCallback((tr: number, tc: number) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragHover((h) => (h?.r === tr && h?.c === tc ? h : { r: tr, c: tc }));
  }, []);

  const onDropSetup = useCallback(
    (tr: number, tc: number) => (e: React.DragEvent) => {
      e.preventDefault();
      if (!bingo || bingo.phase !== 'setup' || mySetupLocked || !playRoomId) return;
      const word = e.dataTransfer.getData('application/bingo-word');
      if (!word) return;
      const flat = flattenLabels(bingo.labels);
      const fromIdx = flat.indexOf(word);
      const toIdx = tr * 5 + tc;
      if (fromIdx < 0 || fromIdx === toIdx) {
        setDragSourceWord(null);
        setDragHover(null);
        return;
      }
      const nextG = unflattenLabelsFlat(insertFlatReorder(flat, fromIdx, toIdx));
      void tryBingoSetupGrid(playRoomId, nextG).then((ok) => {
        if (ok && playRoomId) setSyncBingo(getBingoGame(playRoomId));
      });
      setDragSourceWord(null);
      setDragHover(null);
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
      if (!bingo || bingo.phase !== 'play' || endModal || !gameLive || !playRoomId) return;
      if (bingo.turn !== myColor) return;
      const word = bingo.labels[r]?.[c];
      if (typeof word !== 'string') return;
      const flatM = derivedMarkedGrid(bingo.labels, bingo.subjectId, bingo.markedByIndex);
      if (flatM[r][c] !== 0) return;
      void tryBingoSelect(playRoomId, word, myColor).then((ok) => {
        if (ok) setSyncBingo(getBingoGame(playRoomId));
      });
    },
    [bingo, playRoomId, myColor, endModal, gameLive]
  );

  const onPassTurn = useCallback(() => {
    if (!bingo || bingo.phase !== 'play' || endModal || !gameLive || !playRoomId) return;
    if (bingo.turn !== myColor) return;
    void tryBingoPass(playRoomId, myColor).then((ok) => {
      if (ok) setSyncBingo(getBingoGame(playRoomId));
    });
  }, [bingo, playRoomId, myColor, endModal, gameLive]);

  const canPassTurn = useMemo(() => {
    if (!bingo || bingo.phase !== 'play' || endModal || !gameLive) return false;
    return bingo.turn === myColor;
  }, [bingo, myColor, endModal, gameLive]);

  const setupWaitingPeer = useMemo(() => {
    if (!bingo || bingo.phase !== 'setup' || !matchRole) return false;
    const myReady = matchRole === 'guest' ? bingo.guestReady === true : bingo.hostReady === true;
    const peerReady = matchRole === 'guest' ? bingo.hostReady === true : bingo.guestReady === true;
    return myReady && !peerReady;
  }, [bingo, matchRole]);

  const clearLocalBingoLayout = useCallback((rid: string) => {
    try {
      sessionStorage.removeItem(`bingoLocalLayout:v1:${rid}`);
    } catch {
      /* noop */
    }
  }, []);

  const goHome = useCallback(() => {
    const rid = sessionStorage.getItem('playRoomId');
    if (rid) clearLocalBingoLayout(rid);
    if (rid) {
      void Promise.all([clearAbandon(rid), clearRematch(rid)]).then(() => {
        sessionStorage.removeItem('playRoomId');
        navigate('/');
      });
      return;
    }
    sessionStorage.removeItem('playRoomId');
    navigate('/');
  }, [navigate, clearLocalBingoLayout]);

  const onRunwayOk = useCallback(() => {
    const rid = sessionStorage.getItem('playRoomId');
    if (rid) clearLocalBingoLayout(rid);
    if (rid) {
      void Promise.all([clearAbandon(rid), clearRematch(rid)]).then(() => {
        sessionStorage.removeItem('playRoomId');
        setEndModal(null);
        navigate('/');
      });
      return;
    }
    sessionStorage.removeItem('playRoomId');
    setEndModal(null);
    navigate('/');
  }, [navigate, clearLocalBingoLayout]);

  const onFinal = useCallback(() => {
    if (!playRoomId || !matchRole) return;
    void pressRematchFinal(playRoomId, matchRole).then(() => {
      setRematch(getRematch(playRoomId));
    });
  }, [playRoomId, matchRole]);

  const onLeaveFirst = useCallback(() => {
    const rid = playRoomId;
    if (rid && matchRole) {
      void (async () => {
        clearLocalBingoLayout(rid);
        await signalAbandon(rid, matchRole);
        await clearRematch(rid);
        sessionStorage.removeItem('playRoomId');
        navigate('/');
      })();
      return;
    }
    sessionStorage.removeItem('playRoomId');
    navigate('/');
  }, [playRoomId, matchRole, navigate, clearLocalBingoLayout]);

  const countdownSec = useMemo(() => {
    if (!rematch) return REMATCH_SECONDS;
    return Math.max(0, Math.ceil((rematch.deadline - Date.now()) / 1000));
  }, [rematch, tick]);

  const finalWaiting = useMemo(() => {
    if (!rematch || !matchRole) return false;
    const mine = matchRole === 'host' ? rematch.hostFinal : rematch.guestFinal;
    const both = rematch.hostFinal && rematch.guestFinal;
    return mine && !both;
  }, [rematch, matchRole]);

  const setupCells = useMemo(() => {
    if (!bingo || bingo.phase !== 'setup' || !setupPreviewLabels) return null;
    return setupPreviewLabels.map((row, ri) =>
      row.map((label, ci) => {
        const dropHere = Boolean(dragSourceWord && dragHover?.r === ri && dragHover?.c === ci);
        const draggingWord = dragSourceWord === label;
        return (
          <div
            key={label}
            ref={(el) => {
              wordFlipRefs.current.set(label, el);
            }}
            role="button"
            tabIndex={0}
            draggable={!mySetupLocked}
            className={
              'bingo-cell bingo-cell--setup bingo-cell--setup-insert' +
              (dropHere ? ' bingo-cell--drop-target' : '') +
              (draggingWord && dragSourceWord ? ' bingo-cell--drag-source' : '')
            }
            style={{ gridRow: ri + 1, gridColumn: ci + 1 }}
            onDragStart={onDragStartSetup(label)}
            onDragEnd={onDragEndSetup}
            onDragOver={onDragOverCellSetup(ri, ci)}
            onDrop={onDropSetup(ri, ci)}
          >
            {label}
          </div>
        );
      })
    );
  }, [
    bingo,
    setupPreviewLabels,
    dragHover,
    dragSourceWord,
    mySetupLocked,
    onDragStartSetup,
    onDragEndSetup,
    onDragOverCellSetup,
    onDropSetup,
  ]);

  const playCells = useMemo(() => {
    if (!bingo || bingo.phase !== 'play') return null;
    const { labels, pendingWord, subjectId, markedByIndex } = bingo;
    const marked = derivedMarkedGrid(labels, subjectId, markedByIndex);
    const w = coerceBingoWinner(bingo.winner as unknown);
    const inPlay = w === 0 && !endModal;
    return labels.map((row, ri) =>
      row.map((label, ci) => {
        const m = marked[ri][ci];
        const pendingHere = pendingWord != null && pendingWord === label;
        const isMyTurn = bingo.turn === myColor;
        const clickable = inPlay && isMyTurn && m === 0;
        return (
          <BingoPlayCell
            key={`p-${label}`}
            ri={ri}
            ci={ci}
            label={label}
            mark={m}
            pendingHere={pendingHere}
            clickable={clickable}
            onPick={onSelectCell}
          />
        );
      })
    );
  }, [bingo, myColor, onSelectCell, endModal]);

  const statusHint = useMemo(() => {
    if (!bingo) return '…';
    const w = coerceBingoWinner(bingo.winner as unknown);
    if (w === 'draw') return '무승부입니다.';
    if (w === myColor) return '승리했습니다!';
    if (w !== 0) return '패배했습니다.';
    if (bingo.phase === 'setup') {
      if (setupWaitingPeer) return '잠시만요 — 상대 준비를 기다리는 중입니다.';
      return '드래그하여 순서를 바꾼 뒤 완료를 누르세요. (호스트·게스트 모두 완료 시 시작)';
    }
    if (bingo.turn !== myColor) return '잠시만요 — 상대 차례입니다.';
    if (bingo.pendingWord != null) return '이전 대기 중인 선택이 있습니다. 턴 넘기기로 확정하세요.';
    return '내 차례 — 빈 칸을 눌러 표시하거나 턴 넘기기로 건너뛰세요. (15초)';
  }, [bingo, myColor, setupWaitingPeer]);

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
  const winnerNorm = coerceBingoWinner(bingo.winner as unknown);

  return (
    <>
      <GameLayout docTitle="reference-final" onBack={goHome}>
        <div className="bingo-play">
          {bingo.phase === 'setup' ? (
            <>
              <p className="bingo-subject">{subjectLine}</p>
              <p className="bingo-my-board-caption">내 배치</p>
              <div className="bingo-board-wrap">
                <div
                  className="bingo-grid-5 bingo-grid-5--setup-insert"
                  role="grid"
                  onDragOver={onDragOverGridSetup}
                >
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
                  {winnerNorm === 0 && !endModal && bingo.turn === oppColor ? String(turnSecs) : '—'}
                </div>
              </div>

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
                  {winnerNorm === 0 && !endModal && bingo.turn === myColor ? String(turnSecs) : '—'}
                </div>
              </div>

              <div className="action-buttons action-buttons--center">
                <button
                  type="button"
                  className={'bingo-btn ' + (canPassTurn ? 'bingo-btn--commit' : 'bingo-btn--idle')}
                  disabled={!canPassTurn}
                  onClick={onPassTurn}
                >
                  {bingo.turn !== myColor && winnerNorm === 0
                    ? '잠시만요'
                    : bingo.pendingWord != null
                      ? '확정 (턴 넘기기)'
                      : '턴 넘기기'}
                </button>
              </div>
            </>
          )}
        </div>
      </GameLayout>

      <OmokEndModals
        variant={endModal}
        countdownSec={countdownSec}
        finalWaiting={finalWaiting}
        opponentName={oppName}
        onRunwayOk={onRunwayOk}
        onFinal={onFinal}
        onLeaveFirst={onLeaveFirst}
      />
    </>
  );
}
