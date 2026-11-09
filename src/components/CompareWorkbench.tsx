"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, Check, Crown, GitCompareArrows, Upload } from "lucide-react";
import type { BacktestEquityPointRecord, BacktestRecord } from "@/db/schema";
import {
  CompareOverlayChart,
  STRATEGY_COLORS,
} from "@/components/charts/CompareOverlayChart";
import {
  formatCurrencyExact,
  formatPct,
  formatRatio,
  formatShortDate,
} from "@/lib/formatters";

interface CompareWorkbenchProps {
  allBacktests: BacktestRecord[];
  initialSelectedIds: string[];
  equityByBacktestId: Record<string, BacktestEquityPointRecord[]>;
}

export function CompareWorkbench({
  allBacktests,
  initialSelectedIds,
  equityByBacktestId,
}: CompareWorkbenchProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelectedIds);
  const [pointsMap, setPointsMap] = useState<
    Record<string, BacktestEquityPointRecord[]>
  >(equityByBacktestId);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function toggleStrategy(id: string) {
    if (selectedIds.includes(id)) {
      if (selectedIds.length <= 1) return;
      setSelectedIds((prev) => prev.filter((x) => x !== id));
      return;
    }

    if (selectedIds.length >= 6) return;

    if (!pointsMap[id]) {
      setLoadingId(id);
      try {
        const res = await fetch(`/api/backtests/${id}`);
        if (res.ok) {
          const data = (await res.json()) as {
            equityPoints: BacktestEquityPointRecord[];
          };
          setPointsMap((prev) => ({ ...prev, [id]: data.equityPoints }));
        }
      } finally {
        setLoadingId(null);
      }
    }

    setSelectedIds((prev) => [...prev, id]);
  }

  const selectedStrategies = useMemo(() => {
    const byId = new Map(allBacktests.map((b) => [b.id, b]));
    return selectedIds
      .map((id) => {
        const b = byId.get(id);
        if (!b) return null;
        return {
          backtest: b,
          equityPoints: pointsMap[id] ?? [],
        };
      })
      .filter(
        (
          s
        ): s is {
          backtest: BacktestRecord;
          equityPoints: BacktestEquityPointRecord[];
        } => s !== null
      );
  }, [allBacktests, selectedIds, pointsMap]);

  const metricRows: Array<{
    label: string;
    getValue: (b: BacktestRecord) => number;
    format: (v: number, b: BacktestRecord) => string;
    higherIsBetter: boolean;
  }> = [
    {
      label: "Total Return %",
      getValue: (b) => b.totalReturnPct,
      format: (v) => formatPct(v),
      higherIsBetter: true,
    },
    {
      label: "Net Profit ($)",
      getValue: (b) => b.netProfit,
      format: (v) => formatCurrencyExact(v, true),
      higherIsBetter: true,
    },
    {
      label: "CAGR (Annualized)",
      getValue: (b) => b.cagrPct,
      format: (v) => formatPct(v),
      higherIsBetter: true,
    },
    {
      label: "Sharpe Ratio",
      getValue: (b) => b.sharpeRatio,
      format: (v) => formatRatio(v),
      higherIsBetter: true,
    },
    {
      label: "Sortino Ratio",
      getValue: (b) => b.sortinoRatio,
      format: (v) => formatRatio(v),
      higherIsBetter: true,
    },
    {
      label: "Calmar Ratio",
      getValue: (b) => b.calmarRatio,
      format: (v) => formatRatio(v),
      higherIsBetter: true,
    },
    {
      label: "Max Drawdown %",
      getValue: (b) => b.maxDrawdownPct,
      format: (v) => formatPct(v, false),
      higherIsBetter: true, // e.g. -4% > -15%
    },
    {
      label: "Win Rate %",
      getValue: (b) => b.winRatePct,
      format: (v) => `${v.toFixed(1)}%`,
      higherIsBetter: true,
    },
    {
      label: "Profit Factor",
      getValue: (b) => b.profitFactor,
      format: (v) => formatRatio(v),
      higherIsBetter: true,
    },
    {
      label: "Expectancy ($)",
      getValue: (b) => b.expectancy,
      format: (v) => formatCurrencyExact(v, true),
      higherIsBetter: true,
    },
    {
      label: "Total Trades",
      getValue: (b) => b.totalTrades,
      format: (v) => (v > 0 ? String(v) : "Curve"),
      higherIsBetter: true,
    },
  ];

  if (allBacktests.length === 0) {
    return (
      <div className="mx-auto max-w-[1440px] px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-[#0F141D] px-6 py-16 text-center">
          <GitCompareArrows className="h-10 w-10 text-slate-500" />
          <h1 className="mt-4 text-xl font-semibold text-slate-100">
            No Backtests to Compare Yet
          </h1>
          <p className="mt-1.5 max-w-md text-sm text-slate-400">
            Upload at least two backtest files to overlay their normalized
            equity curves and risk ratios side-by-side.
          </p>
          <Link
            href="/upload"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950"
          >
            <Upload className="h-4 w-4" />
            Upload Backtest
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-200"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Strategy Vault
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">
            Multi-Strategy Alpha Comparison
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Select up to 6 backtests to overlay normalized percentage return
            curves, underwater drawdowns, and risk-adjusted metrics.
          </p>
        </div>
      </div>

      {/* Strategy Selector Pills */}
      <section className="rounded-2xl border border-slate-800/80 bg-[#0F141D] p-4">
        <div className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Select Strategies ({selectedStrategies.length}/6 Active)
        </div>
        <div className="flex flex-wrap gap-2">
          {allBacktests.map((b) => {
            const selIdx = selectedIds.indexOf(b.id);
            const isSelected = selIdx !== -1;
            const color = isSelected
              ? STRATEGY_COLORS[selIdx % STRATEGY_COLORS.length]
              : undefined;
            return (
              <button
                key={b.id}
                type="button"
                disabled={loadingId === b.id}
                onClick={() => toggleStrategy(b.id)}
                className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition ${
                  isSelected
                    ? "border-slate-600 bg-slate-800/90 text-slate-100"
                    : "border-slate-800 bg-[#0A0E16] text-slate-400 hover:border-slate-700 hover:text-slate-200"
                }`}
              >
                <span
                  className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-slate-600"
                  style={
                    isSelected
                      ? { backgroundColor: color, borderColor: color }
                      : undefined
                  }
                >
                  {isSelected && <Check className="h-2.5 w-2.5 text-slate-950" />}
                </span>
                <span>{b.name}</span>
                <span className="font-mono text-[10px] text-slate-500">
                  {b.symbol}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Overlaid Equity + Drawdown Chart */}
      <section className="rounded-2xl border border-slate-800/80 bg-[#0F141D] p-5">
        <CompareOverlayChart strategies={selectedStrategies} />
      </section>

      {/* Side-by-Side Comparison Matrix */}
      <section className="overflow-hidden rounded-2xl border border-slate-800/80 bg-[#0F141D]">
        <div className="border-b border-slate-800 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-100">
            Quantitative Benchmark Matrix
          </h2>
          <p className="text-xs text-slate-500">
            Best performer per metric is highlighted with an emerald crown
            indicator.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-slate-800 bg-[#0A0E16] text-xs">
              <tr>
                <th className="w-48 px-5 py-3.5 font-mono uppercase tracking-wider text-slate-500">
                  Metric
                </th>
                {selectedStrategies.map(({ backtest }, idx) => (
                  <th key={backtest.id} className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{
                          backgroundColor:
                            STRATEGY_COLORS[idx % STRATEGY_COLORS.length],
                        }}
                      />
                      <Link
                        href={`/backtests/${backtest.id}`}
                        className="truncate font-semibold text-slate-100 hover:text-emerald-400"
                      >
                        {backtest.name}
                      </Link>
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] font-normal text-slate-500">
                      {backtest.symbol} · {backtest.timeframe} ·{" "}
                      {formatShortDate(backtest.startDate)}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {metricRows.map((row) => {
                const values = selectedStrategies.map((s) =>
                  row.getValue(s.backtest)
                );
                const bestVal =
                  values.length > 0
                    ? row.higherIsBetter
                      ? Math.max(...values)
                      : Math.min(...values)
                    : null;

                return (
                  <tr
                    key={row.label}
                    className="transition hover:bg-slate-900/40"
                  >
                    <td className="px-5 py-3 text-xs font-medium text-slate-400">
                      {row.label}
                    </td>
                    {selectedStrategies.map(({ backtest }) => {
                      const val = row.getValue(backtest);
                      const isWinner =
                        selectedStrategies.length > 1 &&
                        bestVal !== null &&
                        val === bestVal;

                      return (
                        <td
                          key={backtest.id}
                          className={`px-4 py-3 font-mono text-sm tabular-nums ${
                            isWinner
                              ? "font-bold text-emerald-400"
                              : "text-slate-200"
                          }`}
                        >
                          <div className="inline-flex items-center gap-1.5">
                            <span>{row.format(val, backtest)}</span>
                            {isWinner && (
                              <Crown className="h-3.5 w-3.5 text-amber-400" />
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
