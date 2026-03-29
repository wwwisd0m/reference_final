import { useEffect, useState } from 'react';

/** 0 → 1 → 2 → 3 → 2 → 1 → 0 … 점 개수 왕복 (친구 대기중과 동일) */
export const WAITING_DOT_SEQUENCE = [0, 1, 2, 3, 2, 1];
export const WAITING_DOT_TICK_MS = 420;

export function useWaitingDotsCount(): number {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => {
      setI((n) => (n + 1) % WAITING_DOT_SEQUENCE.length);
    }, WAITING_DOT_TICK_MS);
    return () => clearInterval(id);
  }, []);
  return WAITING_DOT_SEQUENCE[i];
}
