import type { ReactNode } from 'react';
import { MobileFrame } from '../MobileFrame';
import { TopBarDoc } from '../home/HomeChrome';
import { ASSETS_MATCH_EXCEL } from '../../theme/figmaAssets';
import './game-layout.css';

type Props = {
  docTitle: string;
  onBack: () => void;
  children: ReactNode;
};

export function GameLayout({ docTitle, onBack, children }: Props) {
  return (
    <MobileFrame>
      <TopBarDoc />
      <header className="game-doc-bar">
        <button type="button" className="game-doc-bar__back" onClick={onBack} aria-label="뒤로">
          <img src={ASSETS_MATCH_EXCEL.arrowBack} alt="" width={24} height={24} />
        </button>
        <span className="game-doc-bar__title">{docTitle}</span>
      </header>

      <div className="game-sheet">
        <div className="game-sheet__grid-bg" aria-hidden>
          <img src={ASSETS_MATCH_EXCEL.gridV} alt="" className="game-sheet__grid-v" />
          <img src={ASSETS_MATCH_EXCEL.gridH} alt="" className="game-sheet__grid-h" />
        </div>
        <div className="game-sheet__content">{children}</div>
      </div>
    </MobileFrame>
  );
}
