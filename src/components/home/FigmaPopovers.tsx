import { BUG_MODAL_CLOSE } from '../../theme/figmaAssets';
import './home-modals.css';

const CREDIT_ROWS: { role: string; name: string }[] = [
  { role: 'Planner', name: '아델.lee' },
  { role: 'Designer', name: '홍디' },
  { role: 'FE Developer', name: '옥시' },
  { role: 'BE Developer', name: 'claud, cursor' },
];

/** 피그마 credit 프레임 (0:1885) */
export function CreditFrame() {
  return (
    <div className="frame-credit" role="tooltip">
      <div className="frame-credit__brand">
        <span className="frame-credit__team">team</span>
        <span className="frame-credit__name">NugBug</span>
      </div>
      <div className="frame-credit__rows">
        {CREDIT_ROWS.map((row) => (
          <div key={row.role} className="frame-credit__row">
            <span className="frame-credit__role">{row.role}</span>
            <span className="frame-credit__who">{row.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 피그마 bugrepot 프레임 (0:1893) */
export function BugReportFrame({ onClose }: { onClose: () => void }) {
  return (
    <div className="frame-bug" role="dialog" aria-labelledby="bugrepot-title">
      <button type="button" className="frame-bug__close" onClick={onClose} aria-label="닫기">
        <img src={BUG_MODAL_CLOSE} alt="" width={14} height={14} />
      </button>
      <p id="bugrepot-title" className="frame-bug__text">
        버그를 발견하셨나요?
        <br />
        이쪽으로 메일을 남겨주세요!
      </p>
      <a className="frame-bug__mail" href="mailto:team.nugbug@gmail.com">
        team.nugbug@gmail.com
      </a>
    </div>
  );
}
