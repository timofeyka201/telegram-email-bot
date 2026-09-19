import { NextResponse } from "next/server";
import { endSession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  await endSession();
  return NextResponse.json({ ok: true });
}
