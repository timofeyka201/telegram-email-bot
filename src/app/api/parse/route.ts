import { NextRequest, NextResponse } from "next/server";
import { ApiError, fetchByUrl, hasToken, search, splitInputs, toOfferUrl } from "@/lib/bhapi";
import { demoDeck } from "@/lib/demo";
import type { ParseResult, Product } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Body = { mode?: "search" | "urls" | "demo"; query?: string; page?: number };

/** Параллельно, но не больше N запросов разом — чтобы не ловить лимиты парсера. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Некорректное тело запроса" }, { status: 400 });
  }

  const query = (body.query || "").trim();
  const mode = body.mode ?? (query ? "search" : "demo");

  if (mode === "demo") {
    const result: ParseResult = { products: demoDeck(24), errors: [], source: "demo" };
    return NextResponse.json(result);
  }

  if (!hasToken()) {
    return NextResponse.json(
      { error: "Токен парсера не настроен. Добавьте BHAPI_TOKEN в .env.local или откройте демо-подборку." },
      { status: 503 },
    );
  }

  // --- режим ссылок: единственный подтверждённый эндпоинт, работает всегда
  if (mode === "urls") {
    const inputs = splitInputs(query);
    const urls = inputs.map((raw) => ({ raw, url: toOfferUrl(raw) }));
    const errors: ParseResult["errors"] = urls
      .filter((u) => !u.url)
      .map((u) => ({ input: u.raw, message: "Не похоже на ссылку или ID товара 1688" }));

    const valid = urls.filter((u): u is { raw: string; url: string } => u.url !== null);
    if (!valid.length) {
      return NextResponse.json({ error: "Не нашёл ни одной ссылки на товар 1688", errors }, { status: 400 });
    }

    type Settled = { ok: true; product: Product } | { ok: false; error: { input: string; message: string } };
    const settled = await mapLimit<{ raw: string; url: string }, Settled>(valid, 5, async ({ raw, url }) => {
      try {
        return { ok: true, product: await fetchByUrl(url) };
      } catch (e) {
        return { ok: false, error: { input: raw, message: e instanceof ApiError ? e.message : "Не удалось разобрать" } };
      }
    });

    const products: Product[] = [];
    for (const s of settled) {
      if (s.ok) products.push(s.product);
      else errors.push(s.error);
    }

    if (!products.length) {
      return NextResponse.json({ error: errors[0]?.message ?? "Ничего не удалось разобрать", errors }, { status: 502 });
    }
    const result: ParseResult = { products, errors, source: "api" };
    return NextResponse.json(result);
  }

  // --- режим поиска по слову
  if (!query) return NextResponse.json({ error: "Пустой запрос" }, { status: 400 });
  try {
    const { products, endpoint } = await search(query, body.page ?? 1);
    const result: ParseResult = { products, errors: [], source: "api", endpoint };
    return NextResponse.json(result);
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError("Неизвестная ошибка");
    const hint =
      err.status === 401 || err.status === 403
        ? "Проверьте BHAPI_TOKEN."
        : "Поиск по слову у этого парсера может быть недоступен — вставьте ссылки на товары 1688, это работает наверняка.";
    return NextResponse.json({ error: `${err.message}. ${hint}` }, { status: err.status ?? 502 });
  }
}
