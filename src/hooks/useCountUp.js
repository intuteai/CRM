import { useEffect, useState } from 'react';

// Counts a number up from 0 to `target` (ease-out). Non-numeric targets are returned as-is, and
// people who ask their OS for reduced motion just get the final number.
export function useCountUp(target, { duration = 1400, delay = 0 } = {}) {
  const numeric = typeof target === 'number' && Number.isFinite(target) ? target : null;
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (numeric === null) return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setValue(numeric);
      return undefined;
    }

    let frame;
    let start = null;
    const step = (now) => {
      if (start === null) start = now;
      const progress = Math.min((now - start) / duration, 1);
      setValue(Math.round(numeric * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    const timer = setTimeout(() => { frame = requestAnimationFrame(step); }, delay);

    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [numeric, duration, delay]);

  return numeric === null ? target : value;
}
