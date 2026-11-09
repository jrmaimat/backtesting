"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Calendar,
  Check,
  Download,
  Edit3,
  GitCompareArrows,
  Pin,
  Plus,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import type {
  BacktestEquityPointRecord,
  BacktestRecord,
  BacktestTradeRecord,
} from "@/db/schema";
import { EquityDrawdownChart } from "@/components/charts/EquityDrawdownChart";
import { MonthlyReturnsHeatmap } from "@/components/charts/MonthlyReturnsHeatmap";
import { PnlDistributionChart } from "@/components/charts/PnlDistributionChart";
import {
  formatCurrency,
  formatCurrencyExact,
  formatDateTime,
  formatDuration,
  formatPct,
  formatPrice,
  formatRatio,
  formatShortDate,
} from "@/lib/formatters";

interface BacktestDetailViewProps {
  initialBacktest: BacktestRecord;
  equityPoints: BacktestEquityPointRecord[];
  trades: BacktestTradeRecord[];
}

type ChartTab = "equity" | "monthly" | "distribution";
type TradeFilter = "ALL" | "WIN" | "LOSS" | "LONG" | "SHORT";

export function BacktestDetailView({
  initialBacktest,
  equityPoints,
  trades,
}: BacktestDetailViewProps) {
  const router = useRouter();
  const [backtest, setBacktest] = useState<BacktestRecord>(initialBacktest);
  const [activeTab, setActiveTab] = useState<ChartTab>("equity");

  // Trade ledger filtering & pagination
  const [tradeFilter, setTradeFilter] = useState<TradeFilter>("ALL");
  const [tradeSearch, setTradeSearch] = useState("");
  const [tradeSort, setTradeSort] = useState<"num_asc" | "pnl_desc" | "pnl_asc">(
    "num_asc"
  );
  const [page, setPage] = useState(1);
  const pageSize = 25;

  // Editable metadata & notes
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(initialBacktest.name);
  const [draftNotes, setDraftNotes] = useState(initialBacktest.notes);
  const [draftTags, setDraftTags] = useState(initialBacktest.tags.join(", "));
  const [draftParams, setDraftParams] = useState<
    Array<{ key: string; value: string }>
  >(
    Object.entries(initialBacktest.parameters ?? {}).map(([key, val]) => ({
      key,
      value: String(val),
    }))
  );
  const [savingMeta, setSavingMeta] = useState(false);
  const [savedIndicator, setSavedIndicator] = useState(false);

  const filteredTrades = useMemo(() => {
    const q = tradeSearch.trim().toLowerCase();
    const list = trades.filter((t) => {
      if (tradeFilter === "WIN" && t.pnl <= 0) return false;
      if (tradeFilter === "LOSS" && t.pnl >= 0) return false;
      if (tradeFilter === "LONG" && t.side !== "LONG") return false;
      if (tradeFilter === "SHORT" && t.side !== "SHORT") return false;
      if (!q) return true;
      return (
        t.symbol.toLowerCase().includes(q) ||
        (t.exitReason ?? "").toLowerCase().includes(q) ||
        String(t.tradeNumber).includes(q)
      );
    });

    return [...list].sort((a, b) => {
      if (tradeSort === "pnl_desc") return b.pnl - a.pnl;
      if (tradeSort === "pnl_asc") return a.pnl - b.pnl;
      return a.tradeNumber - b.tradeNumber;
    });
  }, [trades, tradeFilter, tradeSearch, tradeSort]);

  const totalPages = Math.max(1, Math.ceil(filteredTrades.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleTrades = filteredTrades.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  async function saveMetadata(overridePinned?: boolean) {
    setSavingMeta(true);
    try {
      const parameters: Record<string, string | number> = {};
      for (const p of draftParams) {
        const k = p.key.trim();
        const v = p.value.trim();
        if (!k) continue;
        const n = Number(v);
        parameters[k] = v !== "" && Number.isFinite(n) ? n : v;
      }

      const tags = draftTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const payload = {
        name: draftName.trim() || backtest.name,
        notes: draftNotes,
        tags,
        parameters,
        isPinned:
          overridePinned !== undefined ? overridePinned : backtest.isPinned,
      };

      const res = await fetch(`/api/backtests/${backtest.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = (await res.json()) as { backtest: BacktestRecord };
        setBacktest(data.backtest);
        setEditingName(false);
        setSavedIndicator(true);
        setTimeout(() => setSavedIndicator(false), 2200);
      }
    } finally {
      setSavingMeta(false);
    }
  }

  async function handleDelete() {
    if (
      !window.confirm(
        `Permanently delete "${backtest.name}" and its entire trade history?`
      )
    ) {
      return;
    }
    const res = await fetch(`/api/backtests/${backtest.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      router.push("/");
      router.refresh();
    }
  }

  function exportCsv() {
    const header =
      "trade_number,symbol,side,entry_time,exit_time,entry_price,exit_price,quantity,commission,pnl,pnl_pct,cumulative_equity,drawdown_pct,exit_reason\n";
    const lines = trades.map((t) =>
      [
        t.tradeNumber,
        t.symbol,
        t.side,
        t.entryTime,
        t.exitTime,
        t.entryPrice,
        t.exitPrice,
        t.quantity,
        t.commission,
        t.pnl,
        t.pnlPct,
        t.cumulativeEquity,
        t.drawdownPct,
        t.exitReason ?? "",
      ].join(",")
    );
    const blob = new Blob([header + lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${backtest.symbol}_${backtest.timeframe}_trades.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportJson() {
    const blob = new Blob(
      [JSON.stringify({ backtest, equityPoints, trades }, null, 2)],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${backtest.name.toLowerCase().replace(/\s+/g, "_")}_tearsheet.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const isPositive = backtest.netProfit >= 0;

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {/* Header & Controls */}
      <section className="rounded-2xl border border-slate-800/80 bg-[#0F141D] p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-200"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Strategy Vault
          </Link>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => saveMetadata(!backtest.isPinned)}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition ${
                backtest.isPinned
                  ? "border-amber-500/40 bg-amber-500/15 text-amber-300"
                  : "border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700"
              }`}
            >
              <Pin className="h-3.5 w-3.5" />
              {backtest.isPinned ? "Pinned" : "Pin"}
            </button>

            <Link
              href={`/compare?ids=${backtest.id}`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-indigo-500/40 hover:text-indigo-300"
            >
              <GitCompareArrows className="h-3.5 w-3.5" />
              Compare
            </Link>

            {trades.length > 0 && (
              <button
                type="button"
                onClick={exportCsv}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-slate-700 hover:text-slate-100"
              >
                <Download className="h-3.5 w-3.5" />
                Trades CSV
              </button>
            )}

            <button
              type="button"
              onClick={exportJson}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-slate-700 hover:text-slate-100"
            >
              <Download className="h-3.5 w-3.5" />
              JSON Tear Sheet
            </button>

            <button
              type="button"
              onClick={handleDelete}
              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 transition hover:bg-rose-500/20"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md border border-slate-700 bg-slate-900 px-2.5 py-0.5 font-mono text-xs font-semibold text-slate-100">
                {backtest.symbol}
              </span>
              <span className="rounded-md bg-slate-800 px-2 py-0.5 font-mono text-xs text-slate-300">
                {backtest.timeframe}
              </span>
              <span className="rounded-md border border-cyan-500/25 bg-cyan-500/10 px-2 py-0.5 text-xs font-medium text-cyan-300">
                {backtest.engine}
              </span>
              <span className="rounded-md bg-slate-900 px-2 py-0.5 text-xs text-slate-400">
                {backtest.assetClass}
              </span>
              {backtest.fileName && (
                <span className="font-mono text-xs text-slate-500">
                  Source: {backtest.fileName}
                </span>
              )}
            </div>

            {editingName ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  className="rounded-xl border border-emerald-500/50 bg-[#080B10] px-3 py-1.5 text-xl font-semibold text-slate-50 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => saveMetadata()}
                  className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950"
                >
                  Save
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">
                  {backtest.name}
                </h1>
                <button
                  type="button"
                  onClick={() => setEditingName(true)}
                  title="Rename strategy"
                  className="rounded-lg p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
                >
                  <Edit3 className="h-4 w-4" />
                </button>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 font-mono text-xs text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-slate-500" />
                {formatShortDate(backtest.startDate)} →{" "}
                {formatShortDate(backtest.endDate)}
              </span>
              <span>·</span>
              <span>
                Capital: {formatCurrency(backtest.initialCapital)} →{" "}
                <strong className="text-slate-200">
                  {formatCurrencyExact(backtest.finalCapital)}
                </strong>
              </span>
            </div>
          </div>

          <div className="flex items-baseline gap-4 rounded-xl border border-slate-800 bg-[#0A0E16] px-5 py-3">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-500">
                Total Return
              </div>
              <div
                className={`font-mono text-3xl font-bold tabular-nums ${
                  isPositive ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {formatPct(backtest.totalReturnPct)}
              </div>
            </div>
            <div className="h-9 w-px bg-slate-800" />
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-500">
                Net PnL
              </div>
              <div
                className={`font-mono text-xl font-semibold tabular-nums ${
                  isPositive ? "text-emerald-300" : "text-rose-300"
                }`}
              >
                {formatCurrencyExact(backtest.netProfit, true)}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Institutional Quantitative KPI Strip */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-2xl border border-slate-800/80 bg-[#0F141D] p-4">
          <div className="text-xs text-slate-400">CAGR (Annualized)</div>
          <div
            className={`mt-1.5 font-mono text-xl font-bold tabular-nums ${
              backtest.cagrPct >= 0 ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            {formatPct(backtest.cagrPct)}
          </div>
          <div className="mt-1 font-mono text-[11px] text-slate-500">
            Calmar: {formatRatio(backtest.calmarRatio)}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800/80 bg-[#0F141D] p-4">
          <div className="text-xs text-slate-400">Sharpe / Sortino</div>
          <div className="mt-1.5 font-mono text-xl font-bold tabular-nums text-slate-100">
            {formatRatio(backtest.sharpeRatio)}
            <span className="text-slate-600"> / </span>
            <span className="text-cyan-400">
              {formatRatio(backtest.sortinoRatio)}
            </span>
          </div>
          <div className="mt-1 font-mono text-[11px] text-slate-500">
            Risk-adjusted alpha
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800/80 bg-[#0F141D] p-4">
          <div className="text-xs text-slate-400">Max Drawdown</div>
          <div className="mt-1.5 font-mono text-xl font-bold tabular-nums text-rose-400">
            {formatPct(backtest.maxDrawdownPct, false)}
          </div>
          <div className="mt-1 font-mono text-[11px] text-slate-500">
            {formatCurrencyExact(backtest.maxDrawdownAmount)} ·{" "}
            {backtest.maxDrawdownDurationDays}d
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800/80 bg-[#0F141D] p-4">
          <div className="text-xs text-slate-400">
            {backtest.totalTrades > 0 ? "Win Rate / PF" : "Period Win / PF"}
          </div>
          <div className="mt-1.5 font-mono text-xl font-bold tabular-nums text-slate-100">
            {backtest.winRatePct.toFixed(1)}%
            <span className="text-slate-600"> · </span>
            <span className="text-emerald-400">
              {formatRatio(backtest.profitFactor)}
            </span>
          </div>
          <div className="mt-1 font-mono text-[11px] text-slate-500">
            {backtest.winningTrades}W / {backtest.losingTrades}L
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800/80 bg-[#0F141D] p-4">
          <div className="text-xs text-slate-400">Expectancy & Payoff</div>
          <div className="mt-1.5 font-mono text-xl font-bold tabular-nums text-slate-100">
            {formatCurrencyExact(backtest.expectancy, true)}
          </div>
          <div className="mt-1 font-mono text-[11px] text-slate-500">
            Payoff {formatRatio(backtest.payoffRatio)}x · Streak{" "}
            {backtest.maxConsecutiveWins}W/{backtest.maxConsecutiveLosses}L
          </div>
        </div>
      </section>

      {/* Interactive Analytics Tabs */}
      <section className="rounded-2xl border border-slate-800/80 bg-[#0F141D] p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
          <div className="flex items-center gap-1.5">
            {[
              { id: "equity", label: "Equity & Drawdown" },
              { id: "monthly", label: "Monthly Returns Heatmap" },
              { id: "distribution", label: "Distribution & Long/Short" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as ChartTab)}
                className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition sm:text-sm ${
                  activeTab === tab.id
                    ? "bg-slate-800 text-emerald-400"
                    : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="font-mono text-xs text-slate-500">
            Avg Win:{" "}
            <span className="text-emerald-400">
              {formatCurrencyExact(backtest.avgWin, true)}
            </span>{" "}
            · Avg Loss:{" "}
            <span className="text-rose-400">
              {formatCurrencyExact(backtest.avgLoss)}
            </span>
          </div>
        </div>

        {activeTab === "equity" && (
          <EquityDrawdownChart
            points={equityPoints}
            initialCapital={backtest.initialCapital}
            height={420}
          />
        )}

        {activeTab === "monthly" && (
          <MonthlyReturnsHeatmap monthlyReturns={backtest.monthlyReturns} />
        )}

        {activeTab === "distribution" && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <PnlDistributionChart
                trades={trades}
                expectancy={backtest.expectancy}
              />
            </div>

            <div className="space-y-4 lg:col-span-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-emerald-500/20 bg-[#0A0E16] p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                    Long Positions
                  </div>
                  <div className="mt-2 font-mono text-xl font-bold text-slate-100">
                    {backtest.longTradesCount}
                  </div>
                  <div className="mt-1 font-mono text-xs text-slate-400">
                    Win Rate: {backtest.longWinRatePct.toFixed(1)}%
                  </div>
                  <div
                    className={`mt-1 font-mono text-xs font-semibold ${
                      backtest.longNetProfit >= 0
                        ? "text-emerald-400"
                        : "text-rose-400"
                    }`}
                  >
                    {formatCurrencyExact(backtest.longNetProfit, true)}
                  </div>
                </div>

                <div className="rounded-xl border border-cyan-500/20 bg-[#0A0E16] p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
                    Short Positions
                  </div>
                  <div className="mt-2 font-mono text-xl font-bold text-slate-100">
                    {backtest.shortTradesCount}
                  </div>
                  <div className="mt-1 font-mono text-xs text-slate-400">
                    Win Rate: {backtest.shortWinRatePct.toFixed(1)}%
                  </div>
                  <div
                    className={`mt-1 font-mono text-xs font-semibold ${
                      backtest.shortNetProfit >= 0
                        ? "text-emerald-400"
                        : "text-rose-400"
                    }`}
                  >
                    {formatCurrencyExact(backtest.shortNetProfit, true)}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-[#0A0E16] p-4 space-y-2.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Best Trade</span>
                  <span className="font-mono font-semibold text-emerald-400">
                    {formatCurrencyExact(backtest.bestTrade, true)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Worst Trade</span>
                  <span className="font-mono font-semibold text-rose-400">
                    {formatCurrencyExact(backtest.worstTrade)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Max Consecutive Wins</span>
                  <span className="font-mono text-slate-200">
                    {backtest.maxConsecutiveWins}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Max Consecutive Losses</span>
                  <span className="font-mono text-slate-200">
                    {backtest.maxConsecutiveLosses}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Bottom Split: Trades Ledger + Parameters & Notes */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Trades Ledger */}
        <section className="rounded-2xl border border-slate-800/80 bg-[#0F141D] p-5 lg:col-span-8">
          <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-base font-semibold text-slate-100">
                Executed Trades Ledger
              </h2>
              <p className="text-xs text-slate-500">
                {filteredTrades.length} matching trades out of {trades.length}{" "}
                recorded
              </p>
            </div>

            {trades.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    value={tradeSearch}
                    onChange={(e) => {
                      setTradeSearch(e.target.value);
                      setPage(1);
                    }}
                    placeholder="Filter # or reason..."
                    className="w-40 rounded-lg border border-slate-800 bg-[#080B10] py-1.5 pl-8 pr-2.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none"
                  />
                </div>

                <div className="inline-flex rounded-lg border border-slate-800 bg-[#080B10] p-0.5 text-[11px]">
                  {(["ALL", "WIN", "LOSS", "LONG", "SHORT"] as TradeFilter[]).map(
                    (f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => {
                          setTradeFilter(f);
                          setPage(1);
                        }}
                        className={`rounded-md px-2 py-1 font-medium transition ${
                          tradeFilter === f
                            ? "bg-slate-800 text-slate-100"
                            : "text-slate-500 hover:text-slate-300"
                        }`}
                      >
                        {f}
                      </button>
                    )
                  )}
                </div>

                <select
                  value={tradeSort}
                  onChange={(e) =>
                    setTradeSort(
                      e.target.value as "num_asc" | "pnl_desc" | "pnl_asc"
                    )
                  }
                  className="rounded-lg border border-slate-800 bg-[#080B10] px-2.5 py-1.5 text-xs text-slate-300"
                >
                  <option value="num_asc">Chronological</option>
                  <option value="pnl_desc">Best Trades First</option>
                  <option value="pnl_asc">Worst Trades First</option>
                </select>
              </div>
            )}
          </div>

          {trades.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-800 bg-[#0A0E16] px-6 py-12 text-center text-sm text-slate-500">
              This backtest was imported as an equity curve series without
              individual trade records.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border border-slate-800/80 bg-[#0A0E16]">
                <table className="w-full min-w-[780px] text-left font-mono text-xs">
                  <thead className="border-b border-slate-800 bg-slate-900/70 text-[11px] uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-3 py-2.5">#</th>
                      <th className="px-3 py-2.5">Side</th>
                      <th className="px-3 py-2.5">Entry → Exit</th>
                      <th className="px-3 py-2.5 text-right">Entry Px</th>
                      <th className="px-3 py-2.5 text-right">Exit Px</th>
                      <th className="px-3 py-2.5 text-right">Qty</th>
                      <th className="px-3 py-2.5 text-right">PnL ($)</th>
                      <th className="px-3 py-2.5 text-right">Equity</th>
                      <th className="px-3 py-2.5 text-right">Dur</th>
                      <th className="px-3 py-2.5">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {visibleTrades.map((t) => {
                      const win = t.pnl >= 0;
                      return (
                        <tr
                          key={t.id}
                          className="transition hover:bg-slate-900/50"
                        >
                          <td className="px-3 py-2 text-slate-500">
                            {t.tradeNumber}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                t.side === "LONG"
                                  ? "bg-emerald-500/15 text-emerald-400"
                                  : "bg-cyan-500/15 text-cyan-300"
                              }`}
                            >
                              {t.side}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-[11px] text-slate-400">
                            <div>{formatDateTime(t.entryTime)}</div>
                            <div className="text-slate-500">
                              → {formatDateTime(t.exitTime)}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-300">
                            {formatPrice(t.entryPrice)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-300">
                            {formatPrice(t.exitPrice)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-400">
                            {t.quantity}
                          </td>
                          <td
                            className={`px-3 py-2 text-right tabular-nums font-semibold ${
                              win ? "text-emerald-400" : "text-rose-400"
                            }`}
                          >
                            {formatCurrencyExact(t.pnl, true)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-200">
                            {formatCurrencyExact(t.cumulativeEquity)}
                          </td>
                          <td className="px-3 py-2 text-right text-slate-500">
                            {formatDuration(t.durationMinutes)}
                          </td>
                          <td className="px-3 py-2 text-[11px] text-slate-400">
                            {t.exitReason ?? "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                  <span>
                    Page {currentPage} of {totalPages}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={currentPage <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-1 disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      disabled={currentPage >= totalPages}
                      onClick={() =>
                        setPage((p) => Math.min(totalPages, p + 1))
                      }
                      className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-1 disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        {/* Parameters, Tags & Persistent Notes */}
        <aside className="space-y-4 rounded-2xl border border-slate-800/80 bg-[#0F141D] p-5 lg:col-span-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-100">
              Parameters & Research Notes
            </h2>
            {savedIndicator && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400">
                <Check className="h-3.5 w-3.5" />
                Saved
              </span>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">
                Hyperparameters
              </span>
              <button
                type="button"
                onClick={() =>
                  setDraftParams((p) => [...p, { key: "", value: "" }])
                }
                className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300"
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </button>
            </div>
            {draftParams.length === 0 ? (
              <p className="rounded-xl border border-slate-800/70 bg-[#0A0E16] px-3 py-2 text-xs text-slate-500">
                No hyperparameters attached. Click Add to record config values.
              </p>
            ) : (
              <div className="space-y-2">
                {draftParams.map((pair, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={pair.key}
                      placeholder="key"
                      onChange={(e) =>
                        setDraftParams((prev) =>
                          prev.map((x, i) =>
                            i === idx ? { ...x, key: e.target.value } : x
                          )
                        )
                      }
                      className="w-1/2 rounded-lg border border-slate-800 bg-[#080B10] px-2.5 py-1.5 font-mono text-xs text-slate-300"
                    />
                    <input
                      type="text"
                      value={pair.value}
                      placeholder="value"
                      onChange={(e) =>
                        setDraftParams((prev) =>
                          prev.map((x, i) =>
                            i === idx ? { ...x, value: e.target.value } : x
                          )
                        )
                      }
                      className="w-1/2 rounded-lg border border-slate-800 bg-[#080B10] px-2.5 py-1.5 font-mono text-xs text-emerald-300"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setDraftParams((prev) =>
                          prev.filter((_, i) => i !== idx)
                        )
                      }
                      className="text-slate-500 hover:text-rose-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-400">
              Tags (comma-separated)
            </span>
            <input
              type="text"
              value={draftTags}
              onChange={(e) => setDraftTags(e.target.value)}
              className="w-full rounded-xl border border-slate-800 bg-[#080B10] px-3 py-2 font-mono text-xs text-slate-200 focus:border-emerald-500/60 focus:outline-none"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-400">
              Research Notes & Hypothesis
            </span>
            <textarea
              rows={7}
              value={draftNotes}
              onChange={(e) => setDraftNotes(e.target.value)}
              placeholder="Write strategy observations, slippage assumptions, out-of-sample notes..."
              className="w-full rounded-xl border border-slate-800 bg-[#080B10] p-3 text-sm leading-relaxed text-slate-200 placeholder-slate-600 focus:border-emerald-500/60 focus:outline-none"
            />
          </label>

          <button
            type="button"
            disabled={savingMeta}
            onClick={() => saveMetadata()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-100 transition hover:bg-slate-700 disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5 text-emerald-400" />
            {savingMeta ? "Saving Changes..." : "Save Notes & Parameters"}
          </button>
        </aside>
      </div>
    </div>
  );
}
