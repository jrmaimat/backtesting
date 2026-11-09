"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardPaste,
  Download,
  FileCode2,
  FileSpreadsheet,
  Play,
  Plus,
  SlidersHorizontal,
  Trash2,
  UploadCloud,
} from "lucide-react";
import {
  parseBacktestFile,
  type ColumnMapping,
  type ParsedBacktestFileResult,
} from "@/lib/backtest-parser";
import {
  computeAnalyticsFromEquityCurve,
  computeAnalyticsFromTrades,
} from "@/lib/quant-metrics";
import { SAMPLE_TEMPLATES, type SampleTemplate } from "@/lib/sample-templates";
import {
  formatCurrencyExact,
  formatPct,
  formatRatio,
} from "@/lib/formatters";
import { EquityDrawdownChart } from "@/components/charts/EquityDrawdownChart";

interface ParamPair {
  key: string;
  value: string;
}

export function UploadStudio() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [inputMode, setInputMode] = useState<"file" | "paste">("file");
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string>("");
  const [rawText, setRawText] = useState<string>("");
  const [customMapping, setCustomMapping] = useState<ColumnMapping | undefined>(
    undefined
  );

  // Strategy Metadata
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("BTC-USDT");
  const [timeframe, setTimeframe] = useState("1h");
  const [assetClass, setAssetClass] = useState("Crypto");
  const [engine, setEngine] = useState("TradingView");
  const [initialCapital, setInitialCapital] = useState("100000");
  const [tagsInput, setTagsInput] = useState("momentum, systematic");
  const [notes, setNotes] = useState("");
  const [paramPairs, setParamPairs] = useState<ParamPair[]>([]);
  const [showMapper, setShowMapper] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const parsed: ParsedBacktestFileResult | null = useMemo(() => {
    if (!rawText.trim()) return null;
    return parseBacktestFile(rawText, fileName || undefined, customMapping);
  }, [rawText, fileName, customMapping]);

  const numericCapital = useMemo(() => {
    const n = Number(initialCapital);
    return Number.isFinite(n) && n > 0 ? n : 10000;
  }, [initialCapital]);

  const liveAnalytics = useMemo(() => {
    if (!parsed) return null;
    if (parsed.trades.length > 0) {
      return computeAnalyticsFromTrades(
        parsed.trades,
        numericCapital,
        symbol || "ASSET"
      );
    }
    if (parsed.equityPoints.length > 0) {
      return computeAnalyticsFromEquityCurve(
        parsed.equityPoints,
        numericCapital
      );
    }
    return null;
  }, [parsed, numericCapital, symbol]);

  function applySuggestedMeta(result: ParsedBacktestFileResult, fName: string) {
    if (result.suggestedMeta.name) {
      setName(result.suggestedMeta.name);
    } else if (fName) {
      setName(fName.replace(/\.(csv|tsv|txt|json)$/i, ""));
    }
    if (result.suggestedMeta.symbol) setSymbol(result.suggestedMeta.symbol);
    if (result.suggestedMeta.timeframe)
      setTimeframe(result.suggestedMeta.timeframe);
    if (result.suggestedMeta.engine) setEngine(result.suggestedMeta.engine);
    if (result.suggestedMeta.assetClass)
      setAssetClass(result.suggestedMeta.assetClass);
    if (
      result.suggestedMeta.initialCapital &&
      result.suggestedMeta.initialCapital > 0
    ) {
      setInitialCapital(String(result.suggestedMeta.initialCapital));
    }
    if (result.suggestedMeta.tags && result.suggestedMeta.tags.length > 0) {
      setTagsInput(result.suggestedMeta.tags.join(", "));
    }
    if (result.suggestedMeta.parameters) {
      const entries = Object.entries(result.suggestedMeta.parameters).map(
        ([k, v]) => ({ key: k, value: String(v) })
      );
      setParamPairs(entries);
    }
  }

  function ingestText(text: string, fName: string) {
    setSubmitError(null);
    setCustomMapping(undefined);
    setFileName(fName);
    setRawText(text);
    const preview = parseBacktestFile(text, fName);
    applySuggestedMeta(preview, fName);
    if (preview.warnings.length > 0 && preview.headers.length > 0) {
      setShowMapper(true);
    }
  }

  async function handleFileSelected(file: File) {
    const text = await file.text();
    ingestText(text, file.name);
  }

  function handleLoadSample(tpl: SampleTemplate) {
    ingestText(tpl.content, tpl.fileName);
    setInputMode("file");
  }

  function handleDownloadSample(tpl: SampleTemplate) {
    const blob = new Blob([tpl.content], { type: tpl.mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = tpl.fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  function updateMappingField(field: keyof ColumnMapping, val: string) {
    if (!parsed) return;
    const base = customMapping ?? parsed.mapping;
    setCustomMapping({
      ...base,
      [field]: val || undefined,
    });
  }

  async function handleSave() {
    if (!parsed || !liveAnalytics) return;
    if (!name.trim()) {
      setSubmitError("Please enter a Strategy Name before saving.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const parameters: Record<string, string | number> = {};
      for (const pair of paramPairs) {
        const k = pair.key.trim();
        const v = pair.value.trim();
        if (!k) continue;
        const asNum = Number(v);
        parameters[k] = v !== "" && Number.isFinite(asNum) ? asNum : v;
      }

      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const res = await fetch("/api/backtests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          symbol: symbol.trim() || "ASSET",
          timeframe: timeframe.trim() || "1D",
          assetClass,
          engine,
          sourceType: parsed.detectedFormat,
          fileName: fileName || null,
          initialCapital: numericCapital,
          tags,
          parameters,
          notes,
          trades: parsed.trades,
          equityPoints: parsed.equityPoints,
        }),
      });

      const data = (await res.json()) as {
        backtest?: { id: string };
        error?: string;
      };

      if (!res.ok || !data.backtest) {
        setSubmitError(data.error ?? "Failed to save backtest result.");
        return;
      }

      router.push(`/backtests/${data.backtest.id}`);
      router.refresh();
    } catch {
      setSubmitError("Network error while saving backtest.");
    } finally {
      setSubmitting(false);
    }
  }

  const effectiveMapping = customMapping ?? parsed?.mapping;

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
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
            Upload Backtested Results
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Import trade lists or equity curves from TradingView, Backtrader,
            QuantConnect, VectorBT, MetaTrader, or custom CSV/JSON scripts.
          </p>
        </div>
      </div>

      {/* Quick Sample Files Strip */}
      <section className="rounded-2xl border border-slate-800/80 bg-[#0F141D] p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Sample Format Templates & Instant Test Payloads
            </h2>
            <p className="text-xs text-slate-500">
              Download a template for your backtesting script or click{" "}
              <span className="text-emerald-400">Test in Uploader</span> to see
              live parsing immediately.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {SAMPLE_TEMPLATES.map((tpl) => (
            <div
              key={tpl.id}
              className="flex flex-col justify-between rounded-xl border border-slate-800 bg-[#0A0E16] p-3.5"
            >
              <div>
                <div className="flex items-center gap-2">
                  {tpl.id === "json_report" ? (
                    <FileCode2 className="h-4 w-4 text-indigo-400" />
                  ) : (
                    <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
                  )}
                  <span className="text-xs font-semibold text-slate-200">
                    {tpl.label}
                  </span>
                </div>
                <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                  {tpl.description}
                </p>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleLoadSample(tpl)}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-500/15 px-2.5 py-1.5 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/25"
                >
                  <Play className="h-3 w-3" />
                  Test in Uploader
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadSample(tpl)}
                  title={`Download ${tpl.fileName}`}
                  className="inline-flex items-center justify-center rounded-lg border border-slate-800 bg-slate-900 p-1.5 text-slate-400 transition hover:text-slate-200"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Main Two-Column Studio */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: File Dropzone + Column Mapper + Metadata Form */}
        <div className="space-y-6 lg:col-span-5">
          {/* Input Card */}
          <div className="rounded-2xl border border-slate-800/80 bg-[#0F141D] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-100">
                1. Source Data File
              </h2>
              <div className="inline-flex rounded-lg border border-slate-800 bg-[#080B10] p-0.5">
                <button
                  type="button"
                  onClick={() => setInputMode("file")}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    inputMode === "file"
                      ? "bg-slate-800 text-slate-100"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  File Upload
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode("paste")}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    inputMode === "paste"
                      ? "bg-slate-800 text-slate-100"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  <ClipboardPaste className="h-3 w-3" />
                  Paste Text
                </button>
              </div>
            </div>

            {inputMode === "file" ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleFileSelected(f);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`cursor-pointer rounded-xl border-2 border-dashed px-6 py-8 text-center transition ${
                  isDragging
                    ? "border-emerald-400 bg-emerald-500/10"
                    : "border-slate-700/80 bg-[#0A0E16] hover:border-slate-600"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.tsv,.txt,.json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileSelected(f);
                  }}
                />
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10">
                  <UploadCloud className="h-6 w-6 text-emerald-400" />
                </div>
                <p className="mt-3 text-sm font-medium text-slate-200">
                  {fileName ? (
                    <span className="font-mono text-emerald-400">
                      {fileName}
                    </span>
                  ) : (
                    "Drag & drop backtest CSV or JSON here"
                  )}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Supports TradingView paired trade lists, generic CSV trade
                  logs, equity curve CSVs, and JSON reports
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <textarea
                  rows={7}
                  value={rawText}
                  onChange={(e) => {
                    setRawText(e.target.value);
                    if (!fileName) setFileName("pasted_backtest.csv");
                  }}
                  placeholder={
                    "Paste CSV rows or JSON report here...\nExample:\ndate,side,entry_price,exit_price,quantity,pnl\n2025-01-04,LONG,42100,43500,0.5,700"
                  }
                  className="w-full rounded-xl border border-slate-800 bg-[#0A0E16] p-3 font-mono text-xs text-slate-200 placeholder-slate-600 focus:border-emerald-500/60 focus:outline-none"
                />
              </div>
            )}

            {/* Parser Status & Column Mapper Toggle */}
            {parsed && (
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-[#0A0E16] px-3.5 py-2.5 text-xs">
                  <div className="flex items-center gap-2">
                    {parsed.warnings.length === 0 ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-amber-400" />
                    )}
                    <span className="font-medium text-slate-200">
                      Format:{" "}
                      <span className="font-mono text-emerald-400">
                        {parsed.detectedFormat}
                      </span>
                    </span>
                    <span className="text-slate-500">
                      ·{" "}
                      {parsed.trades.length > 0
                        ? `${parsed.trades.length} trades parsed`
                        : `${parsed.equityPoints.length} equity points parsed`}
                    </span>
                  </div>

                  {parsed.headers.length > 0 &&
                    parsed.detectedFormat !== "json_report" && (
                      <button
                        type="button"
                        onClick={() => setShowMapper((v) => !v)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-indigo-400 hover:text-indigo-300"
                      >
                        <SlidersHorizontal className="h-3.5 w-3.5" />
                        {showMapper ? "Hide Column Map" : "Map Columns"}
                      </button>
                    )}
                </div>

                {parsed.warnings.map((w, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300"
                  >
                    {w}
                  </div>
                ))}

                {/* Interactive Column Mapper */}
                {showMapper &&
                  parsed.headers.length > 0 &&
                  effectiveMapping && (
                    <div className="space-y-3 rounded-xl border border-slate-800 bg-[#0A0E16] p-3.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-300">
                          Column Mapping Overrides
                        </span>
                        <div className="inline-flex rounded-lg border border-slate-800 bg-[#080B10] p-0.5 text-[11px]">
                          <button
                            type="button"
                            onClick={() => updateMappingField("mode", "trades")}
                            className={`rounded px-2 py-0.5 ${
                              effectiveMapping.mode === "trades"
                                ? "bg-slate-800 text-slate-100"
                                : "text-slate-500"
                            }`}
                          >
                            Trade Log
                          </button>
                          <button
                            type="button"
                            onClick={() => updateMappingField("mode", "equity")}
                            className={`rounded px-2 py-0.5 ${
                              effectiveMapping.mode === "equity"
                                ? "bg-slate-800 text-slate-100"
                                : "text-slate-500"
                            }`}
                          >
                            Equity Curve
                          </button>
                        </div>
                      </div>

                      {effectiveMapping.mode === "trades" ? (
                        <div className="grid grid-cols-2 gap-2.5 text-xs">
                          {(
                            [
                              ["pnl", "Net PnL ($) *"],
                              ["side", "Side / Type"],
                              ["entryTime", "Entry Date/Time"],
                              ["exitTime", "Exit Date/Time"],
                              ["entryPrice", "Entry Price"],
                              ["exitPrice", "Exit Price"],
                              ["quantity", "Quantity / Size"],
                              ["commission", "Commission"],
                            ] as Array<[keyof ColumnMapping, string]>
                          ).map(([key, label]) => (
                            <label key={key} className="space-y-1">
                              <span className="block text-[11px] text-slate-400">
                                {label}
                              </span>
                              <select
                                value={(effectiveMapping[key] as string) ?? ""}
                                onChange={(e) =>
                                  updateMappingField(key, e.target.value)
                                }
                                className="w-full rounded-lg border border-slate-800 bg-[#080B10] px-2 py-1.5 text-xs text-slate-200"
                              >
                                <option value="">— Auto / None —</option>
                                {parsed.headers.map((h) => (
                                  <option key={h} value={h}>
                                    {h}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ))}
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2.5 text-xs">
                          {(
                            [
                              ["timestamp", "Timestamp / Date *"],
                              ["equity", "Portfolio Equity *"],
                              ["benchmark", "Benchmark (Optional)"],
                            ] as Array<[keyof ColumnMapping, string]>
                          ).map(([key, label]) => (
                            <label key={key} className="space-y-1">
                              <span className="block text-[11px] text-slate-400">
                                {label}
                              </span>
                              <select
                                value={(effectiveMapping[key] as string) ?? ""}
                                onChange={(e) =>
                                  updateMappingField(key, e.target.value)
                                }
                                className="w-full rounded-lg border border-slate-800 bg-[#080B10] px-2 py-1.5 text-xs text-slate-200"
                              >
                                <option value="">— Select Column —</option>
                                {parsed.headers.map((h) => (
                                  <option key={h} value={h}>
                                    {h}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
              </div>
            )}
          </div>

          {/* Strategy Metadata Form */}
          <div className="rounded-2xl border border-slate-800/80 bg-[#0F141D] p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-100">
              2. Strategy Metadata & Parameters
            </h2>

            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <label className="space-y-1 sm:col-span-2">
                <span className="text-xs font-medium text-slate-400">
                  Strategy Name *
                </span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., BTC Keltner Breakout v4.2"
                  className="w-full rounded-xl border border-slate-800 bg-[#080B10] px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-emerald-500/60 focus:outline-none"
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-400">
                  Symbol / Ticker
                </span>
                <input
                  type="text"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  placeholder="BTC-USDT, SPY, NQ1!"
                  className="w-full rounded-xl border border-slate-800 bg-[#080B10] px-3 py-2 font-mono text-sm text-slate-100 focus:border-emerald-500/60 focus:outline-none"
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-400">
                  Initial Capital ($)
                </span>
                <input
                  type="number"
                  min={1}
                  step="any"
                  value={initialCapital}
                  onChange={(e) => setInitialCapital(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-[#080B10] px-3 py-2 font-mono text-sm text-slate-100 focus:border-emerald-500/60 focus:outline-none"
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-400">
                  Timeframe
                </span>
                <select
                  value={timeframe}
                  onChange={(e) => setTimeframe(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-[#080B10] px-3 py-2 font-mono text-sm text-slate-100 focus:border-emerald-500/60 focus:outline-none"
                >
                  {["1m", "5m", "15m", "30m", "1h", "4h", "1D", "1W"].map(
                    (tf) => (
                      <option key={tf} value={tf}>
                        {tf}
                      </option>
                    )
                  )}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-400">
                  Asset Class
                </span>
                <select
                  value={assetClass}
                  onChange={(e) => setAssetClass(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-[#080B10] px-3 py-2 text-sm text-slate-100 focus:border-emerald-500/60 focus:outline-none"
                >
                  {["Crypto", "Equities", "Futures", "Forex", "Options", "Multi-Asset"].map(
                    (ac) => (
                      <option key={ac} value={ac}>
                        {ac}
                      </option>
                    )
                  )}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-400">
                  Backtest Engine
                </span>
                <select
                  value={engine}
                  onChange={(e) => setEngine(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-[#080B10] px-3 py-2 text-sm text-slate-100 focus:border-emerald-500/60 focus:outline-none"
                >
                  {[
                    "TradingView",
                    "Backtrader",
                    "QuantConnect",
                    "VectorBT",
                    "MetaTrader",
                    "Custom CSV",
                    "JSON Report",
                  ].map((eng) => (
                    <option key={eng} value={eng}>
                      {eng}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-400">
                  Tags (comma-separated)
                </span>
                <input
                  type="text"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="breakout, trend, v4"
                  className="w-full rounded-xl border border-slate-800 bg-[#080B10] px-3 py-2 text-sm text-slate-100 focus:border-emerald-500/60 focus:outline-none"
                />
              </label>
            </div>

            {/* Key-value Parameters */}
            <div className="space-y-2 border-t border-slate-800/80 pt-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">
                  Hyperparameters (Optional)
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setParamPairs((prev) => [...prev, { key: "", value: "" }])
                  }
                  className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 hover:text-emerald-300"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Parameter
                </button>
              </div>
              {paramPairs.map((pair, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Parameter (e.g. atrMult)"
                    value={pair.key}
                    onChange={(e) =>
                      setParamPairs((prev) =>
                        prev.map((p, i) =>
                          i === idx ? { ...p, key: e.target.value } : p
                        )
                      )
                    }
                    className="w-1/2 rounded-lg border border-slate-800 bg-[#080B10] px-2.5 py-1.5 font-mono text-xs text-slate-200"
                  />
                  <input
                    type="text"
                    placeholder="Value (e.g. 1.75)"
                    value={pair.value}
                    onChange={(e) =>
                      setParamPairs((prev) =>
                        prev.map((p, i) =>
                          i === idx ? { ...p, value: e.target.value } : p
                        )
                      )
                    }
                    className="w-1/2 rounded-lg border border-slate-800 bg-[#080B10] px-2.5 py-1.5 font-mono text-xs text-slate-200"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setParamPairs((prev) => prev.filter((_, i) => i !== idx))
                    }
                    className="rounded p-1.5 text-slate-500 hover:text-rose-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-400">
                Research Notes / Hypothesis
              </span>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Document entry rules, slippage assumptions, out-of-sample window..."
                className="w-full rounded-xl border border-slate-800 bg-[#080B10] p-3 text-sm text-slate-200 placeholder-slate-600 focus:border-emerald-500/60 focus:outline-none"
              />
            </label>

            {submitError && (
              <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-300">
                {submitError}
              </div>
            )}

            <button
              type="button"
              disabled={!liveAnalytics || submitting}
              onClick={handleSave}
              className="w-full rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 shadow-[0_0_24px_rgba(16,185,129,0.28)] transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting
                ? "Saving Backtest & Computing Metrics..."
                : "Save Backtest to Vault"}
            </button>
          </div>
        </div>

        {/* Right Column: Live Pre-Upload Quant Audit Preview */}
        <div className="space-y-6 lg:col-span-7">
          <div className="rounded-2xl border border-slate-800/80 bg-[#0F141D] p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-100">
                  3. Live Quantitative Audit Preview
                </h2>
                <p className="text-xs text-slate-500">
                  Real-time metrics computed directly from your uploaded data
                  prior to saving
                </p>
              </div>
              {liveAnalytics && (
                <span className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-mono text-xs text-emerald-300">
                  Ready to Persist
                </span>
              )}
            </div>

            {!liveAnalytics ? (
              <div className="flex h-[420px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-800 bg-[#0A0E16] px-6 text-center">
                <FileSpreadsheet className="h-10 w-10 text-slate-600" />
                <p className="mt-3 text-sm font-medium text-slate-300">
                  Waiting for Backtest File
                </p>
                <p className="mt-1 max-w-sm text-xs text-slate-500">
                  Upload a CSV or JSON file on the left — or click one of the 4{" "}
                  <span className="text-emerald-400">Test in Uploader</span>{" "}
                  templates above — to preview the full equity curve and risk
                  metrics.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {/* KPI Preview Grid */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-xl border border-slate-800 bg-[#0A0E16] p-3">
                    <div className="text-[11px] text-slate-500">Net Profit</div>
                    <div
                      className={`mt-1 font-mono text-base font-bold tabular-nums ${
                        liveAnalytics.netProfit >= 0
                          ? "text-emerald-400"
                          : "text-rose-400"
                      }`}
                    >
                      {formatCurrencyExact(liveAnalytics.netProfit, true)}
                    </div>
                    <div className="font-mono text-[11px] text-slate-400">
                      {formatPct(liveAnalytics.totalReturnPct)}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-[#0A0E16] p-3">
                    <div className="text-[11px] text-slate-500">
                      Sharpe / Sortino
                    </div>
                    <div className="mt-1 font-mono text-base font-bold tabular-nums text-slate-100">
                      {formatRatio(liveAnalytics.sharpeRatio)}
                      <span className="text-slate-500"> / </span>
                      <span className="text-cyan-300">
                        {formatRatio(liveAnalytics.sortinoRatio)}
                      </span>
                    </div>
                    <div className="font-mono text-[11px] text-slate-500">
                      Calmar {formatRatio(liveAnalytics.calmarRatio)}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-[#0A0E16] p-3">
                    <div className="text-[11px] text-slate-500">
                      Max Drawdown
                    </div>
                    <div className="mt-1 font-mono text-base font-bold tabular-nums text-rose-400">
                      {formatPct(liveAnalytics.maxDrawdownPct, false)}
                    </div>
                    <div className="font-mono text-[11px] text-slate-500">
                      {formatCurrencyExact(liveAnalytics.maxDrawdownAmount)}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-[#0A0E16] p-3">
                    <div className="text-[11px] text-slate-500">
                      {liveAnalytics.totalTrades > 0
                        ? "Win Rate / PF"
                        : "Period Win Rate"}
                    </div>
                    <div className="mt-1 font-mono text-base font-bold tabular-nums text-slate-100">
                      {liveAnalytics.winRatePct.toFixed(1)}%
                      <span className="text-slate-500"> · </span>
                      <span className="text-emerald-400">
                        {formatRatio(liveAnalytics.profitFactor)}
                      </span>
                    </div>
                    <div className="font-mono text-[11px] text-slate-500">
                      {liveAnalytics.totalTrades > 0
                        ? `${liveAnalytics.totalTrades} trades`
                        : `${liveAnalytics.equityPoints.length} curve pts`}
                    </div>
                  </div>
                </div>

                {/* Live Equity & Drawdown Preview */}
                <EquityDrawdownChart
                  points={liveAnalytics.equityPoints}
                  initialCapital={liveAnalytics.initialCapital}
                  height={330}
                />

                {/* Raw Row Preview */}
                {parsed && parsed.previewRows.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-slate-400">
                      Raw File Sample (First {parsed.previewRows.length} of{" "}
                      {parsed.totalRawRows} rows)
                    </div>
                    <div className="overflow-x-auto rounded-xl border border-slate-800 bg-[#0A0E16]">
                      <table className="w-full text-left font-mono text-[11px]">
                        <thead className="border-b border-slate-800 bg-slate-900/80 text-slate-400">
                          <tr>
                            {parsed.headers.slice(0, 7).map((h) => (
                              <th key={h} className="px-3 py-2 font-medium">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 text-slate-300">
                          {parsed.previewRows.slice(0, 5).map((row, idx) => (
                            <tr key={idx}>
                              {parsed.headers.slice(0, 7).map((h) => (
                                <td
                                  key={h}
                                  className="max-w-[140px] truncate px-3 py-1.5"
                                >
                                  {row[h] ?? ""}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
