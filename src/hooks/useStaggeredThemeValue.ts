import { useEffect, useState } from "react";

type IdleDeadlineLike = {
  didTimeout: boolean;
  timeRemaining: () => number;
};

type RequestIdleCallbackLike = (
  callback: (deadline: IdleDeadlineLike) => void,
  options?: { timeout?: number },
) => number;

type CancelIdleCallbackLike = (handle: number) => void;

export function useStaggeredThemeValue(value: boolean, delayMs: number) {
  const [staggeredValue, setStaggeredValue] = useState(value);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | undefined;
    let idleId: number | undefined;

    const applyValue = () => {
      const requestIdle = (window as Window & { requestIdleCallback?: RequestIdleCallbackLike }).requestIdleCallback;
      if (requestIdle) {
        idleId = requestIdle(() => {
          if (!cancelled) setStaggeredValue(value);
        }, { timeout: 1200 });
        return;
      }

      timeoutId = window.setTimeout(() => {
        if (!cancelled) setStaggeredValue(value);
      }, 0);
    };

    timeoutId = window.setTimeout(applyValue, delayMs);

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
      if (idleId !== undefined) {
        const cancelIdle = (window as Window & { cancelIdleCallback?: CancelIdleCallbackLike }).cancelIdleCallback;
        cancelIdle?.(idleId);
      }
    };
  }, [delayMs, value]);

  return staggeredValue;
}
