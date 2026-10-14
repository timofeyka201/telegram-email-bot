import { NextRequest, NextResponse } from "next/server";
import { buildReport } from "@/lib/stats/aggregate";
import { metricsAccess } from "@/lib/stats/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Сводка в JSON — для консольной команды и для всего, что захочется
 * нарисовать поверх. Страница в приложении считает то же самое напрямую,
 * без похода по сети.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const access = await metricsAccess(url.searchParams.get("key"));
  if (access === "unset") {
    return NextResponse.json(
      { error: "Доступ к статистике не настроен: задайте METRICS_EMAILS или METRICS_KEY" },
      { status: 503 },
    );
  }
  if (access !== "ok") return new NextResponse("Нет такой страницы", { status: 404 });

  const days = Math.min(120, Math.max(1, Number(url.searchParams.get("days") ?? 7) || 7));
  const report = await buildReport(days);
  return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
}
