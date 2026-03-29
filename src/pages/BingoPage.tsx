import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GameLayout } from '../components/game/GameLayout';
import { BINGO_FRUITS_5X5 } from '../lib/bingoGrid';
import './game-play.css';

type Phase = 'setup' | 'play';

/** A_G2_bingo_02 시안: 일부 칸 플레이어 색 (데모) */
const PLAY_CELL_MARK: Record<string, 'p1' | 'p2' | 'focus'> = {
  '0-1': 'p1',
  '1-1': 'p1',
  '2-1': 'p2',
  '1-2': 'focus',
};

export function BingoPage() {
  const navigate = useNavigate();
  const selfName = sessionStorage.getItem('nickname') ?? '나';
  const oppName = sessionStorage.getItem('opponentNickname') ?? '상대';

  const [phase, setPhase] = useState<Phase>('setup');
  const [grid] = useState(() => BINGO_FRUITS_5X5.map((row) => [...row]));

  const goPlay = useCallback(() => setPhase('play'), []);

  const setupCells = useMemo(
    () =>
      grid.map((row, ri) =>
        row.map((label, ci) => {
          const dragDemo = ri === 4 && ci === 2 && label === '애플망고';
          return (
            <div
              key={`${ri}-${ci}`}
              className={'bingo-cell' + (dragDemo ? ' bingo-cell--drag' : '')}
              role="presentation"
            >
              {label}
            </div>
          );
        })
      ),
    [grid]
  );

  const playCells = useMemo(
    () =>
      grid.map((row, ri) =>
        row.map((label, ci) => {
          const key = `${ri}-${ci}`;
          const mark = PLAY_CELL_MARK[key];
          let cls = 'bingo-cell';
          if (mark === 'p1') cls += ' bingo-cell--p1';
          if (mark === 'p2') cls += ' bingo-cell--p2';
          if (mark === 'focus') cls += ' bingo-cell--focus';
          return (
            <button key={key} type="button" className={cls}>
              {label}
            </button>
          );
        })
      ),
    [grid]
  );

  return (
    <GameLayout docTitle="bingo.pdf" onBack={() => navigate('/')}>
      {phase === 'setup' ? (
        <div className="bingo-play">
          <p className="bingo-subject">SUBJECT : 과일</p>
          <div className="bingo-board-wrap">
            <div className="bingo-grid-5">{setupCells.flat()}</div>
          </div>
          <div className="bingo-footer-row">
            <p className="bingo-hint">드래그해서 순서를 바꾸세요</p>
            <div className="omok-player-row__time omok-player-row__time--active">12 : 00</div>
          </div>
          <div className="action-buttons action-buttons--center">
            <button type="button" className="bingo-btn" onClick={goPlay}>
              완료
            </button>
          </div>
        </div>
      ) : (
        <div className="bingo-play">
          <div className="bingo-player-row">
            <div className="omok-player-row__left">
              <span className="omok-player-row__dot omok-player-row__dot--solid" />
              <span className="omok-player-row__name omok-player-row__name--opp">{oppName}</span>
            </div>
            <div className="omok-player-row__time omok-player-row__time--inactive">22 : 00</div>
          </div>

          <p className="bingo-subject">SUBJECT : 과일</p>
          <div className="bingo-board-wrap">
            <div className="bingo-grid-5">{playCells.flat()}</div>
          </div>

          <div className="bingo-player-row">
            <div className="omok-player-row__left">
              <span className="omok-player-row__dot omok-player-row__dot--ring" />
              <span className="omok-player-row__name omok-player-row__name--me">{selfName}</span>
            </div>
            <div className="omok-player-row__time omok-player-row__time--active">12 : 00</div>
          </div>
          <div className="action-buttons action-buttons--center">
            <button type="button" className="bingo-btn">
              턴 넘기기
            </button>
          </div>
        </div>
      )}
    </GameLayout>
  );
}
