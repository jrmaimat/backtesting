import { NextResponse } from "next/server";
import { ensureDemoSeeded } from "@/lib/seed-demo";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await ensureDemoSeeded(true);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/backtests/seed error:", error);
    return NextResponse.json(
      { error: "Failed to load demo strategies." },
      { status: 500 }
    );
  }
}
