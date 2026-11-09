"use client";

import { useMemo, useState } from "react";
import type { BacktestEquityPointRecord, BacktestRecord } from "@/db/schema";
import { formatPct, formatShortDate } from "@/lib/formatters";

export const STRATEGY_COLORS = [
  "#10B981", // Emerald
  "#3B82F6", // Blue
  "#F59E0B", // Amber
  "#A855F7", // Purple
  "#06B6D4", // Cyan
  "#EC4899", // Pink
];

interface StrategyWithPoints {
  backtest: BacktestRecord;
  equityPoints: BacktestEquityPointRecord[];
}

interface CompareOverlayChartProps {
  strategies: StrategyWithPoints[];
}

export function CompareOverlayChart({ strategies }: CompareOverlayChartProps) {
  const [xMode, setXMode] = useState<"date" | "progress">("date");
  const [hoverRatio, setHoverRatio] = useState<number | null>(null);

  const chartData = useMemo(() => {
    if (strategies.length === 0) return null;

    const svgW = 940;
    const topH = 260;
    const gap = 22;
    const ddH = 115;
    const totalH = topH + gap + ddH + 28;
    const padL = 62;
    const padR = 18;
    const padT = 16;
    const plotW = svgW - padL - padR;

    // Determine date span for date mode
    const allTimestamps = strategies.flatMap((s) =>
      s.equityPoints.map((p) => new Date(p.timestamp).getTime())
    ).filter((t) => Number.isFinite(t));

    const minTs = allTimestamps.length > 0 ? Math.min(...allTimestamps) : 0;
    const maxTs = allTimestamps.length > 0 ? Math.max(...allTimestamps) : 1;
    const tsSpan = Math.max(1, maxTs - minTs);

    const allReturns = strategies.flatMap((s) =>
      s.equityPoints.map((p) => p.returnPct)
    );
    const allDrawdowns = strategies.flatMap((s) =>
      s.equityPoints.map((p) => p.drawdownPct)
    );

    let minRet = Math.min(0, ...allReturns);
    let maxRet = Math.max(5, ...allReturns);
    const retSpan = maxRet - minRet || 10;
    minRet -= retSpan * 0.08;
    maxRet += retSpan * 0.08;

    const minDd = Math.min(-2, ...allDrawdowns);

    const yRetFor = (v: number) =>
      padT + (1 - (v - minRet) / (maxRet - minRet || 1)) * (topH - padT - 6);
    const ddTop = topH + gap;
    const yDdFor = (v: number) =>
      ddTop + (Math.abs(v) / (Math.abs(minDd) || 1)) * (ddH - 8);

    const series = strategies.map((s, sIdx) => {
      const pts = s.equityPoints;
      const color = STRATEGY_COLORS[sIdx % STRATEGY_COLORS.length];
      const mapped = pts.map((p, i) => {
        const ratio =
          xMode === "date"
            ? (new Date(p.timestamp).getTime() - minTs) / tsSpan
            : pts.length > 1
              ? i / (pts.length - 1)
              : 0;
        const x = padL + Math.max(0, Math.min(1, ratio)) * plotW;
        return {
          x,
          yRet: yRetFor(p.returnPct),
          yDd: yDdFor(p.drawdownPct),
          ratio: Math.max(0, Math.min(1, ratio)),
          returnPct: p.returnPct,
          drawdownPct: p.drawdownPct,
          timestamp: p.timestamp,
        };
      });

      const retPath = mapped
        .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.yRet.toFixed(1)}`)
        .join(" ");
      const ddPath = mapped
        .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.yDd.toFixed(1)}`)
        .join(" ");

      return {
        id: s.backtest.id,
        name: s.backtest.name,
        symbol: s.backtest.symbol,
        color,
        mapped,
        retPath,
        ddPath,
      };
    });

    const retTicks = Array.from({ length: 5 }, (_, i) => {
      const val = minRet + ((maxRet - minRet) * i) / 4;
      return { val, y: yRetFor(val) };
    });

    const ddTicks = [0, minDd / 2, minDd].map((val) => ({
      val,
      y: yDdFor(val),
    }));

    const xTicks = Array.from({ length: 5 }, (_, i) => {
      const ratio = i / 4;
      const x = padL + ratio * plotW;
      const label =
        xMode === "date"
          ? formatShortDate(new Date(minTs + ratio * tsSpan).toISOString())
          : `${Math.round(ratio * 100)}%`;
      return { x, label };
    });

    return {
      svgW,
      totalH,
      topH,
      ddTop,
      ddH,
      padL,
      plotW,
      zeroY: yRetFor(0),
      series,
      retTicks,
      ddTicks,
      xTicks,
      minTs,
      tsSpan,
    };
  }, [strategies, xMode]);

  if (!chartData) {
    return null;
  }

  function findNearest(
    mapped: Array<{
      x: number;
      yRet: number;
      yDd: number;
      ratio: number;
      returnPct: number;
      drawdownPct: number;
      timestamp: string;
    }>,
    ratio: number
  ) {
    if (mapped.length === 0) return null;
    let best = mapped[0];
    let bestDist = Math.abs(mapped[0].ratio - ratio);
    for (let i = 1; i < mapped.length; i++) {
      const d = Math.abs(mapped[i].ratio - ratio);
      if (d < bestDist) {
        bestDist = d;
        best = mapped[i];
      }
    }
    return best;
  }

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * chartData!.svgW;
    const clamped = Math.max(
      chartData!.padL,
      Math.min(chartData!.padL + chartData!.plotW, relX)
    );
    setHoverRatio((clamped - chartData!.padL) / chartData!.plotW);
  }

  const effectiveRatio = hoverRatio !== null ? hoverRatio : 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          {chartData.series.map((s) => {
            const pt = findNearest(s.mapped, effectiveRatio);
            return (
              <div key={s.id} className="flex items-center gap-2 text-xs">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                <span className="max-w-[160px] truncate font-medium text-slate-200">
                  {s.name}
                </span>
                {pt && (
                  <span
                    className={`font-mono tabular-nums font-semibold ${
                      pt.returnPct >= 0 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {formatPct(pt.returnPct)}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div className="inline-flex rounded-lg border border-slate-800 bg-[#0B0F17] p-0.5">
          <button
            type="button"
            onClick={() => setXMode("date")}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
              xMode === "date"
                ? "bg-slate-800 text-slate-100"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            Calendar Timeline
          </button>
          <button
            type="button"
            onClick={() => setXMode("progress")}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
              xMode === "progress"
                ? "bg-slate-800 text-slate-100"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            Normalized (0–100%)
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800/80 bg-[#0A0E16] p-3">
        <svg
          viewBox={`0 0 ${chartData.svgW} ${chartData.totalH}`}
          className="h-auto w-full select-none touch-none"
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setHoverRatio(null)}
        >
          {/* Return Gridlines */}
          {chartData.retTicks.map((t, i) => (
            <g key={i}>
              <line
                x1={chartData.padL}
                y1={t.y}
                x2={chartData.padL + chartData.plotW}
                y2={t.y}
                stroke="rgba(148, 163, 184, 0.08)"
              />
              <text
                x={chartData.padL - 8}
                y={t.y + 3.5}
                textAnchor="end"
                className="fill-slate-500 font-mono text-[10px]"
              >
                {t.val >= 0 ? "+" : ""}
                {t.val.toFixed(1)}%
              </text>
            </g>
          ))}

          <line
            x1={chartData.padL}
            y1={chartData.zeroY}
            x2={chartData.padL + chartData.plotW}
            y2={chartData.zeroY}
            stroke="rgba(148, 163, 184, 0.3)"
            strokeDasharray="4 4"
          />

          {/* Return Curves */}
          {chartData.series.map((s) => (
            <path
              key={`ret-${s.id}`}
              d={s.retPath}
              fill="none"
              stroke={s.color}
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

          {/* Underwater Drawdown Label */}
          <text
            x={chartData.padL + 4}
            y={chartData.ddTop - 6}
            className="fill-slate-500 font-mono text-[9px] uppercase tracking-wider"
          >
            Comparative Drawdown (%)
          </text>

          {chartData.ddTicks.map((t, i) => (
            <g key={i}>
              <line
                x1={chartData.padL}
                y1={t.y}
                x2={chartData.padL + chartData.plotW}
                y2={t.y}
                stroke="rgba(148, 163, 184, 0.08)"
              />
              <text
                x={chartData.padL - 8}
                y={t.y + 3}
                textAnchor="end"
                className="fill-slate-500 font-mono text-[10px]"
              >
                {t.val.toFixed(1)}%
              </text>
            </g>
          ))}

          {/* Drawdown Curves */}
          {chartData.series.map((s) => (
            <path
              key={`dd-${s.id}`}
              d={s.ddPath}
              fill="none"
              stroke={s.color}
              strokeWidth={1.6}
              strokeOpacity={0.85}
              strokeLinejoin="round"
            />
          ))}

          {/* X Ticks */}
          {chartData.xTicks.map((t, i) => (
            <text
              key={i}
              x={t.x}
              y={chartData.totalH - 6}
              textAnchor="middle"
              className="fill-slate-500 font-mono text-[10px]"
            >
              {t.label}
            </text>
          ))}

          {/* Hover Crosshair */}
          {hoverRatio !== null && (
            <g>
              <line
                x1={chartData.padL + hoverRatio * chartData.plotW}
                y1={10}
                x2={chartData.padL + hoverRatio * chartData.plotW}
                y2={chartData.ddTop + chartData.ddH}
                stroke="rgba(226, 232, 240, 0.3)"
                strokeDasharray="3 3"
              />
              {chartData.series.map((s) => {
                const pt = findNearest(s.mapped, hoverRatio);
                if (!pt) return null;
                return (
                  <g key={`dot-${s.id}`}>
                    <circle
                      cx={pt.x}
                      cy={pt.yRet}
                      r={4}
                      fill={s.color}
                      stroke="#080B10"
                      strokeWidth={1.8}
                    />
                    <circle
                      cx={pt.x}
                      cy={pt.yDd}
                      r={3.2}
                      fill={s.color}
                      stroke="#080B10"
                      strokeWidth={1.5}
                    />
                  </g>
                );
              })}
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}
