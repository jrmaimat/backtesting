"use client";

import { useId, useMemo, useRef, useState } from "react";
import {
  formatCurrencyExact,
  formatPct,
  formatShortDate,
} from "@/lib/formatters";

export interface EquityChartPoint {
  pointIndex: number;
  timestamp: string;
  equity: number;
  returnPct: number;
  drawdownPct: number;
  drawdownAmount: number;
  benchmarkEquity?: number | null;
}

interface EquityDrawdownChartProps {
  points: EquityChartPoint[];
  initialCapital: number;
  height?: number;
}

export function EquityDrawdownChart({
  points,
  initialCapital,
  height = 410,
}: EquityDrawdownChartProps) {
  const uid = useId().replace(/:/g, "");
  const containerRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"pct" | "usd">("usd");
  const [showBenchmark, setShowBenchmark] = useState(true);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const hasBenchmark = useMemo(
    () => points.some((p) => typeof p.benchmarkEquity === "number" && p.benchmarkEquity > 0),
    [points]
  );

  const layout = useMemo(() => {
    const svgW = 920;
    const topH = Math.round(height * 0.66);
    const gap = 22;
    const ddH = Math.round(height * 0.28);
    const totalH = topH + gap + ddH + 26;
    const padL = 68;
    const padR = 18;
    const padT = 16;
    const plotW = svgW - padL - padR;

    if (points.length === 0) {
      return null;
    }

    const eqValues = points.map((p) =>
      mode === "usd" ? p.equity : p.returnPct
    );
    const bmValues =
      hasBenchmark && showBenchmark
        ? points
            .map((p) => {
              if (typeof p.benchmarkEquity !== "number" || p.benchmarkEquity <= 0)
                return null;
              if (mode === "usd") return p.benchmarkEquity;
              const bmBase = points[0]?.benchmarkEquity || initialCapital;
              return ((p.benchmarkEquity - bmBase) / bmBase) * 100;
            })
            .filter((v): v is number => v !== null)
        : [];

    const baseline = mode === "usd" ? initialCapital : 0;
    const allTopValues = [...eqValues, ...bmValues, baseline];
    let minEq = Math.min(...allTopValues);
    let maxEq = Math.max(...allTopValues);
    const span = maxEq - minEq || (mode === "usd" ? initialCapital * 0.1 : 10);
    minEq -= span * 0.08;
    maxEq += span * 0.08;

    const ddValues = points.map((p) => p.drawdownPct);
    const minDd = Math.min(...ddValues, -1);

    const xFor = (i: number) =>
      padL +
      (points.length > 1 ? (i / (points.length - 1)) * plotW : plotW / 2);

    const yEqFor = (v: number) =>
      padT +
      (1 - (v - minEq) / (maxEq - minEq || 1)) * (topH - padT - 6);

    const ddTop = topH + gap;
    const yDdFor = (v: number) =>
      ddTop + (Math.abs(v) / (Math.abs(minDd) || 1)) * (ddH - 8);

    const eqCoords = points.map((p, i) => ({
      x: xFor(i),
      y: yEqFor(mode === "usd" ? p.equity : p.returnPct),
    }));

    const eqPath = eqCoords
      .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
      .join(" ");

    const baselineY = yEqFor(baseline);
    const eqAreaPath = `${eqPath} L ${eqCoords[eqCoords.length - 1].x.toFixed(
      1
    )} ${Math.min(topH - 4, baselineY).toFixed(1)} L ${eqCoords[0].x.toFixed(
      1
    )} ${Math.min(topH - 4, baselineY).toFixed(1)} Z`;

    let bmPath = "";
    if (hasBenchmark && showBenchmark) {
      const bmBase = points[0]?.benchmarkEquity || initialCapital;
      const bmCoords = points
        .map((p, i) => {
          if (typeof p.benchmarkEquity !== "number" || p.benchmarkEquity <= 0)
            return null;
          const val =
            mode === "usd"
              ? p.benchmarkEquity
              : ((p.benchmarkEquity - bmBase) / bmBase) * 100;
          return { x: xFor(i), y: yEqFor(val) };
        })
        .filter((c): c is { x: number; y: number } => c !== null);

      bmPath = bmCoords
        .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
        .join(" ");
    }

    const ddCoords = points.map((p, i) => ({
      x: xFor(i),
      y: yDdFor(p.drawdownPct),
    }));
    const ddLinePath = ddCoords
      .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
      .join(" ");
    const ddAreaPath = `${ddLinePath} L ${ddCoords[ddCoords.length - 1].x.toFixed(
      1
    )} ${ddTop} L ${ddCoords[0].x.toFixed(1)} ${ddTop} Z`;

    // Y ticks for equity
    const eqTicks = Array.from({ length: 5 }, (_, i) => {
      const val = minEq + ((maxEq - minEq) * i) / 4;
      return { val, y: yEqFor(val) };
    });

    // Y ticks for drawdown
    const ddTicks = [0, minDd / 2, minDd].map((val) => ({
      val,
      y: yDdFor(val),
    }));

    // X ticks
    const xTickIndices = Array.from({ length: Math.min(6, points.length) }, (_, i) =>
      points.length > 1
        ? Math.round((i * (points.length - 1)) / Math.max(1, Math.min(5, points.length - 1)))
        : 0
    );

    const lastReturn = points[points.length - 1]?.returnPct ?? 0;

    return {
      svgW,
      totalH,
      topH,
      ddTop,
      ddH,
      padL,
      padR,
      plotW,
      baselineY,
      eqPath,
      eqAreaPath,
      bmPath,
      ddLinePath,
      ddAreaPath,
      eqCoords,
      ddCoords,
      eqTicks,
      ddTicks,
      xTickIndices,
      isPositive: lastReturn >= 0,
    };
  }, [points, mode, initialCapital, height, hasBenchmark, showBenchmark]);

  if (!layout || points.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-slate-800 bg-[#0B0F17] text-sm text-slate-500">
        No equity points available.
      </div>
    );
  }

  const activeIndex = hoverIdx !== null ? hoverIdx : points.length - 1;
  const activePoint = points[activeIndex];
  const strokeMain = layout.isPositive ? "#10B981" : "#F43F5E";

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * layout!.svgW;
    const clamped = Math.max(
      layout!.padL,
      Math.min(layout!.padL + layout!.plotW, relX)
    );
    const ratio = (clamped - layout!.padL) / layout!.plotW;
    const idx = Math.round(ratio * (points.length - 1));
    setHoverIdx(Math.max(0, Math.min(points.length - 1, idx)));
  }

  const formatYAxis = (v: number) => {
    if (mode === "pct") return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
    if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
    if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(1)}k`;
    return `$${v.toFixed(0)}`;
  };

  return (
    <div ref={containerRef} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: strokeMain }}
            />
            <span className="font-medium text-slate-300">Strategy Equity</span>
            <span className="font-mono tabular-nums font-semibold text-slate-100">
              {formatCurrencyExact(activePoint.equity)}
            </span>
            <span
              className={`font-mono tabular-nums font-medium ${
                activePoint.returnPct >= 0 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              ({formatPct(activePoint.returnPct)})
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500/80" />
            <span className="text-slate-400">Drawdown</span>
            <span className="font-mono tabular-nums font-medium text-rose-400">
              {formatPct(activePoint.drawdownPct, false)}
            </span>
          </div>

          {hasBenchmark && showBenchmark && activePoint.benchmarkEquity && (
            <div className="flex items-center gap-2">
              <span className="h-0.5 w-4 border-t-2 border-dashed border-cyan-400" />
              <span className="text-slate-400">Benchmark</span>
              <span className="font-mono tabular-nums text-cyan-300">
                {formatCurrencyExact(activePoint.benchmarkEquity)}
              </span>
            </div>
          )}

          <span className="font-mono text-[11px] text-slate-500">
            {formatShortDate(activePoint.timestamp)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {hasBenchmark && (
            <button
              type="button"
              onClick={() => setShowBenchmark((v) => !v)}
              className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                showBenchmark
                  ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-300"
                  : "border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200"
              }`}
            >
              Benchmark
            </button>
          )}
          <div className="inline-flex rounded-lg border border-slate-800 bg-[#0B0F17] p-0.5">
            <button
              type="button"
              onClick={() => setMode("usd")}
              className={`rounded-md px-2.5 py-1 font-mono text-xs font-medium transition ${
                mode === "usd"
                  ? "bg-slate-800 text-slate-100"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              $ USD
            </button>
            <button
              type="button"
              onClick={() => setMode("pct")}
              className={`rounded-md px-2.5 py-1 font-mono text-xs font-medium transition ${
                mode === "pct"
                  ? "bg-slate-800 text-slate-100"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              % Return
            </button>
          </div>
        </div>
      </div>

      <div className="relative rounded-xl border border-slate-800/80 bg-[#0A0E16] p-2">
        <svg
          viewBox={`0 0 ${layout.svgW} ${layout.totalH}`}
          className="h-auto w-full select-none touch-none"
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setHoverIdx(null)}
        >
          <defs>
            <linearGradient id={`eq-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeMain} stopOpacity="0.28" />
              <stop offset="100%" stopColor={strokeMain} stopOpacity="0.01" />
            </linearGradient>
            <linearGradient id={`dd-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#F43F5E" stopOpacity="0.05" />
              <stop offset="100%" stopColor="#F43F5E" stopOpacity="0.34" />
            </linearGradient>
          </defs>

          {/* Equity Gridlines */}
          {layout.eqTicks.map((t, idx) => (
            <g key={idx}>
              <line
                x1={layout.padL}
                y1={t.y}
                x2={layout.padL + layout.plotW}
                y2={t.y}
                stroke="rgba(148, 163, 184, 0.08)"
                strokeWidth={1}
              />
              <text
                x={layout.padL - 8}
                y={t.y + 3.5}
                textAnchor="end"
                className="fill-slate-500 font-mono text-[10px]"
              >
                {formatYAxis(t.val)}
              </text>
            </g>
          ))}

          {/* Baseline (Initial Capital / 0%) */}
          <line
            x1={layout.padL}
            y1={layout.baselineY}
            x2={layout.padL + layout.plotW}
            y2={layout.baselineY}
            stroke="rgba(148, 163, 184, 0.28)"
            strokeDasharray="4 4"
            strokeWidth={1}
          />

          {/* Equity Area & Line */}
          <path d={layout.eqAreaPath} fill={`url(#eq-${uid})`} />
          {layout.bmPath && (
            <path
              d={layout.bmPath}
              fill="none"
              stroke="#06B6D4"
              strokeWidth={1.5}
              strokeDasharray="5 4"
              opacity={0.85}
            />
          )}
          <path
            d={layout.eqPath}
            fill="none"
            stroke={strokeMain}
            strokeWidth={2.2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Underwater Drawdown Label */}
          <text
            x={layout.padL + 4}
            y={layout.ddTop - 6}
            className="fill-slate-500 font-mono text-[9px] uppercase tracking-wider"
          >
            Underwater Drawdown
          </text>

          {/* Drawdown Gridlines */}
          {layout.ddTicks.map((t, idx) => (
            <g key={idx}>
              <line
                x1={layout.padL}
                y1={t.y}
                x2={layout.padL + layout.plotW}
                y2={t.y}
                stroke="rgba(148, 163, 184, 0.08)"
                strokeWidth={1}
              />
              <text
                x={layout.padL - 8}
                y={t.y + 3}
                textAnchor="end"
                className="fill-slate-500 font-mono text-[10px]"
              >
                {t.val.toFixed(1)}%
              </text>
            </g>
          ))}

          <path d={layout.ddAreaPath} fill={`url(#dd-${uid})`} />
          <path
            d={layout.ddLinePath}
            fill="none"
            stroke="#F43F5E"
            strokeWidth={1.5}
            strokeLinejoin="round"
          />

          {/* X-Axis Dates */}
          {layout.xTickIndices.map((idx, i) => {
            const x = layout.eqCoords[idx]?.x ?? layout.padL;
            return (
              <text
                key={`${idx}-${i}`}
                x={x}
                y={layout.totalH - 6}
                textAnchor="middle"
                className="fill-slate-500 font-mono text-[10px]"
              >
                {formatShortDate(points[idx].timestamp)}
              </text>
            );
          })}

          {/* Crosshair */}
          {hoverIdx !== null && layout.eqCoords[hoverIdx] && (
            <g>
              <line
                x1={layout.eqCoords[hoverIdx].x}
                y1={8}
                x2={layout.eqCoords[hoverIdx].x}
                y2={layout.ddTop + layout.ddH}
                stroke="rgba(226, 232, 240, 0.3)"
                strokeDasharray="3 3"
                strokeWidth={1}
              />
              <circle
                cx={layout.eqCoords[hoverIdx].x}
                cy={layout.eqCoords[hoverIdx].y}
                r={4.5}
                fill={strokeMain}
                stroke="#080B10"
                strokeWidth={2}
              />
              <circle
                cx={layout.ddCoords[hoverIdx].x}
                cy={layout.ddCoords[hoverIdx].y}
                r={3.5}
                fill="#F43F5E"
                stroke="#080B10"
                strokeWidth={1.5}
              />
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}
