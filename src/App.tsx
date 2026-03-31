import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { MatchPage } from './pages/MatchPage';
import { OmokPage } from './pages/OmokPage';
import { BingoPage } from './pages/BingoPage';

const DOC_TITLE = 'reference-final';

function SyncDocumentTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = DOC_TITLE;
  }, [pathname]);
  return null;
}

export function App() {
  return (
    <>
      <SyncDocumentTitle />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/match/:gameId" element={<MatchPage />} />
        <Route path="/play/omok" element={<OmokPage />} />
        <Route path="/play/bingo" element={<BingoPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
