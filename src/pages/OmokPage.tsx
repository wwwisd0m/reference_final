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
import { OMOK_TURN_MS } from '../lib/omokEngine';
import { isOmokDoubleThreeForbiddenMove, OMOK_SIZE, type OmokStone } from '../lib/omokRules';
import {
  ensureRematchAfterGameEnd,
  clearRematch,
  getRematch,
  pressRematchFinal,
  subscribeRematch,
  REMATCH_SECONDS,
} from '../lib/omokRematch';
import { isRemoteLobby } from '../lib/lobbyMode';
import { getRoom } from '../lib/matchRoom';
import { playPageExitPathIfInvalid, syncPlaySessionFromUrl } from '../lib/playSession';
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
  syncPlaySessionFromUrl();
  const navigate = useNavigate();
  const playRoomId = sessionStorage.getItem('playRoomId');
  const matchRole = sessionStorage.getItem('matchRole') as 'host' | 'guest' | null;

  const online = Boolean(playRoomId && (matchRole === 'host' || matchRole === 'guest'));
  /** 호스트=흑, 게스트=백 */
  const myColor: Color = matchRole === 'guest' ? 2 : 1;

  const [onlineState, setOnlineState] = useState<OmokGameState | null>(null);

  const [endModal, setEndModal] = useState<EndModal>(null);
  const [rematch, setRematch] = useState(() => (playRoomId ? getRematch(playRoomId) : null));
  const [abandonSnap, setAbandonSnap] = useState(() => (playRoomId ? getAbandon(playRoomId) : null));
  const [tick, setTick] = useState(0);
  /** 진행 중 타이머 UI 갱신 */
  const [playClock, setPlayClock] = useState(0);
  const [forbiddenMsg, setForbiddenMsg] = useState<string | null>(null);
  const endHandledRef = useRef(false);

  useEffect(() => {
    if (!playRoomId || (matchRole !== 'host' && matchRole !== 'guest')) {
      navigate('/', { replace: true });
    }
  }, [playRoomId, matchRole, navigate]);

  const room = useMemo(
    () => (playRoomId ? getRoom(playRoomId) : null),
    [playRoomId, onlineState?.updatedAt]
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
      const exit = playPageExitPathIfInvalid(getRoom(playRoomId), 'omok');
      if (exit) {
        navigate(exit, { replace: true });
        return true;
      }
      return false;
    };
    void ensureOmokGame(playRoomId).then(() => {
      if (routeIfWrongGame()) return;
      setOnlineState(getOmokGame(playRoomId));
    });
    const unsub = subscribeOmokGame(playRoomId, () => {
      if (routeIfWrongGame()) return;
      setOnlineState(getOmokGame(playRoomId));
    });
    return unsub;
  }, [online, playRoomId, navigate]);

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

  const state = onlineState;

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

  const onCellClick = useCallback(
    (r: number, c: number) => {
      if (!state || state.winner !== 0 || endModal || !playRoomId) return;
      if (state.turn !== myColor) return;
      if (state.board[r][c] !== 0) return;
      if (isOmokDoubleThreeForbiddenMove(state.board, r, c, myColor)) {
        setForbiddenMsg('쌍삼은 금지입니다');
        return;
      }
      void tryOmokMove(playRoomId, r, c, myColor).then((ok) => {
        if (ok) setOnlineState(getOmokGame(playRoomId));
      });
    },
    [playRoomId, myColor, state, endModal]
  );

  const statusLine = useMemo(() => {
    if (!state) return '…';
    if (state.winner === 'draw') return '무승부입니다.';
    if (state.winner === 1) {
      return myColor === 1 ? '승리했습니다!' : '패배했습니다.';
    }
    if (state.winner === 2) {
      return myColor === 2 ? '승리했습니다!' : '패배했습니다.';
    }
    if (state.turn !== myColor) return '상대의 차례입니다.';
    if (state.pendingPass != null) {
      return '확정 전입니다. 다른 교차점을 누르면 돌 위치가 옮겨지고, 같은 자리를 다시 누르면 취소됩니다. 턴 넘기기 시 상대 화면에 반영됩니다.';
    }
    return '내 차례 — 교차점을 눌러 착점을 정한 뒤 턴 넘기기로 확정하세요. (30초)';
  }, [state, myColor]);

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
    if (!playRoomId || !matchRole) return;
    void pressRematchFinal(playRoomId, matchRole).then(() => {
      setRematch(getRematch(playRoomId));
    });
  }, [playRoomId, matchRole]);

  const onLeaveFirst = useCallback(() => {
    if (playRoomId && matchRole) {
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
  }, [playRoomId, matchRole, navigate]);

  const onPassTurn = useCallback(() => {
    if (!state || state.winner !== 0 || endModal || !playRoomId) return;
    if (state.pendingPass == null) return;
    if (state.turn !== myColor) return;
    void tryOmokPassTurn(playRoomId, myColor).then((ok) => {
      if (ok) setOnlineState(getOmokGame(playRoomId));
    });
  }, [state, endModal, playRoomId, myColor]);

  const canPassTurn = useMemo(() => {
    if (!state || state.winner !== 0 || endModal) return false;
    if (state.pendingPass == null) return false;
    return state.turn === myColor;
  }, [state, endModal, myColor]);

  const turnSecondsLeft = useMemo(() => {
    void playClock;
    if (!state || state.winner !== 0) return 0;
    const dl = state.turnDeadline ?? Date.now() + OMOK_TURN_MS;
    return Math.max(0, Math.ceil((dl - Date.now()) / 1000));
  }, [state, playClock]);

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

  useEffect(() => {
    if (!forbiddenMsg) return;
    const t = window.setTimeout(() => setForbiddenMsg(null), 2500);
    return () => clearTimeout(t);
  }, [forbiddenMsg]);

  const cells = useMemo(() => {
    if (!state) return null;
    const { board } = state;
    const stoneAt = (r: number, c: number): OmokStone => {
      const b = board[r][c] as OmokStone;
      if (b !== 0) return b;
      const p = state.pendingPass;
      if (p != null && p.r === r && p.c === c && state.turn === myColor) {
        return myColor as OmokStone;
      }
      return 0;
    };
    const out: React.ReactNode[] = [];
    for (let r = 0; r < OMOK_SIZE; r++) {
      for (let c = 0; c < OMOK_SIZE; c++) {
        const raw = board[r][c] as OmokStone;
        const shown = stoneAt(r, c);
        const canTryPlace =
          !endModal && state.winner === 0 && raw === 0 && state.turn === myColor;
        const doubleThree = canTryPlace && isOmokDoubleThreeForbiddenMove(board, r, c, myColor);
        const playableHighlight = canTryPlace && !doubleThree;
        out.push(
          <button
            key={`${r}-${c}`}
            type="button"
            className={
              'omok-intersection' +
              (playableHighlight ? ' omok-intersection--playable' : '') +
              (canTryPlace && doubleThree ? ' omok-intersection--forbidden' : '')
            }
            style={{
              left: `calc(${c} * 100% / 14)`,
              top: `calc(${r} * 100% / 14)`,
            }}
            onClick={() => onCellClick(r, c)}
            disabled={!canTryPlace}
            aria-label={`${r + 1}행 ${c + 1}열`}
          >
            {shown === 1 && <span className="omok-stone omok-stone--black" />}
            {shown === 2 && <span className="omok-stone omok-stone--white" />}
          </button>
        );
      }
    }
    return out;
  }, [state, onCellClick, myColor, endModal]);

  if (!online) {
    return (
      <GameLayout docTitle="reference-final" onBack={() => navigate('/')}>
        <div className="omok-play omok-loading-wrap">
          <ExcelMotionLoading size={31} label="대전 연결 필요" />
          <p className="omok-loading">매칭된 방에서만 입장할 수 있습니다.</p>
        </div>
      </GameLayout>
    );
  }

  if (state === null) {
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
                {`${oppName} (${topIsWhite ? '백' : '흑'})`}
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
          {forbiddenMsg ? (
            <p className="omok-forbidden-hint" role="alert">
              {forbiddenMsg}
            </p>
          ) : null}

          <div className={'omok-player-row' + (bottomRowActive ? ' omok-player-row--turn' : '')}>
            <div className="omok-player-row__left">
              <span
                className={
                  'omok-player-row__dot ' +
                  (topIsWhite ? 'omok-player-row__dot--solid' : 'omok-player-row__dot--ring')
                }
              />
              <span className="omok-player-row__name omok-player-row__name--me">
                {`${selfName} (${topIsWhite ? '흑' : '백'})`}
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
