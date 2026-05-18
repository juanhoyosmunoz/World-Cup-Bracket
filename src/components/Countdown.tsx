import { useEffect, useState } from "react";
import { formatCountdown, msUntil } from "../lib/locking";
import type { Timestamp } from "firebase/firestore";

interface Props {
  to: Timestamp | Date | null | undefined;
  className?: string;
  prefix?: string;
  lockedLabel?: string;
}

export default function Countdown({ to, className, prefix = "Locks in", lockedLabel = "Locked" }: Props) {
  const [ms, setMs] = useState(() => msUntil(to as any));
  useEffect(() => {
    const id = setInterval(() => setMs(msUntil(to as any)), 1000);
    return () => clearInterval(id);
  }, [to]);
  if (ms <= 0) return <span className={className}>{lockedLabel}</span>;
  return (
    <span className={className}>
      {prefix} {formatCountdown(ms)}
    </span>
  );
}
