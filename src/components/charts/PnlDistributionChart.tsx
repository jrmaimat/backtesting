"use client";

import { useMemo, useState } from "react";
import { formatCurrencyExact } from "@/lib/formatters";

interface TradeOutcome {
  pnl: number;
  pnlPct: number;
}

interface PnlDistributionChartProps {
  trades: TradeOutcome[];
  expectancy: number;
}

export function PnlDistributionChart({
  trades,
  expectancy,
}: PnlDistributionChartProps) {
  const [hoverBin, setHoverBin] = useState<number | null>(null);

  const histogram = useMemo(() => {
    if (!trades || trades.length === 0) return null;
    const values = trades.map((t) => t.pnl);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);

    const spread = maxVal - minVal || 100;
    const binCount = Math.min(18, Math.max(8, Math.round(Math.sqrt(trades.length))));
    const binWidth = spread / binCount;

    const bins = Array.from({ length: binCount }, (_, i) => {
      const start = minVal + i * binWidth;
      const end = start + binWidth;
      return {
        index: i,
        start,
        end,
        mid: (start + end) / 2,
        count: 0,
      };
    });

    for (const v of values) {
      let idx = Math.floor((v - minVal) / binWidth);
      if (idx >= binCount) idx = binCount - 1;
      if (idx < 0) idx = 0;
      bins[idx].count++;
    }

    const maxCount = Math.max(...bins.map((b) => b.count), 1);

    return { bins, maxCount, minVal, maxVal };
  }, [trades]);

  if (!histogram) {
    return (
      <div className="flex h-52 items-center justify-center rounded-xl border border-slate-800 bg-[#0A0E16] text-sm text-slate-500">
        Trade-level PnL distribution is available when individual trades are uploaded.
      </div>
    );
  }

  const svgW = 540;
  const svgH = 220;
  const padL = 36;
  const padR = 14;
  const padT = 18;
  const padB = 28;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;
  const barGap = 4;
  const barW = Math.max(6, plotW / histogram.bins.length - barGap);

  const zeroRatio =
    histogram.maxVal > histogram.minVal
      ? (0 - histogram.minVal) / (histogram.maxVal - histogram.minVal)
      : 0.5;
  const zeroX =
    zeroRatio >= 0 && zeroRatio <= 1 ? padL + zeroRatio * plotW : null;

  const expRatio =
    histogram.maxVal > histogram.minVal
      ? (expectancy - histogram.minVal) / (histogram.maxVal - histogram.minVal)
      : 0.5;
  const expX =
    expRatio >= 0 && expRatio <= 1 ? padL + expRatio * plotW : null;

  const active = hoverBin !== null ? histogram.bins[hoverBin] : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-slate-400">
            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500/80" />
            Winning Bins
          </span>
          <span className="flex items-center gap-1.5 text-slate-400">
            <span className="h-2.5 w-2.5 rounded-sm bg-rose-500/80" />
            Losing Bins
          </span>
          <span className="flex items-center gap-1.5 text-amber-300">
            <span className="h-3 w-0.5 bg-amber-400" />
            Expectancy: {formatCurrencyExact(expectancy, true)}
          </span>
        </div>

        <div className="font-mono text-[11px] text-slate-400">
          {active
            ? `${formatCurrencyExact(active.start, true)} to ${formatCurrencyExact(
                active.end,
                true
              )} · ${active.count} trades`
            : `${trades.length} total trades`}
        </div>
      </div>

      <div className="rounded-xl border border-slate-800/80 bg-[#0A0E16] p-3">
        <svg viewBox={`0 0 ${svgW} ${svgH}`} className="h-auto w-full select-none">
          {[0, 0.5, 1].map((r, i) => {
            const y = padT + (1 - r) * plotH;
            const countLabel = Math.round(r * histogram.maxCount);
            return (
              <g key={i}>
                <line
                  x1={padL}
                  y1={y}
                  x2={padL + plotW}
                  y2={y}
                  stroke="rgba(148, 163, 184, 0.09)"
                />
                <text
                  x={padL - 6}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-slate-500 font-mono text-[10px]"
                >
                  {countLabel}
                </text>
              </g>
            );
          })}

          {histogram.bins.map((b, i) => {
            const x = padL + i * (plotW / histogram.bins.length) + barGap / 2;
            const barH = (b.count / histogram.maxCount) * plotH;
            const y = padT + plotH - barH;
            const isWin = b.mid >= 0;
            const isHovered = hoverBin === i;
            return (
              <rect
                key={b.index}
                x={x}
                y={y}
                width={barW}
                height={Math.max(2, barH)}
                rx={2.5}
                fill={
                  isWin
                    ? isHovered
                      ? "#34D399"
                      : "rgba(16, 185, 129, 0.72)"
                    : isHovered
                      ? "#FB7185"
                      : "rgba(244, 63, 94, 0.72)"
                }
                onMouseEnter={() => setHoverBin(i)}
                onMouseLeave={() => setHoverBin(null)}
                className="cursor-pointer transition-colors"
              />
            );
          })}

          {zeroX !== null && (
            <line
              x1={zeroX}
              y1={padT}
              x2={zeroX}
              y2={padT + plotH}
              stroke="rgba(226, 232, 240, 0.35)"
              strokeDasharray="3 3"
            />
          )}

          {expX !== null && (
            <line
              x1={expX}
              y1={padT}
              x2={expX}
              y2={padT + plotH}
              stroke="#F59E0B"
              strokeWidth={1.5}
              strokeDasharray="4 2"
            />
          )}

          <text
            x={padL}
            y={svgH - 8}
            textAnchor="start"
            className="fill-slate-500 font-mono text-[10px]"
          >
            {formatCurrencyExact(histogram.minVal, true)}
          </text>
          <text
            x={padL + plotW}
            y={svgH - 8}
            textAnchor="end"
            className="fill-slate-500 font-mono text-[10px]"
          >
            {formatCurrencyExact(histogram.maxVal, true)}
          </text>
        </svg>
      </div>
    </div>
  );
}
