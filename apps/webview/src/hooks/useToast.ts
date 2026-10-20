import { useCallback, useEffect, useRef, useState } from 'react';
import type { ToastState, ToastType } from '../components/ui/Toast';

export interface UseToastResult {
  toast: ToastState | null;
  showToast: (message: string, type?: ToastType, durationMs?: number) => void;
  dismiss: () => void;
}

/**
 * Owns transient toast state and its auto-dismiss timer.
 */
export function useToast(): UseToastResult {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const dismiss = useCallback(() => {
    clearTimer();
    setToast(null);
  }, [clearTimer]);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info', durationMs = 3000) => {
      clearTimer();
      setToast({ message, type });
      if (durationMs > 0) {
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          setToast(null);
        }, durationMs);
      }
    },
    [clearTimer],
  );

  useEffect(() => clearTimer, [clearTimer]);

  return { toast, showToast, dismiss };
}
