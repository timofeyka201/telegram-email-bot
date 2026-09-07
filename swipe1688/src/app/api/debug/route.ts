import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiGet } from "@/lib/bhapi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Сырой ответ парсера — чтобы сверить реальную схему полей и при необходимости
 * дотянуть нормализацию. В проде отключён, включается ENABLE_DEBUG=1.
 */
export async function GET(req: NextRequest) {
  const enabled = process.env.NODE_ENV !== "production" || process.env.ENABLE_DEBUG === "1";
  if (!enabled) return NextResponse.json({ error: "disabled" }, { status: 404 });

  const sp = req.nextUrl.searchParams;
  const path = sp.get("path") || "/item/by-url";
  const params: Record<string, string> = {};
  sp.forEach((v, k) => {
    if (k !== "path") params[k] = v;
  });

  try {
    return NextResponse.json({ path, params, raw: await apiGet(path, params) });
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError(String(e));
    return NextResponse.json({ path, params, error: err.message }, { status: err.status ?? 502 });
  }
}
