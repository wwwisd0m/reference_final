import { useState } from 'react';
import { useTheme, type ThemeId } from '../../context/ThemeContext';
import { ASSETS_ADOBE, ASSETS_EXCEL } from '../../theme/figmaAssets';
import { BugReportFrame } from './FigmaPopovers';
import './home-modals.css';

export function TopBarDoc() {
  const { theme } = useTheme();
  const [bugHover, setBugHover] = useState(false);

  const bugWrapProps = {
    className: 'top-bar__bug-hover',
    onMouseEnter: () => setBugHover(true),
    onMouseLeave: () => setBugHover(false),
  };

  if (theme === 'adobe') {
    return (
      <header className="top-bar top-bar--adobe">
        <div className="top-bar__left">
          <img src={ASSETS_ADOBE.psLogo} alt="" width={20} height={20} className="top-bar__logo" />
          <p className="top-bar__title top-bar__title--adobe">reference-final</p>
        </div>
        <div {...bugWrapProps}>
          <button id="bugrepot" type="button" className="top-bar__bug">
            벌레잡기
          </button>
          {bugHover && (
            <div className="frame-bug--floating">
              <BugReportFrame />
            </div>
          )}
        </div>
      </header>
    );
  }

  if (theme === 'vscode') {
    return (
      <header className="top-bar top-bar--simple">
        <p className="top-bar__title top-bar__title--simple">reference-final</p>
        <div {...bugWrapProps}>
          <button id="bugrepot" type="button" className="top-bar__bug top-bar__bug--simple">
            벌레잡기
          </button>
          {bugHover && (
            <div className="frame-bug--floating">
              <BugReportFrame />
            </div>
          )}
        </div>
      </header>
    );
  }

  return (
    <header className="top-bar top-bar--excel">
      <img src={ASSETS_EXCEL.excelLogo} alt="" width={22} height={22} className="top-bar__logo" />
      <p className="top-bar__title top-bar__title--excel">reference-final</p>
      <div {...bugWrapProps}>
        <button id="bugrepot" type="button" className="top-bar__bug">
          벌레잡기
        </button>
        {bugHover && (
          <div className="frame-bug--floating">
            <BugReportFrame />
          </div>
        )}
      </div>
    </header>
  );
}

const SKIN_ORDER: ThemeId[] = ['excel', 'adobe', 'vscode'];
const SKIN_LABEL: Record<ThemeId, string> = {
  excel: 'Ewxel',
  adobe: 'Adude',
  vscode: 'Simple',
};

export function SkinSelect() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="skin-area">
      <div className="skin-area__inner">
        <span className="skin-area__label">스킨을 선택하세요</span>
        <div className="skin-area__radios">
          {SKIN_ORDER.map((id) => (
            <label key={id} className="skin-radio">
              <input
                type="radio"
                name="skin"
                checked={theme === id}
                onChange={() => setTheme(id)}
              />
              <span className="skin-radio__dot" />
              <span className={theme === id ? 'skin-radio__text skin-radio__text--on' : 'skin-radio__text'}>
                {SKIN_LABEL[id]}
              </span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
