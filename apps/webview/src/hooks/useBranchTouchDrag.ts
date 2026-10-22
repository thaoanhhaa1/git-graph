import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefBadgeItem } from '../features/refs/RefBadge';

export interface TouchDragState {
  source: RefBadgeItem;
  x: number;
  y: number;
}

export interface UseBranchTouchDragOptions {
  onStart?: (source: RefBadgeItem) => void;
  onTargetChange?: (targetSha: string | null) => void;
  onDrop?: (source: RefBadgeItem, targetSha: string) => void;
  onCancel?: (source: RefBadgeItem) => void;
}

const TOUCH_DRAG_THRESHOLD = 8;

interface TouchStartPoint {
  x: number;
  y: number;
}

function findCommitShaAtPoint(x: number, y: number): string | null {
  if (typeof document.elementFromPoint !== 'function') return null;
  const element = document.elementFromPoint(x, y) as Element | null;
  const row = element?.closest?.('[data-commit-sha]') as HTMLElement | null;
  return row?.dataset.commitSha ?? null;
}

/**
 * Enables pointer-less branch dragging on touch devices. A drag only starts after
 * the touch moves beyond a small threshold so taps still behave like taps.
 */
export function useBranchTouchDrag(options: UseBranchTouchDragOptions) {
  const [dragState, setDragState] = useState<TouchDragState | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const sourceRef = useRef<RefBadgeItem | null>(null);
  const startPointRef = useRef<TouchStartPoint | null>(null);
  const draggingRef = useRef(false);
  const targetRef = useRef<string | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const cleanup = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    sourceRef.current = null;
    startPointRef.current = null;
    draggingRef.current = false;
    targetRef.current = null;
    setDragState(null);
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const handleTouchStart = useCallback(
    (refItem: RefBadgeItem, event: React.TouchEvent<HTMLSpanElement>) => {
      const touch = event.touches[0];
      if (!touch) return;

      cleanupRef.current?.();
      sourceRef.current = refItem;
      startPointRef.current = { x: touch.clientX, y: touch.clientY };
      draggingRef.current = false;
      targetRef.current = null;

      const handleMove = (moveEvent: TouchEvent) => {
        const source = sourceRef.current;
        const startPoint = startPointRef.current;
        const currentTouch = moveEvent.touches[0];
        if (!source || !startPoint || !currentTouch) return;

        if (!draggingRef.current) {
          const dx = currentTouch.clientX - startPoint.x;
          const dy = currentTouch.clientY - startPoint.y;
          if (Math.hypot(dx, dy) < TOUCH_DRAG_THRESHOLD) return;
          draggingRef.current = true;
          optionsRef.current.onStart?.(source);
        }

        moveEvent.preventDefault();
        setDragState({ source, x: currentTouch.clientX, y: currentTouch.clientY });

        const targetSha = findCommitShaAtPoint(currentTouch.clientX, currentTouch.clientY);
        if (targetSha !== targetRef.current) {
          targetRef.current = targetSha;
          optionsRef.current.onTargetChange?.(targetSha);
        }
      };

      const handleEnd = (endEvent: TouchEvent) => {
        const source = sourceRef.current;
        const wasDragging = draggingRef.current;
        const targetSha = targetRef.current;
        cleanup();
        if (!wasDragging || !source) return;
        endEvent.preventDefault();
        if (targetSha) {
          optionsRef.current.onDrop?.(source, targetSha);
        } else {
          optionsRef.current.onCancel?.(source);
        }
      };

      const handleCancel = () => {
        const source = sourceRef.current;
        const wasDragging = draggingRef.current;
        cleanup();
        if (wasDragging && source) {
          optionsRef.current.onCancel?.(source);
        }
      };

      const removeListeners = () => {
        document.removeEventListener('touchmove', handleMove);
        document.removeEventListener('touchend', handleEnd);
        document.removeEventListener('touchcancel', handleCancel);
      };

      cleanupRef.current = removeListeners;
      document.addEventListener('touchmove', handleMove, { passive: false });
      document.addEventListener('touchend', handleEnd);
      document.addEventListener('touchcancel', handleCancel);
    },
    [cleanup],
  );

  return { dragState, handleTouchStart, cancelTouchDrag: cleanup };
}
