import { useNavigate } from 'react-router-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MobileFrame } from '../components/MobileFrame';
import { CreditFrame } from '../components/home/FigmaPopovers';
import { SkinSelect, TopBarDoc } from '../components/home/HomeChrome';
import './home.css';
import { useTheme } from '../context/ThemeContext';
import { sanitizeNickname } from '../lib/nickname';
import { ASSETS_ADOBE, ASSETS_EXCEL, ASSETS_SIMPLE } from '../theme/figmaAssets';

type GameId = 'omok' | 'bingo';

export function HomePage() {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const [nick, setNick] = useState('');
  const [creditOpen, setCreditOpen] = useState(false);
  const [selectedGame, setSelectedGame] = useState<GameId>('omok');
  const [nickTipOpen, setNickTipOpen] = useState(false);
  const nickTipHideRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (nickTipHideRef.current) clearTimeout(nickTipHideRef.current);
    };
  }, []);

  const assets =
    theme === 'adobe' ? ASSETS_ADOBE : theme === 'vscode' ? ASSETS_SIMPLE : ASSETS_EXCEL;

  const nickOk = nick.trim().length > 0;

  useEffect(() => {
    if (nickOk) setNickTipOpen(false);
  }, [nickOk]);

  const goNext = useCallback(() => {
    const n = sanitizeNickname(nick.trim());
    if (!n) return;
    sessionStorage.setItem('nickname', n);
    sessionStorage.setItem(`hostRoom:${selectedGame}`, crypto.randomUUID());
    navigate(`/match/${selectedGame}`, { state: { nickname: n } });
  }, [navigate, nick, selectedGame]);

  const onNextClick = useCallback(() => {
    if (!nickOk) {
      setNickTipOpen(true);
      if (nickTipHideRef.current) clearTimeout(nickTipHideRef.current);
      nickTipHideRef.current = setTimeout(() => setNickTipOpen(false), 3000);
      document.getElementById('nick')?.focus();
      return;
    }
    goNext();
  }, [nickOk, goNext]);

  const nextArrow =
    theme === 'adobe'
      ? ASSETS_ADOBE.arrowForward
      : theme === 'vscode'
        ? ASSETS_SIMPLE.arrowForward
        : ASSETS_EXCEL.arrowForward;

  return (
    <MobileFrame>
      <TopBarDoc />
      <SkinSelect />

      <div className="home-stack">
        <div className="home-credit-row">
          <div
            id="credit"
            className="credit-pill home-credit-anchor"
            onMouseEnter={() => setCreditOpen(true)}
            onMouseLeave={() => setCreditOpen(false)}
          >
            <span className="credit-pill__bg" />
            <span className="credit-pill__txt">credit</span>
            <img src={assets.creditChevron} alt="" width={7} height={5} className="credit-pill__chev" />
            {creditOpen && (
              <div className="frame-credit--floating">
                <CreditFrame />
              </div>
            )}
          </div>
        </div>

        <section className="title-card">
          <p className="title-card__main">Reference.final</p>
          <p className="title-card__sub">by team.NugBug</p>
        </section>

        <div className="nick-field">
          <div className="nick-field__box">
            <input
              id="nick"
              className="nick-field__input"
              maxLength={8}
              value={nick}
              onChange={(e) => setNick(sanitizeNickname(e.target.value))}
              placeholder="닉네임을 입력하세요"
              autoComplete="off"
              required
              aria-required="true"
            />
          </div>
        </div>

        <div className="game-box">
          <button
            type="button"
            className={
              'game-row' + (selectedGame === 'omok' ? ' game-row--on' : '')
            }
            onClick={() => setSelectedGame('omok')}
          >
            <img
              src={selectedGame === 'omok' ? assets.radioOn : assets.radioOff}
              alt=""
              width={14}
              height={14}
              className="game-row__radio"
            />
            <img src={assets.panorama} alt="" width={16} height={16} />
            <span className="game-row__label">5mok.jpg</span>
          </button>
          <button
            type="button"
            className={
              'game-row' + (selectedGame === 'bingo' ? ' game-row--on' : '')
            }
            onClick={() => setSelectedGame('bingo')}
          >
            <img
              src={selectedGame === 'bingo' ? assets.radioOn : assets.radioOff2}
              alt=""
              width={14}
              height={14}
              className="game-row__radio"
            />
            <img src={assets.picturePdf} alt="" width={16} height={16} />
            <span className="game-row__label">bingo.pdf</span>
          </button>
        </div>

        <div className="action-buttons action-buttons--end">
          <div className="home-next-wrap">
            <div
              id="home-nick-tooltip"
              className={'home-nick-tooltip' + (nickTipOpen ? ' home-nick-tooltip--open' : '')}
              role="tooltip"
              aria-live="polite"
              hidden={!nickTipOpen}
            >
              닉네임을 입력해 주세요
            </div>
            <button
              type="button"
              className={'home-next home-next--' + theme}
              onClick={onNextClick}
              aria-label="다음"
              aria-disabled={!nickOk}
              aria-describedby={nickTipOpen ? 'home-nick-tooltip' : undefined}
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
