"use client";

import { useId } from "react";

interface SparklinePoint {
  returnPct: number;
  equity: number;
}

interface SparklineChartProps {
  points: SparklinePoint[];
  positive?: boolean;
  height?: number;
  width?: number;
}

export function SparklineChart({
  points,
  positive = true,
  height = 40,
  width = 128,
}: SparklineChartProps) {
  const uid = useId().replace(/:/g, "");
  if (!points || points.length < 2) {
    return (
      <div
        style={{ width, height }}
        className="flex items-center justify-center rounded border border-slate-800/60 bg-slate-900/40 text-[10px] font-mono text-slate-600"
      >
        —
      </div>
    );
  }

  const values = points.map((p) => p.returnPct);
  const minVal = Math.min(...values, 0);
  const maxVal = Math.max(...values, 0.01);
  const range = maxVal - minVal || 1;
  const padY = 4;

  const coords = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y =
      height - padY - ((v - minVal) / range) * (height - padY * 2);
    return { x, y };
  });

  const linePath = coords
    .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(" ");

  const zeroY =
    height - padY - ((0 - minVal) / range) * (height - padY * 2);

  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;
  const strokeColor = positive ? "#10B981" : "#F43F5E";

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
    >
      <defs>
        <linearGradient id={`spark-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={strokeColor} stopOpacity="0.32" />
          <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <line
        x1={0}
        y1={zeroY}
        x2={width}
        y2={zeroY}
        stroke="rgba(148, 163, 184, 0.2)"
        strokeDasharray="2 2"
        strokeWidth={1}
      />
      <path d={areaPath} fill={`url(#spark-${uid})`} />
      <path
        d={linePath}
        fill="none"
        stroke={strokeColor}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
