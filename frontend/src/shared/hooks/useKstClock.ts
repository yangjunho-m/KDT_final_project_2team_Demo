import { useEffect, useState } from "react";
import { formatKstClock } from "../utils/datetime";

/** 1초마다 갱신되는 KST 현재 시각 문자열. */
export function useKstClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return formatKstClock(now);
}
