import { NextResponse } from "next/server";
import { hasToken } from "@/lib/bhapi";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ tokenConfigured: hasToken() });
}
