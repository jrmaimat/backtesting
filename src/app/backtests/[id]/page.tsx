import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { backtestEquityPoints, backtestTrades, backtests } from "@/db/schema";
import { BacktestDetailView } from "@/components/BacktestDetailView";

export const dynamic = "force-dynamic";

export default async function BacktestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [backtest] = await db
    .select()
    .from(backtests)
    .where(eq(backtests.id, id));

  if (!backtest) {
    notFound();
  }

  const [equityPoints, trades] = await Promise.all([
    db
      .select()
      .from(backtestEquityPoints)
      .where(eq(backtestEquityPoints.backtestId, id))
      .orderBy(asc(backtestEquityPoints.pointIndex)),
    db
      .select()
      .from(backtestTrades)
      .where(eq(backtestTrades.backtestId, id))
      .orderBy(asc(backtestTrades.tradeNumber))
      .limit(3000),
  ]);

  return (
    <BacktestDetailView
      initialBacktest={backtest}
      equityPoints={equityPoints}
      trades={trades}
    />
  );
}
