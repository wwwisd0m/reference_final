import './omok-end-modals.css';
import { useWaitingDotsCount } from '../../hooks/useWaitingDots';

type Props = {
  variant: 'runway' | 'win' | 'lose' | 'draw' | null;
  countdownSec: number;
  /** 내가 재매칭(Final)을 눌러 상대를 기다리는 중 */
  finalWaiting: boolean;
  /** 상대 이탈 모달 본문용 닉네임 */
  opponentName: string;
  onRunwayOk: () => void;
  onFinal: () => void;
  onLeaveFirst: () => void;
};

function formatMmSs(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function OmokEndTimerIcon() {
  return (
    <svg className="omok-end-timer__icon" width="11" height="11" viewBox="0 0 11 11" aria-hidden>
      <circle cx="5.5" cy="5.5" r="4.25" fill="none" stroke="currentColor" strokeWidth="1" />
      <path d="M5.5 3.25V5.5h2" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

function OpponentWaitingDots() {
  const n = useWaitingDotsCount();
  return <span className="omok-end-wait-dots">{'.'.repeat(n)}</span>;
}

export function OmokEndModals({
  variant,
  countdownSec,
  finalWaiting,
  opponentName,
  onRunwayOk,
  onFinal,
  onLeaveFirst,
}: Props) {
  if (!variant) return null;

  if (variant === 'runway') {
    return (
      <div className="omok-end-overlay" role="presentation">
        <div id="runway" className="omok-end-card omok-end-card--figma" role="alertdialog" aria-modal="true" aria-labelledby="runway-title">
          <h2 id="runway-title" className="omok-end-figma-title">
            YOU WIN
          </h2>
          <p className="omok-end-runway-desc">
            <span className="omok-end-runway-desc__name">{opponentName}</span>
            님이 도망가셨습니다.
          </p>
          <div className="omok-end-figma-actions omok-end-figma-actions--single">
            <button type="button" className="omok-end-pill omok-end-pill--ok" onClick={onRunwayOk}>
              OK
            </button>
          </div>
        </div>
      </div>
    );
  }

  const id = variant === 'draw' ? 'draw' : variant === 'win' ? 'win' : 'lose';
  const title =
    variant === 'win' ? 'YOU WIN' : variant === 'lose' ? 'YOU LOSE' : 'DRAW';
  const titleId = `${id}-title`;
  const canRematch = countdownSec > 0;

  const waitingPillClass =
    variant === 'lose'
      ? 'omok-end-pill omok-end-pill--waiting omok-end-pill--waiting-muted'
      : 'omok-end-pill omok-end-pill--waiting omok-end-pill--waiting-outline';

  return (
    <div className="omok-end-overlay" role="presentation">
      <div
        id={id}
        className="omok-end-card omok-end-card--figma omok-end-card--online-end"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="omok-end-timer" aria-label={`재매칭 남은 시간 ${formatMmSs(countdownSec)}`}>
          <OmokEndTimerIcon />
          <span className="omok-end-timer__text">{formatMmSs(countdownSec)}</span>
        </div>
        <h2 id={titleId} className="omok-end-figma-title">
          {title}
        </h2>
        <div className="omok-end-figma-actions">
          {finalWaiting ? (
            <div className={waitingPillClass} role="status" aria-live="polite">
              상대 기다리는 중
              <OpponentWaitingDots />
            </div>
          ) : (
            <button
              type="button"
              className="omok-end-pill omok-end-pill--border"
              onClick={onFinal}
              disabled={!canRematch}
            >
              한번 더 하기
            </button>
          )}
          <button type="button" className="omok-end-pill omok-end-pill--border" onClick={onLeaveFirst}>
            먼저 들어가보겠습니다
          </button>
        </div>
      </div>
    </div>
  );
}
