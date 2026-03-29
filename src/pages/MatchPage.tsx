import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { MobileFrame } from '../components/MobileFrame';
import { ExcelMotionLoading } from '../components/excel/ExcelMotionLoading';
import { WaitingDotsText } from '../components/match/WaitingDotsText';
import { TopBarDoc } from '../components/home/HomeChrome';
import './match.css';
import './home.css';
import { sanitizeNickname } from '../lib/nickname';
import {
  cancelRoom,
  ensureHostRoom,
  getRoom,
  joinRoom,
  markRoomStarted,
  subscribeRoom,
  type RoomState,
} from '../lib/matchRoom';
import { resetOmokGame } from '../lib/omokSync';
import { useTheme } from '../context/ThemeContext';
import { ASSETS_ADOBE, ASSETS_EXCEL, ASSETS_MATCH_EXCEL, ASSETS_SIMPLE } from '../theme/figmaAssets';

const FILE_LABEL: Record<string, string> = {
  omok: '5mok.jpg',
  bingo: 'bingo.pdf',
};

function playPath(gameId: string): string {
  return gameId === 'bingo' ? '/play/bingo' : '/play/omok';
}

type InvalidProps = {
  fileName: string;
  onHome: () => void;
};

/** A_G0_match_03 — 호스트 방 취소·잘못된 room 등 */
function MatchInvalid({ fileName, onHome }: InvalidProps) {
  const { theme } = useTheme();

  return (
    <MobileFrame>
      <TopBarDoc />

      <header className="match-subbar">
        <button type="button" className="match-subbar__back" onClick={onHome} aria-label="뒤로">
          <img src={ASSETS_MATCH_EXCEL.arrowBack} alt="" width={24} height={24} />
        </button>
        <span className="match-subbar__file">{fileName}</span>
      </header>

      <div className="match-host">
        {theme === 'excel' && (
          <div className="match-host__grid" aria-hidden>
            <img src={ASSETS_MATCH_EXCEL.gridV} alt="" className="match-host__grid-v" />
            <img src={ASSETS_MATCH_EXCEL.gridH} alt="" className="match-host__grid-h" />
          </div>
        )}

        <div className="match-host__body match-invalid">
          <div className="match-invalid__card">
            <p className="match-invalid__title">Reference.final</p>
            <p className="match-invalid__sub">이미 종료된 URL 입니다.</p>
          </div>
          <div className="action-buttons action-buttons--center">
            <button type="button" className="match-btn-wanna" onClick={onHome}>
              <img src={ASSETS_MATCH_EXCEL.folderOpen} alt="" width={16} height={16} />
              wanna_go_home?
            </button>
          </div>
        </div>
      </div>
    </MobileFrame>
  );
}

export function MatchPage() {
  const navigate = useNavigate();
  const { gameId = 'omok' } = useParams();
  const [search] = useSearchParams();
  const { theme } = useTheme();
  const guest = search.get('guest') === '1';
  const roomIdGuest = search.get('room') ?? '';

  const fileName = FILE_LABEL[gameId] ?? '5mok.jpg';
  const nickname = sessionStorage.getItem('nickname') ?? '';

  const roomIdHost = useMemo(() => sessionStorage.getItem(`hostRoom:${gameId}`) ?? '', [gameId]);

  const [nickGuest, setNickGuest] = useState('');
  const [roomSnap, setRoomSnap] = useState<RoomState | null>(() =>
    guest && roomIdGuest ? getRoom(roomIdGuest) : null
  );

  const startedRef = useRef(false);
  const navigatedRef = useRef(false);

  const goHome = useCallback(() => {
    if (!guest && roomIdHost) {
      cancelRoom(roomIdHost);
      sessionStorage.removeItem(`hostRoom:${gameId}`);
    }
    navigate('/');
  }, [guest, navigate, gameId, roomIdHost]);

  const nextArrow =
    theme === 'adobe'
      ? ASSETS_ADOBE.arrowForward
      : theme === 'vscode'
        ? ASSETS_SIMPLE.arrowForward
        : ASSETS_EXCEL.arrowForward;

  const guestNickOk = nickGuest.trim().length > 0;

  /* —— 게스트: room 구독 (호스트가 방 취소하면 A_G0_match_03) —— */
  useEffect(() => {
    if (!guest || !roomIdGuest) return;
    const sync = () => setRoomSnap(getRoom(roomIdGuest));
    sync();
    const unsub = subscribeRoom(roomIdGuest, sync);
    return unsub;
  }, [guest, roomIdGuest]);

  /* —— 호스트: 직접 URL로 들어온 경우·닉네임 없음 —— */
  useEffect(() => {
    if (guest) return;
    if (!roomIdHost || !nickname) {
      navigate('/', { replace: true });
    }
  }, [guest, roomIdHost, nickname, navigate]);

  /* —— 호스트: 방 등록 —— */
  useEffect(() => {
    if (guest || !roomIdHost || !nickname) return;
    ensureHostRoom(roomIdHost, nickname, gameId);
  }, [guest, roomIdHost, nickname, gameId]);

  /* —— 호스트: 상대 닉네임 제출 시 바로 플레이 (A_G1_omok / 빙고) —— */
  useEffect(() => {
    if (guest || !roomIdHost) return;

    const tryEnter = () => {
      if (navigatedRef.current) return;
      const room = getRoom(roomIdHost);
      if (!room || room.status !== 'joined' || !room.guestNickname) return;
      navigatedRef.current = true;
      startedRef.current = true;
      sessionStorage.setItem('opponentNickname', room.guestNickname);
      sessionStorage.setItem('matchRole', 'host');
      if (gameId === 'omok') {
        resetOmokGame(roomIdHost);
        sessionStorage.setItem('playRoomId', roomIdHost);
      } else {
        sessionStorage.removeItem('playRoomId');
      }
      markRoomStarted(roomIdHost);
      navigate(playPath(gameId));
    };

    tryEnter();
    const unsub = subscribeRoom(roomIdHost, tryEnter);
    return unsub;
  }, [guest, roomIdHost, gameId, navigate]);

  /* —— 호스트: 매칭 화면 이탈 시 방 취소 —— */
  useEffect(() => {
    if (guest || !roomIdHost) return;
    return () => {
      if (!startedRef.current) cancelRoom(roomIdHost);
    };
  }, [guest, roomIdHost]);

  const joinGame = useCallback(() => {
    const n = sanitizeNickname(nickGuest.trim());
    if (!n || !roomIdGuest) return;
    if (!joinRoom(roomIdGuest, n)) {
      setRoomSnap(getRoom(roomIdGuest));
      return;
    }
    const room = getRoom(roomIdGuest);
    sessionStorage.setItem('nickname', n);
    if (room) sessionStorage.setItem('opponentNickname', room.hostNickname);
    sessionStorage.setItem('matchRole', 'guest');
    if (gameId === 'omok') {
      resetOmokGame(roomIdGuest);
      sessionStorage.setItem('playRoomId', roomIdGuest);
    } else {
      sessionStorage.removeItem('playRoomId');
    }
    navigate(playPath(gameId));
  }, [gameId, navigate, nickGuest, roomIdGuest]);

  const copyInvite = useCallback(() => {
    const path = `match/${gameId}?guest=1&room=${encodeURIComponent(roomIdHost)}`;
    const url = new URL(path, `${window.location.origin}${import.meta.env.BASE_URL}`).href;
    void navigator.clipboard.writeText(url);
  }, [gameId, roomIdHost]);

  /* —— 게스트: A_G0_match_02 / 잘못된 접근 A_G0_match_03 —— */
  if (guest) {
    if (!roomIdGuest) {
      return <MatchInvalid fileName={fileName} onHome={goHome} />;
    }

    const dead =
      !roomSnap ||
      roomSnap.status === 'cancelled' ||
      roomSnap.status === 'started' ||
      roomSnap.gameId !== gameId;

    if (dead) {
      return <MatchInvalid fileName={fileName} onHome={goHome} />;
    }

    return (
      <MobileFrame>
        <TopBarDoc />

        <header className="match-subbar">
          <button type="button" className="match-subbar__back" onClick={goHome} aria-label="뒤로">
            <img src={ASSETS_MATCH_EXCEL.arrowBack} alt="" width={24} height={24} />
          </button>
          <span className="match-subbar__file">{fileName}</span>
        </header>

        <div className="match-host">
          {theme === 'excel' && (
            <div className="match-host__grid" aria-hidden>
              <img src={ASSETS_MATCH_EXCEL.gridV} alt="" className="match-host__grid-v" />
              <img src={ASSETS_MATCH_EXCEL.gridH} alt="" className="match-host__grid-h" />
            </div>
          )}

          <div className="match-host__body match-guest">
            <div className="match-host__file-card">
              <p className="match-host__file-title">{fileName}</p>
            </div>

            <div className="match-host__nick">
              <img src={ASSETS_MATCH_EXCEL.crown} alt="" width={14} height={14} />
              <span className="match-host__nick-txt">{roomSnap.hostNickname}</span>
            </div>

            <div className="nick-field match-guest__nick">
              <div className="nick-field__box match-guest__nick-box">
                <input
                  id="guest-nick"
                  className="nick-field__input"
                  value={nickGuest}
                  maxLength={8}
                  onChange={(e) => setNickGuest(sanitizeNickname(e.target.value))}
                  required
                  aria-required="true"
                  placeholder="닉네임을 입력하세요"
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="action-buttons action-buttons--end">
              <button
                type="button"
                className={'home-next home-next--' + theme}
                onClick={joinGame}
                disabled={!guestNickOk}
                aria-label="다음"
                aria-disabled={!guestNickOk}
              >
                {theme === 'excel' && (
                  <span className="home-next__corner">
                    <img src={ASSETS_EXCEL.rectangle6} alt="" width={10} height={10} />
                  </span>
                )}
                <img src={nextArrow} alt="" width={24} height={24} className="home-next__arrow" />
              </button>
            </div>
          </div>
        </div>
      </MobileFrame>
    );
  }

  /* —— 호스트: A_G0_match_01 —— */
  if (!roomIdHost) {
    return null;
  }

  if (!nickname) {
    return null;
  }

  return (
    <MobileFrame>
      <TopBarDoc />

      <header className="match-subbar">
        <button type="button" className="match-subbar__back" onClick={goHome} aria-label="뒤로">
          <img src={ASSETS_MATCH_EXCEL.arrowBack} alt="" width={24} height={24} />
        </button>
        <span className="match-subbar__file">{fileName}</span>
      </header>

      <div className="match-host">
        {theme === 'excel' && (
          <div className="match-host__grid" aria-hidden>
            <img src={ASSETS_MATCH_EXCEL.gridV} alt="" className="match-host__grid-v" />
            <img src={ASSETS_MATCH_EXCEL.gridH} alt="" className="match-host__grid-h" />
          </div>
        )}

        <div className="match-host__body">
          <div className="match-host__file-card">
            <p className="match-host__file-title">{fileName}</p>
          </div>

          <div className="match-host__nick">
            <img src={ASSETS_MATCH_EXCEL.crown} alt="" width={14} height={14} />
            <span className="match-host__nick-txt">{nickname}</span>
          </div>

          <button type="button" className="match-host__copy" onClick={copyInvite}>
            초대 URL 복사
          </button>

          <div className="match-host__wait">
            <div className="match-host__spin-wrap">
              <ExcelMotionLoading size={31} />
            </div>
            <WaitingDotsText className="match-host__wait-txt" />
          </div>
        </div>
      </div>
    </MobileFrame>
  );
}
