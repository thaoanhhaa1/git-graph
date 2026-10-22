import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { CommitItem } from './CommitRow';
import { drawMinimap, minimapYToScrollTop } from './minimapRenderer';

export interface GraphMinimapProps {
  commits: CommitItem[];
  maxGraphLane: number;
  scrollTop: number;
  viewportHeight: number;
  rowHeight: number;
  onScrollTo: (scrollTop: number) => void;
}

const FALLBACK_WIDTH = 44;
const FALLBACK_HEIGHT = 600;

export const GraphMinimap: React.FC<GraphMinimapProps> = ({
  commits,
  maxGraphLane,
  scrollTop,
  viewportHeight,
  rowHeight,
  onScrollTo,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const [size, setSize] = useState({ width: FALLBACK_WIDTH, height: FALLBACK_HEIGHT });

  const totalContentHeight = commits.length * rowHeight;

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const measure = () => {
      const rect = element.getBoundingClientRect?.();
      const width = Math.round(rect?.width || element.clientWidth || FALLBACK_WIDTH);
      const height = Math.round(rect?.height || element.clientHeight || FALLBACK_HEIGHT);
      setSize((prev) =>
        prev.width === width && prev.height === height ? prev : { width, height },
      );
    };

    measure();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(measure);
      observer.observe(element);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext?.('2d');
    if (!context) return;

    const devicePixelRatio =
      typeof window !== 'undefined' && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
    const pixelWidth = Math.max(1, Math.round(size.width * devicePixelRatio));
    const pixelHeight = Math.max(1, Math.round(size.height * devicePixelRatio));

    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    if (typeof context.setTransform === 'function') {
      context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    }

    drawMinimap(
      context,
      {
        commits,
        maxLane: maxGraphLane,
        totalRows: commits.length,
        rowHeight,
        viewportHeight,
        scrollTop,
        width: size.width,
        height: size.height,
      },
      {
        viewport: 'rgba(0, 122, 204, 0.22)',
        viewportBorder: 'rgba(0, 122, 204, 0.7)',
        headRing: '#f38518',
      },
    );
  }, [commits, maxGraphLane, rowHeight, scrollTop, viewportHeight, size.height, size.width]);

  useEffect(() => {
    if (frameRef.current !== null) {
      return;
    }
    const raf =
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame
        : (callback: FrameRequestCallback) => {
            callback(0);
            return 0;
          };
    frameRef.current = raf(() => {
      frameRef.current = null;
      paint();
    });

    return () => {
      const cancel =
        typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : () => undefined;
      if (frameRef.current !== null) {
        cancel(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [paint]);

  const scrollToCoordinate = useCallback(
    (clientY: number) => {
      const element = containerRef.current;
      if (!element) return;
      const rect = element.getBoundingClientRect?.();
      if (!rect || rect.height <= 0) return;
      const relativeY = clientY - rect.top;
      onScrollTo(minimapYToScrollTop(relativeY, rect.height, totalContentHeight, viewportHeight));
    },
    [onScrollTo, totalContentHeight, viewportHeight],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      draggingRef.current = true;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      scrollToCoordinate(event.clientY);
    },
    [scrollToCoordinate],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      scrollToCoordinate(event.clientY);
    },
    [scrollToCoordinate],
  );

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const maxScrollTop = Math.max(0, totalContentHeight - viewportHeight);
      let next: number | null = null;
      switch (event.key) {
        case 'ArrowDown':
          next = scrollTop + rowHeight;
          break;
        case 'ArrowUp':
          next = scrollTop - rowHeight;
          break;
        case 'PageDown':
          next = scrollTop + viewportHeight;
          break;
        case 'PageUp':
          next = scrollTop - viewportHeight;
          break;
        case 'Home':
          next = 0;
          break;
        case 'End':
          next = maxScrollTop;
          break;
        default:
          return;
      }
      event.preventDefault();
      onScrollTo(Math.max(0, Math.min(maxScrollTop, next)));
    },
    [onScrollTo, rowHeight, scrollTop, totalContentHeight, viewportHeight],
  );

  const maxScrollTop = Math.max(0, totalContentHeight - viewportHeight);

  return (
    <div
      ref={containerRef}
      className="graph-minimap"
      role="scrollbar"
      aria-label="Graph minimap overview"
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={maxScrollTop}
      aria-valuenow={Math.max(0, Math.min(maxScrollTop, scrollTop))}
      aria-controls="commit-table-container"
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onKeyDown={handleKeyDown}
      data-testid="graph-minimap"
    >
      <canvas
        ref={canvasRef}
        className="graph-minimap-canvas"
        aria-hidden="true"
        data-testid="graph-minimap-canvas"
      />
    </div>
  );
};

GraphMinimap.displayName = 'GraphMinimap';
