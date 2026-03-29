import './omok-end-modals.css';

type Props = {
  variant: 'runway' | 'win' | 'lose' | 'draw' | null;
  online: boolean;
  countdownSec: number;
  /** 내가 Final을 눌러 상대를 기다리는 중 */
  finalWaiting: boolean;
  onRunwayOk: () => void;
  onFinal: () => void;
  onLeaveFirst: () => void;
  practiceOnAgain: () => void;
  practiceOnHome: () => void;
};

export function OmokEndModals({
  variant,
  online,
  countdownSec,
  finalWaiting,
  onRunwayOk,
  onFinal,
  onLeaveFirst,
  practiceOnAgain,
  practiceOnHome,
}: Props) {
  if (!variant) return null;

  if (variant === 'runway') {
    return (
      <div className="omok-end-overlay" role="presentation">
        <div id="runway" className="omok-end-card" role="alertdialog" aria-modal="true" aria-labelledby="runway-title">
          <h2 id="runway-title" className="omok-end-card__title">
            상대가 게임을 중단했습니다
          </h2>
          <p className="omok-end-card__desc">상대방이 방을 나갔습니다.</p>
          <button type="button" className="omok-end-btn omok-end-btn--primary" onClick={onRunwayOk}>
            OK
          </button>
        </div>
      </div>
    );
  }

  if (!online) {
    const title =
      variant === 'win'
        ? '흑 승리'
        : variant === 'lose'
          ? '백 승리'
          : '무승부';
    return (
      <div className="omok-end-overlay" role="presentation">
        <div
          id={variant === 'draw' ? 'draw' : variant === 'win' ? 'win' : 'lose'}
          className="omok-end-card"
          role="alertdialog"
          aria-modal="true"
        >
          <h2 className="omok-end-card__title">{title}</h2>
          <p className="omok-end-card__desc">연습 모드가 종료되었습니다.</p>
          <div className="omok-end-card__actions omok-end-card__actions--row">
            <button type="button" className="omok-end-btn omok-end-btn--ghost" onClick={practiceOnHome}>
              홈으로
            </button>
            <button type="button" className="omok-end-btn omok-end-btn--primary" onClick={practiceOnAgain}>
              한판 더
            </button>
          </div>
        </div>
      </div>
    );
  }

  const title =
    variant === 'win' ? '승리!' : variant === 'lose' ? '패배…' : '무승부';
  const id = variant === 'draw' ? 'draw' : variant === 'win' ? 'win' : 'lose';

  return (
    <div className="omok-end-overlay" role="presentation">
      <div id={id} className="omok-end-card" role="alertdialog" aria-modal="true" aria-labelledby={`${id}-title`}>
        <h2 id={`${id}-title`} className="omok-end-card__title">
          {title}
        </h2>
        <p className="omok-end-card__desc">
          재대결을 원하면 <strong>Final</strong>을 누르세요. ({Math.max(0, countdownSec)}초 남음)
        </p>
        <div className="omok-end-card__actions">
          <button
            type="button"
            className="omok-end-btn omok-end-btn--primary"
            onClick={onFinal}
            disabled={finalWaiting || countdownSec <= 0}
          >
            {finalWaiting ? 'Final (대기중…)' : 'Final'}
          </button>
          <button type="button" className="omok-end-btn omok-end-btn--ghost" onClick={onLeaveFirst}>
            먼저 나가기
          </button>
        </div>
      </div>
    </div>
  );
}
