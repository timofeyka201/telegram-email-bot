import { NextResponse } from "next/server";
import { diagnoseStorage } from "@/lib/auth/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Проверка хранилища учётных записей. Ни адрес базы, ни токен наружу не выходят —
 * только вердикт, по которому понятно, что именно чинить.
 */
export async function GET() {
  const report = await diagnoseStorage();
  return NextResponse.json(report, {
    status: report.reachable ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
