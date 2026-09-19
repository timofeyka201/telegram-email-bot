import { NextResponse } from "next/server";
import { currentUser, toPublic } from "@/lib/auth/session";
import { storageWarning } from "@/lib/auth/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // Приложение опрашивает этот адрес при каждой загрузке: упавшее хранилище
  // должно оборачиваться предупреждением, а не пятисоткой на весь интерфейс.
  try {
    const user = await currentUser();
    return NextResponse.json(
      { user: user ? toPublic(user) : null, warning: storageWarning() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("Проверка сессии: хранилище недоступно —", e);
    return NextResponse.json(
      { user: null, warning: "Хранилище учётных записей не отвечает. Подробности: /api/auth/health" },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
