import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GameLayout } from '../components/game/GameLayout';
import { OmokEndModals } from '../components/game/OmokEndModals';
import { ExcelMotionLoading } from '../components/excel/ExcelMotionLoading';
import {
  clearAbandon,
  getAbandon,
  signalAbandon,
  subscribeAbandon,
} from '../lib/omokAbandon';
import {
  applyOmokPassTurnState,
  applyOmokPlaceState,
  normalizeOmokState,
  OMOK_TURN_MS,
  resolveOmokTimeouts,
} from '../lib/omokEngine';
import { emptyOmokBoard, OMOK_SIZE, type OmokStone } from '../lib/omokRules';
import {
  ensureRematchAfterGameEnd,
  clearRematch,
  getRematch,
  pressRematchFinal,
  subscribeRematch,
  REMATCH_SECONDS,
} from '../lib/omokRematch';
import { isRemoteLobby } from '../lib/lobbyMode';
import {
  ensureOmokGame,
  getOmokGame,
  resetOmokGame,
  subscribeOmokGame,
  tryOmokMove,
  tryOmokPassTurn,
  type OmokGameState,
} from '../lib/omokSync';
import './game-play.css';

/** 흑(선공)=1, 백=2 */
type Color = 1 | 2;

type EndModal = 'runway' | 'win' | 'lose' | 'draw' | null;

export function OmokPage() {
  const navigate = useNavigate();
  const selfName = sessionStorage.getItem('nickname') ?? '나';
  const oppName = sessionStorage.getItem('opponentNickname') ?? '상대';
  const playRoomId = sessionStorage.getItem('playRoomId');
  const matchRole = sessionStorage.getItem('matchRole') as 'host' | 'guest' | null;

  const online = Boolean(playRoomId && (matchRole === 'host' || matchRole === 'guest'));
  /** 호스트=흑, 게스트=백 */
  const myColor: Color = matchRole === 'guest' ? 2 : 1;

  const [onlineState, setOnlineState] = useState<OmokGameState | null>(null);
  const [practiceState, setPracticeState] = useState<OmokGameState>(() => ({
    board: emptyOmokBoard(),
    turn: 1,
    winner: 0,
    updatedAt: Date.now(),
    turnDeadline: Date.now() + OMOK_TURN_MS,
  }));

  const [endModal, setEndModal] = useState<EndModal>(null);
  const [rematch, setRematch] = useState(() => (playRoomId ? getRematch(playRoomId) : null));
  const [abandonSnap, setAbandonSnap] = useState(() => (playRoomId ? getAbandon(playRoomId) : null));
  const [tick, setTick] = useState(0);
  /** 진행 중 타이머 UI 갱신 */
  const [playClock, setPlayClock] = useState(0);
  const endHandledRef = useRef(false);

  useEffect(() => {
    if (!online || !playRoomId) return;
    void ensureOmokGame(playRoomId).then(() => {
      setOnlineState(getOmokGame(playRoomId));
    });
    const unsub = subscribeOmokGame(playRoomId, () => {
      setOnlineState(getOmokGame(playRoomId));
    });
    return unsub;
  }, [online, playRoomId]);

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

  /** 상대 이탈 → #runway */
  useEffect(() => {
    if (!online || !playRoomId || !matchRole || !abandonSnap) return;
    if (abandonSnap.by !== matchRole) {
      setEndModal('runway');
      void clearRematch(playRoomId);
    }
  }, [abandonSnap, online, playRoomId, matchRole]);

  /** 온라인 게임 종료 → 재매칭 창 + #win / #lose / #draw */
  useEffect(() => {
    if (!online || !playRoomId || !onlineState) return;
    if (onlineState.winner === 0) {
      endHandledRef.current = false;
      return;
    }
    if (endHandledRef.current) return;
    endHandledRef.current = true;
    void ensureRematchAfterGameEnd(playRoomId).then(() => {
      setRematch(getRematch(playRoomId));
    });
    if (onlineState.winner === 'draw') setEndModal('draw');
    else if (myColor === onlineState.winner) setEndModal('win');
    else setEndModal('lose');
  }, [online, playRoomId, onlineState, myColor]);

  /** 연습 모드 종료 */
  useEffect(() => {
    if (online) return;
    if (practiceState.winner === 0) {
      endHandledRef.current = false;
      return;
    }
    if (endHandledRef.current) return;
    endHandledRef.current = true;
    if (practiceState.winner === 'draw') setEndModal('draw');
    else if (practiceState.winner === 1) setEndModal('win');
    else setEndModal('lose');
  }, [online, practiceState]);

  /** 양쪽 Final → 보드 리셋 */
  useEffect(() => {
    if (!online || !playRoomId || !rematch) return;
    if (!rematch.hostFinal || !rematch.guestFinal) return;
    void (async () => {
      await resetOmokGame(playRoomId);
      await clearRematch(playRoomId);
      await clearAbandon(playRoomId);
      setOnlineState(getOmokGame(playRoomId));
      setEndModal(null);
      endHandledRef.current = false;
    })();
  }, [rematch, online, playRoomId]);

  /** 카운트다운 UI + 15초 경과 시 홈 */
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

  const state = online ? onlineState : practiceState;

  const playTimerActive = Boolean(state && state.winner === 0 && !endModal);

  /** 30초 제한·턴 표시용 틱 */
  useEffect(() => {
    if (!playTimerActive) return;
    const id = window.setInterval(() => setPlayClock((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [playTimerActive]);

  /** 로컬 방: 제한 시간 경과를 주기적으로 반영 */
  useEffect(() => {
    if (!online || !playRoomId || isRemoteLobby() || endModal) return;
    const id = window.setInterval(() => {
      setOnlineState(getOmokGame(playRoomId));
    }, 400);
    return () => clearInterval(id);
  }, [online, playRoomId, endModal]);

  /** 연습 모드: 제한 시간 자동 턴 넘김 */
  useEffect(() => {
    if (online || endModal) return;
    const id = window.setInterval(() => {
      setPracticeState((prev) => {
        if (prev.winner !== 0) return prev;
        return resolveOmokTimeouts(normalizeOmokState(prev));
      });
    }, 400);
    return () => clearInterval(id);
  }, [online, endModal]);

  const countdownSec = useMemo(() => {
    if (!online || !rematch) return REMATCH_SECONDS;
    return Math.max(0, Math.ceil((rematch.deadline - Date.now()) / 1000));
  }, [online, rematch, tick]);

  const finalWaiting = useMemo(() => {
    if (!online || !rematch || !matchRole) return false;
    const mine = matchRole === 'host' ? rematch.hostFinal : rematch.guestFinal;
    const both = rematch.hostFinal && rematch.guestFinal;
    return mine && !both;
  }, [online, rematch, matchRole]);

  const onCellClick = useCallback(
    (r: number, c: number) => {
      if (!state || state.winner !== 0 || endModal) return;

      if (online && playRoomId) {
        if (state.turn !== myColor || state.pendingPass != null) return;
        void tryOmokMove(playRoomId, r, c, myColor).then((ok) => {
          if (ok) setOnlineState(getOmokGame(playRoomId));
        });
        return;
      }

      setPracticeState((prev) => {
        const next = applyOmokPlaceState(prev, r, c, prev.turn);
        return next ?? prev;
      });
    },
    [online, playRoomId, myColor, state, endModal]
  );

  const statusLine = useMemo(() => {
    if (!state) return '…';
    if (state.winner === 'draw') return '무승부입니다.';
    if (state.winner === 1) {
      if (!online) return '흑 승리!';
      return myColor === 1 ? '승리했습니다!' : '패배했습니다.';
    }
    if (state.winner === 2) {
      if (!online) return '백 승리!';
      return myColor === 2 ? '승리했습니다!' : '패배했습니다.';
    }
    if (online) {
      if (state.turn !== myColor) return '상대의 차례입니다.';
      if (state.pendingPass != null) return '돌을 두었습니다. 턴 넘기기를 눌러 주세요.';
      return '내 차례 — 교차점에 돌을 두세요. (30초)';
    }
    if (state.pendingPass != null) {
      return state.turn === 1 ? '흑이 돌을 두었습니다. 턴 넘기기를 눌러 주세요.' : '백이 돌을 두었습니다. 턴 넘기기를 눌러 주세요.';
    }
    return state.turn === 1 ? '흑 차례 — 돌을 두세요. (30초)' : '백 차례 — 돌을 두세요. (30초)';
  }, [state, online, myColor]);

  const hostLayout = matchRole !== 'guest';
  const topIsWhite = hostLayout;
  const topColor: Color = topIsWhite ? 2 : 1;
  const bottomColor: Color = topIsWhite ? 1 : 2;

  const rowBlackActive = state != null && state.winner === 0 && state.turn === 1 && !endModal;
  const rowWhiteActive = state != null && state.winner === 0 && state.turn === 2 && !endModal;

  const topRowActive = hostLayout ? rowWhiteActive : rowBlackActive;
  const bottomRowActive = hostLayout ? rowBlackActive : rowWhiteActive;

  const goHome = useCallback(() => {
    if (playRoomId) {
      void Promise.all([clearAbandon(playRoomId), clearRematch(playRoomId)]).then(() => {
        sessionStorage.removeItem('playRoomId');
        navigate('/');
      });
      return;
    }
    sessionStorage.removeItem('playRoomId');
    navigate('/');
  }, [navigate, playRoomId]);

  const onRunwayOk = useCallback(() => {
    if (playRoomId) {
      void Promise.all([clearAbandon(playRoomId), clearRematch(playRoomId)]).then(() => {
        sessionStorage.removeItem('playRoomId');
        setEndModal(null);
        navigate('/');
      });
      return;
    }
    sessionStorage.removeItem('playRoomId');
    setEndModal(null);
    navigate('/');
  }, [navigate, playRoomId]);

  const onFinal = useCallback(() => {
    if (!online || !playRoomId || !matchRole) return;
    void pressRematchFinal(playRoomId, matchRole).then(() => {
      setRematch(getRematch(playRoomId));
    });
  }, [online, playRoomId, matchRole]);

  const onLeaveFirst = useCallback(() => {
    if (online && playRoomId && matchRole) {
      void (async () => {
        await signalAbandon(playRoomId, matchRole);
        await clearRematch(playRoomId);
        sessionStorage.removeItem('playRoomId');
        navigate('/');
      })();
      return;
    }
    sessionStorage.removeItem('playRoomId');
    navigate('/');
  }, [online, playRoomId, matchRole, navigate]);

  const onPassTurn = useCallback(() => {
    if (!state || state.winner !== 0 || endModal) return;
    if (state.pendingPass == null) return;
    if (online && playRoomId) {
      if (state.turn !== myColor) return;
      void tryOmokPassTurn(playRoomId, myColor).then((ok) => {
        if (ok) setOnlineState(getOmokGame(playRoomId));
      });
      return;
    }
    setPracticeState((prev) => {
      const next = applyOmokPassTurnState(prev, prev.turn);
      return next ?? prev;
    });
  }, [state, endModal, online, playRoomId, myColor]);

  const canPassTurn = useMemo(() => {
    if (!state || state.winner !== 0 || endModal) return false;
    if (state.pendingPass == null) return false;
    if (online) return state.turn === myColor;
    return true;
  }, [state, endModal, online, myColor]);

  const turnSecondsLeft = useMemo(() => {
    void playClock;
    if (!state || state.winner !== 0) return 0;
    const dl = state.turnDeadline ?? Date.now() + OMOK_TURN_MS;
    return Math.max(0, Math.ceil((dl - Date.now()) / 1000));
  }, [state, playClock]);

  const practiceOnAgain = useCallback(() => {
    setPracticeState({
      board: emptyOmokBoard(),
      turn: 1,
      winner: 0,
      updatedAt: Date.now(),
      turnDeadline: Date.now() + OMOK_TURN_MS,
    });
    setEndModal(null);
    endHandledRef.current = false;
  }, []);

  const practiceOnHome = useCallback(() => {
    navigate('/');
  }, [navigate]);

  /** 진행 중 이탈 시 상대에게 #runway */
  useEffect(() => {
    if (!online || !playRoomId || !matchRole) return;
    return () => {
      const g = getOmokGame(playRoomId);
      if (g && g.winner === 0) {
        void signalAbandon(playRoomId, matchRole);
      }
    };
  }, [online, playRoomId, matchRole]);

  const cells = useMemo(() => {
    if (!state) return null;
    const { board } = state;
    const out: React.ReactNode[] = [];
    for (let r = 0; r < OMOK_SIZE; r++) {
      for (let c = 0; c < OMOK_SIZE; c++) {
        const v = board[r][c] as OmokStone;
        const playable =
          !endModal &&
          state.winner === 0 &&
          v === 0 &&
          state.pendingPass == null &&
          (online ? state.turn === myColor : true);
        out.push(
          <button
            key={`${r}-${c}`}
            type="button"
            className={'omok-intersection' + (playable ? ' omok-intersection--playable' : '')}
            style={{
              left: `calc(${c} * 100% / 14)`,
              top: `calc(${r} * 100% / 14)`,
            }}
            onClick={() => onCellClick(r, c)}
            disabled={!playable}
            aria-label={`${r + 1}행 ${c + 1}열`}
          >
            {v === 1 && <span className="omok-stone omok-stone--black" />}
            {v === 2 && <span className="omok-stone omok-stone--white" />}
          </button>
        );
      }
    }
    return out;
  }, [state, onCellClick, online, myColor, endModal]);

  if (online && state === null) {
    return (
      <GameLayout docTitle="reference-final" onBack={() => navigate('/')}>
        <div className="omok-play omok-loading-wrap">
          <ExcelMotionLoading size={31} label="보드 로딩 중" />
          <p className="omok-loading">보드를 불러오는 중…</p>
        </div>
      </GameLayout>
    );
  }

  return (
    <>
      <GameLayout docTitle="reference-final" onBack={goHome}>
        <div className="omok-play">
          <div className={'omok-player-row' + (topRowActive ? ' omok-player-row--turn' : '')}>
            <div className="omok-player-row__left">
              <span
                className={
                  'omok-player-row__dot ' +
                  (topIsWhite ? 'omok-player-row__dot--ring' : 'omok-player-row__dot--solid')
                }
              />
              <span className="omok-player-row__name omok-player-row__name--opp">
                {online ? `${oppName} (${topIsWhite ? '백' : '흑'})` : topIsWhite ? '백' : '흑'}
              </span>
            </div>
            <div
              className={
                'omok-player-row__time ' +
                (topRowActive ? 'omok-player-row__time--active' : 'omok-player-row__time--inactive')
              }
              aria-live="polite"
            >
              {state && state.winner === 0 && state.turn === topColor ? String(turnSecondsLeft) : '—'}
            </div>
          </div>

          <div className="omok-board-shell">
            <div className="omok-board-inner">
              <div className="omok-board-grid">{cells}</div>
            </div>
          </div>

          <p className="omok-rules-hint" role="status">
            {statusLine}
          </p>

          <div className={'omok-player-row' + (bottomRowActive ? ' omok-player-row--turn' : '')}>
            <div className="omok-player-row__left">
              <span
                className={
                  'omok-player-row__dot ' +
                  (topIsWhite ? 'omok-player-row__dot--solid' : 'omok-player-row__dot--ring')
                }
              />
              <span className="omok-player-row__name omok-player-row__name--me">
                {online ? `${selfName} (${topIsWhite ? '흑' : '백'})` : topIsWhite ? '흑' : '백'}
              </span>
            </div>
            <div
              className={
                'omok-player-row__time ' +
                (bottomRowActive ? 'omok-player-row__time--active' : 'omok-player-row__time--inactive')
              }
              aria-live="polite"
            >
              {state && state.winner === 0 && state.turn === bottomColor
                ? String(turnSecondsLeft)
                : '—'}
            </div>
          </div>

          {!online && (
            <p className="omok-practice-note">같은 기기에서 흑·백을 번갈아 두는 연습 모드입니다.</p>
          )}

          <div className="action-buttons action-buttons--center">
            <button
              type="button"
              className={
                'omok-btn-turn ' + (canPassTurn ? 'omok-btn-turn--commit' : 'omok-btn-turn--idle')
              }
              disabled={!canPassTurn}
              onClick={onPassTurn}
            >
              턴 넘기기
            </button>
          </div>
        </div>
      </GameLayout>

      <OmokEndModals
        variant={endModal}
        online={online}
        countdownSec={countdownSec}
        finalWaiting={finalWaiting}
        opponentName={oppName}
        onRunwayOk={onRunwayOk}
        onFinal={onFinal}
        onLeaveFirst={onLeaveFirst}
        practiceOnAgain={practiceOnAgain}
        practiceOnHome={practiceOnHome}
      />
    </>
  );
}
