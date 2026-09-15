import { useCallback, useEffect, useId, useRef, useState } from "react";

interface Point {
  x: number;
  y: number;
}

export interface PatternLockProps {
  onComplete?: (pattern: number[]) => void;
  onChange?: (pattern: number[]) => void;
  error?: boolean;
  success?: boolean;
  disabled?: boolean;
  size?: number;
  className?: string;
}

function getIntermediateNode(from: number, to: number): number | null {
  const rowA = Math.floor(from / 3);
  const colA = from % 3;
  const rowB = Math.floor(to / 3);
  const colB = to % 3;

  if ((rowA + rowB) % 2 === 0 && (colA + colB) % 2 === 0) {
    const rowMid = (rowA + rowB) / 2;
    const colMid = (colA + colB) / 2;
    return rowMid * 3 + colMid;
  }

  return null;
}

export function PatternLock({
  onComplete,
  onChange,
  error = false,
  success = false,
  disabled = false,
  size = 260,
  className = "",
}: PatternLockProps) {
  const [selectedPoints, setSelectedPointsState] = useState<number[]>([]);
  const selectedPointsRef = useRef<number[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [livePointer, setLivePointer] = useState<Point | null>(null);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const isMountedRef = useRef(true);
  const rafId = useRef<number | null>(null);

  const updateSelectedPoints = useCallback((points: number[]) => {
    selectedPointsRef.current = points;
    setSelectedPointsState(points);
  }, []);

  const clearPendingRaf = useCallback(() => {
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      clearPendingRaf();
    };
  }, [clearPendingRaf]);

  const svgRef = useRef<SVGSVGElement>(null);
  const filterId = useId();
  const filterUrl = `url(#${filterId})`;

  const getNodeCenter = useCallback(
    (index: number): Point => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      const step = size / 3;
      return {
        x: col * step + step / 2,
        y: row * step + step / 2,
      };
    },
    [size],
  );

  const getPointIndex = useCallback(
    (clientX: number, clientY: number): number | null => {
      if (!svgRef.current) return null;
      const rect = svgRef.current.getBoundingClientRect();
      const scale = size / rect.width;
      const x = (clientX - rect.left) * scale;
      const y = (clientY - rect.top) * scale;

      const step = size / 3;

      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          const cx = col * step + step / 2;
          const cy = row * step + step / 2;
          const dist = Math.hypot(x - cx, y - cy);
          if (dist < step / 2.3) {
            return row * 3 + col;
          }
        }
      }
      return null;
    },
    [size],
  );

  const addNodeWithIntermediates = useCallback((currentPoints: number[], nextNode: number) => {
    if (currentPoints.includes(nextNode)) return currentPoints;
    if (currentPoints.length === 0) return [nextNode];

    const lastNode = currentPoints[currentPoints.length - 1];
    if (lastNode === undefined) return [nextNode];

    const intermediate = getIntermediateNode(lastNode, nextNode);
    const updated = [...currentPoints];

    if (intermediate !== null && !updated.includes(intermediate)) {
      updated.push(intermediate);
    }

    if (!updated.includes(nextNode)) {
      updated.push(nextNode);
    }

    return updated;
  }, []);

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (disabled) return;

    clearPendingRaf();

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore in environments without pointer capture
    }

    setIsDrawing(true);
    const rect = e.currentTarget.getBoundingClientRect();
    const scale = size / rect.width;
    const px = (e.clientX - rect.left) * scale;
    const py = (e.clientY - rect.top) * scale;
    setLivePointer({ x: px, y: py });

    const idx = getPointIndex(e.clientX, e.clientY);
    const newPoints = idx !== null ? [idx] : [];
    updateSelectedPoints(newPoints);
    onChangeRef.current?.(newPoints);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDrawing || disabled) return;

    const clientX = e.clientX;
    const clientY = e.clientY;
    const currentTarget = e.currentTarget;

    clearPendingRaf();

    rafId.current = requestAnimationFrame(() => {
      rafId.current = null;
      if (!currentTarget || !isMountedRef.current) return;

      const rect = currentTarget.getBoundingClientRect();
      const scale = size / rect.width;
      const px = (clientX - rect.left) * scale;
      const py = (clientY - rect.top) * scale;
      setLivePointer({ x: px, y: py });

      const idx = getPointIndex(clientX, clientY);
      if (idx !== null) {
        const currentPoints = selectedPointsRef.current;
        const next = addNodeWithIntermediates(currentPoints, idx);
        if (
          next.length !== currentPoints.length ||
          next.some((val, i) => val !== currentPoints[i])
        ) {
          updateSelectedPoints(next);
          onChangeRef.current?.(next);
        }
      }
    });
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDrawing) return;
    clearPendingRaf();
    setIsDrawing(false);
    setLivePointer(null);

    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore
    }

    onComplete?.(selectedPointsRef.current);
  };

  const handlePointerCancel = (e: React.PointerEvent<SVGSVGElement>) => {
    clearPendingRaf();
    setIsDrawing(false);
    setLivePointer(null);
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore
    }
    updateSelectedPoints([]);
    onChangeRef.current?.([]);
  };

  // Reset selected points when error clears or disabled changes
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        if (!isMountedRef.current) return;
        updateSelectedPoints([]);
        onChangeRef.current?.([]);
      }, 400);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [error, updateSelectedPoints]);

  const strokeColor = error ? "var(--destructive)" : success ? "var(--primary)" : "var(--primary)";

  const nodeFillColor = error
    ? "var(--destructive)"
    : success
      ? "var(--primary)"
      : "var(--primary)";

  const lastSelectedNode =
    selectedPoints.length > 0 ? selectedPoints[selectedPoints.length - 1] : null;
  const lastCenter =
    lastSelectedNode !== null && lastSelectedNode !== undefined
      ? getNodeCenter(lastSelectedNode)
      : null;

  return (
    <div className={`relative inline-flex items-center justify-center select-none ${className}`}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${size} ${size}`}
        style={{ width: size, height: size }}
        className="touch-none rounded-2xl border border-border bg-card p-2 shadow-sm transition-colors duration-200"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        <defs>
          <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Lines between selected nodes */}
        {selectedPoints.map((pt, i) => {
          if (i === 0) return null;
          const prevPt = selectedPoints[i - 1];
          if (prevPt === undefined) return null;
          const p1 = getNodeCenter(prevPt);
          const p2 = getNodeCenter(pt);
          return (
            <line
              key={`line-${i}`}
              x1={p1.x}
              y1={p1.y}
              x2={p2.x}
              y2={p2.y}
              stroke={strokeColor}
              strokeWidth="5"
              strokeLinecap="round"
              className="transition-all duration-75"
            />
          );
        })}

        {/* Live finger / gesture trail line to pointer */}
        {isDrawing && lastCenter && livePointer && (
          <line
            x1={lastCenter.x}
            y1={lastCenter.y}
            x2={livePointer.x}
            y2={livePointer.y}
            stroke={strokeColor}
            strokeWidth="3.5"
            strokeDasharray="6 4"
            strokeLinecap="round"
            className="opacity-70"
          />
        )}

        {/* 3x3 Grid Nodes */}
        {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((idx) => {
          const { x, y } = getNodeCenter(idx);
          const isSelected = selectedPoints.includes(idx);
          const isCurrentEndpoint = lastSelectedNode === idx && isDrawing;

          return (
            <g key={idx} className="cursor-pointer">
              {/* Outer touch target highlight */}
              <circle
                cx={x}
                cy={y}
                r="30"
                fill="transparent"
                className="hover:fill-muted/20 transition-colors"
              />

              {/* Inactive node ring */}
              <circle
                cx={x}
                cy={y}
                r="16"
                fill="none"
                stroke="var(--muted-foreground)"
                strokeOpacity="0.3"
                strokeWidth="2"
                className={`transition-all duration-150 ${
                  isSelected ? "scale-110 opacity-0" : "opacity-100"
                }`}
              />

              {/* Inactive center dot */}
              <circle
                cx={x}
                cy={y}
                r="5"
                fill="var(--muted-foreground)"
                fillOpacity="0.5"
                className={`transition-all duration-150 ${isSelected ? "opacity-0" : "opacity-100"}`}
              />

              {/* Selected state outer pulse ring */}
              {isSelected && (
                <circle
                  cx={x}
                  cy={y}
                  r={isCurrentEndpoint ? "22" : "18"}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth="2"
                  className={`opacity-40 transition-all duration-200 ${
                    isCurrentEndpoint ? "animate-pulse" : ""
                  }`}
                />
              )}

              {/* Selected center node */}
              {isSelected && (
                <circle
                  cx={x}
                  cy={y}
                  r={isCurrentEndpoint ? "11" : "9"}
                  fill={nodeFillColor}
                  filter={filterUrl}
                  className="transition-all duration-150"
                />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
