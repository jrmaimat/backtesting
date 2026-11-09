"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, GitCompareArrows, Layers, Upload } from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Strategy Vault", icon: Layers },
  { href: "/upload", label: "Upload Results", icon: Upload },
  { href: "/compare", label: "Compare Alpha", icon: GitCompareArrows },
];

export function AppNavbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-[#080B10]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6">
          <Link href="/" className="group flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 shadow-[0_0_20px_rgba(16,185,129,0.16)] transition-transform group-hover:scale-105">
              <BarChart3 className="h-5 w-5 text-emerald-400" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-semibold tracking-tight text-slate-100">
                  QuantVault
                </span>
                <span className="hidden rounded border border-slate-700/80 bg-slate-800/80 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-slate-400 sm:inline-block">
                  v2.4
                </span>
              </div>
              <span className="hidden text-[11px] text-slate-500 sm:block">
                Backtest Analytics Workbench
              </span>
            </div>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.href === "/"
                  ? pathname === "/" || pathname.startsWith("/backtests")
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-slate-800/90 text-slate-50 shadow-inner"
                      : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 ${
                      isActive ? "text-emerald-400" : "text-slate-500"
                    }`}
                  />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 md:hidden">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.href === "/"
                  ? pathname === "/" || pathname.startsWith("/backtests")
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  className={`rounded-lg p-2 transition-colors ${
                    isActive
                      ? "bg-slate-800 text-emerald-400"
                      : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </Link>
              );
            })}
          </div>

          <Link
            href="/upload"
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-slate-950 shadow-[0_0_24px_rgba(16,185,129,0.28)] transition hover:bg-emerald-400 sm:px-4 sm:text-sm"
          >
            <Upload className="h-4 w-4 stroke-[2.25]" />
            <span>Upload Backtest</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
