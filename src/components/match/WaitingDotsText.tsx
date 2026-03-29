import { useWaitingDotsCount } from '../../hooks/useWaitingDots';

type Props = {
  className?: string;
};

export function WaitingDotsText({ className }: Props) {
  const dotCount = useWaitingDotsCount();
  const dots = '.'.repeat(dotCount);

  return (
    <p className={className}>
      친구 기다리는 중{dots}
    </p>
  );
}
