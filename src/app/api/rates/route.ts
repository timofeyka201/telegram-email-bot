import { NextResponse } from "next/server";
import { currentRates } from "@/lib/rates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Курс валют к рублю. Раньше его задавал руками сам человек в настройках —
 * теперь приложение берёт его у Центробанка и раздаёт всем одинаковый.
 */
export async function GET() {
  const { rates, date, source } = await currentRates();
  return NextResponse.json(
    { rates, date, source },
    // Полчаса в кэше браузера: курс за это время не меняется, а запрос при
    // каждом открытии приложения ни к чему.
    { headers: { "Cache-Control": "public, max-age=1800" } },
  );
}
