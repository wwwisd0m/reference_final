import { Navigate, Route, Routes } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { MatchPage } from './pages/MatchPage';
import { OmokPage } from './pages/OmokPage';
import { BingoPage } from './pages/BingoPage';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/match/:gameId" element={<MatchPage />} />
      <Route path="/play/omok" element={<OmokPage />} />
      <Route path="/play/bingo" element={<BingoPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
