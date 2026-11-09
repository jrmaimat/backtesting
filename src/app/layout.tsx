import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { AppNavbar } from "@/components/AppNavbar";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "QuantVault — Backtest Results & Strategy Analytics Workbench",
  description:
    "Upload TradingView, CSV, or JSON backtested trading results to inspect equity curves, drawdowns, Sharpe/Sortino ratios, monthly heatmaps, and trade ledgers.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} dark`}
    >
      <body className="min-h-screen bg-[#080B10] text-slate-200 antialiased selection:bg-emerald-500/30 selection:text-emerald-200">
        <div className="quant-grid-bg min-h-screen flex flex-col">
          <AppNavbar />
          <main className="flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
