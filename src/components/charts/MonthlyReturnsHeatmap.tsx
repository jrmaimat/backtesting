"use client";

import type { MonthlyReturnEntry } from "@/db/schema";
import { formatCurrencyExact, formatPct } from "@/lib/formatters";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

interface MonthlyReturnsHeatmapProps {
  monthlyReturns: MonthlyReturnEntry[];
}

function cellStyle(returnPct: number | null) {
  if (returnPct === null) {
    return {
      backgroundColor: "rgba(15, 23, 42, 0.45)",
      color: "rgb(71, 85, 105)",
      borderColor: "rgba(30, 41, 59, 0.5)",
    };
  }
  const intensity = Math.min(1, Math.abs(returnPct) / 14);
  if (returnPct > 0) {
    return {
      backgroundColor: `rgba(16, 185, 129, ${0.12 + intensity * 0.38})`,
      color: intensity > 0.45 ? "#ECFDF5" : "#6EE7B7",
      borderColor: `rgba(16, 185, 129, ${0.22 + intensity * 0.35})`,
    };
  }
  if (returnPct < 0) {
    return {
      backgroundColor: `rgba(244, 63, 94, ${0.12 + intensity * 0.38})`,
      color: intensity > 0.45 ? "#FFF1F2" : "#FDA4AF",
      borderColor: `rgba(244, 63, 94, ${0.22 + intensity * 0.35})`,
    };
  }
  return {
    backgroundColor: "rgba(30, 41, 59, 0.55)",
    color: "rgb(148, 163, 184)",
    borderColor: "rgba(51, 65, 85, 0.6)",
  };
}

export function MonthlyReturnsHeatmap({
  monthlyReturns,
}: MonthlyReturnsHeatmapProps) {
  if (!monthlyReturns || monthlyReturns.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-slate-800 bg-[#0A0E16] text-sm text-slate-500">
        Not enough multi-month date span to build a monthly returns heatmap.
      </div>
    );
  }

  const years = Array.from(new Set(monthlyReturns.map((m) => m.year))).sort(
    (a, b) => b - a
  );
  const lookup = new Map<string, MonthlyReturnEntry>();
  for (const m of monthlyReturns) {
    lookup.set(`${m.year}-${m.month}`, m);
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800/80 bg-[#0A0E16] p-4">
      <table className="w-full min-w-[760px] border-separate border-spacing-1.5 text-center">
        <thead>
          <tr>
            <th className="w-16 pb-1 text-left font-mono text-[11px] font-medium uppercase tracking-wider text-slate-500">
              Year
            </th>
            {MONTHS.map((m) => (
              <th
                key={m}
                className="pb-1 font-mono text-[11px] font-medium uppercase tracking-wider text-slate-500"
              >
                {m}
              </th>
            ))}
            <th className="w-20 pb-1 font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-300">
              Annual
            </th>
          </tr>
        </thead>
        <tbody>
          {years.map((year) => {
            let compounded = 1;
            let totalPnl = 0;
            let hasMonths = false;
            for (let m = 1; m <= 12; m++) {
              const entry = lookup.get(`${year}-${m}`);
              if (entry) {
                hasMonths = true;
                compounded *= 1 + entry.returnPct / 100;
                totalPnl += entry.pnl;
              }
            }
            const ytdPct = hasMonths ? (compounded - 1) * 100 : null;
            const ytdStyle = cellStyle(ytdPct);

            return (
              <tr key={year}>
                <td className="pr-2 text-left font-mono text-xs font-semibold text-slate-300">
                  {year}
                </td>
                {MONTHS.map((label, idx) => {
                  const entry = lookup.get(`${year}-${idx + 1}`);
                  const st = cellStyle(entry ? entry.returnPct : null);
                  return (
                    <td
                      key={label}
                      title={
                        entry
                          ? `${label} ${year}: ${formatPct(
                              entry.returnPct
                            )} (${formatCurrencyExact(entry.pnl, true)})`
                          : `${label} ${year}: No data`
                      }
                      style={{
                        backgroundColor: st.backgroundColor,
                        color: st.color,
                        borderColor: st.borderColor,
                      }}
                      className="rounded-md border px-1.5 py-2 font-mono text-[11px] tabular-nums font-medium transition hover:brightness-125"
                    >
                      {entry ? `${entry.returnPct > 0 ? "+" : ""}${entry.returnPct.toFixed(1)}%` : "—"}
                    </td>
                  );
                })}
                <td
                  title={`Annual ${year}: ${
                    ytdPct !== null ? formatPct(ytdPct) : "—"
                  } (${formatCurrencyExact(totalPnl, true)})`}
                  style={{
                    backgroundColor: ytdStyle.backgroundColor,
                    color: ytdStyle.color,
                    borderColor: ytdStyle.borderColor,
                  }}
                  className="rounded-md border px-2 py-2 font-mono text-[11px] tabular-nums font-bold"
                >
                  {ytdPct !== null ? `${ytdPct > 0 ? "+" : ""}${ytdPct.toFixed(1)}%` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
