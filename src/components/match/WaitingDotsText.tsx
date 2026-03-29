import { useEffect, useState } from 'react';

/** 0 → 1 → 2 → 3 → 2 → 1 → 0 … 점 개수 왕복 */
const DOT_SEQUENCE = [0, 1, 2, 3, 2, 1];
const TICK_MS = 420;

type Props = {
  className?: string;
};

export function WaitingDotsText({ className }: Props) {
  const [i, setI] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setI((n) => (n + 1) % DOT_SEQUENCE.length);
    }, TICK_MS);
    return () => clearInterval(id);
  }, []);

  const dots = '.'.repeat(DOT_SEQUENCE[i]);

  return (
    <p className={className}>
      친구 기다리는 중{dots}
    </p>
  );
}
