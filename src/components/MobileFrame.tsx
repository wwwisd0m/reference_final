import type { ReactNode } from 'react';
import './mobile-frame.css';

export function MobileFrame({ children }: { children: ReactNode }) {
  return <div className="mobile-frame">{children}</div>;
}
