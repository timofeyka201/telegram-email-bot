import { NextRequest, NextResponse } from "next/server";
import { getProvider, defaultProvider, PROVIDERS } from "@/lib/providers";
import type { TasteHint } from "@/lib/taste";
import type { FeedPage } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Бюджет на перебор источников: функция должна успеть ответить до лимита. */
const BUDGET_MS = 20_000;

type Body = {
  provider?: string;
  query?: string;
  cursor?: string | null;
  seed?: number;
  filters?: { categories?: string[]; maxPrice?: number; onlyDiscount?: boolean };
  hint?: TasteHint;
};

/**
 * Одна страница бесконечной ленты. Если выбранный источник упал или ничего не
 * отдал, спускаемся по цепочке к следующему готовому — лента не должна
 * обрываться из-за одного недоступного API.
 */
export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Некорректное тело запроса" }, { status: 400 });
  }

  const query = (body.query || "").trim();
  const seed = Number.isFinite(body.seed) ? Number(body.seed) : 1;
  const requested = body.provider ? getProvider(body.provider) : defaultProvider();

  // Порядок попыток: запрошенный источник, затем остальные готовые.
  const chain = [requested, ...PROVIDERS.filter((p) => p.id !== requested.id && p.ready())];
  const problems: string[] = [];
  const startedAt = Date.now();
  /** Источник ответил, но по запросу у него пусто. */
  let empty: { provider: (typeof chain)[number]; total: number } | null = null;

  for (const provider of chain) {
    if (Date.now() - startedAt > BUDGET_MS) {
      problems.push("остальные источники не успели ответить");
      break;
    }
    if (!provider.ready()) {
      problems.push(`${provider.label}: не настроен`);
      continue;
    }
    // Курсор принадлежит конкретному источнику — при переключении начинаем сначала.
    const cursor = provider.id === requested.id ? (body.cursor ?? null) : null;
    try {
      const page = await provider.page({ query, cursor, seed, filters: body.filters, hint: body.hint });
      if (!page.products.length) {
        // Поиск, не нашедший ничего, — это ответ, а не сбой источника.
        // Раньше он попадал в ту же корзину, что упавшее API, и человек
        // видел «Лента прервалась» вместо «по запросу ничего нет».
        // Запоминаем самый богатый ответ: следом в цепочке стоит офлайн-
        // подборка на дюжину карточек, и её ноль не должен затирать «по
        // запросу нашлось сорок, вы их посмотрели».
        if (query && (page.total ?? 0) >= (empty?.total ?? -1)) empty = { provider, total: page.total ?? 0 };
        problems.push(`${provider.label}: пусто по запросу «${query || "витрина"}»`);
        continue;
      }
      const result: FeedPage = {
        products: page.products,
        cursor: page.cursor,
        provider: provider.id,
        providerLabel: provider.label,
        looped: page.looped,
        total: page.total,
        loose: page.loose,
      };
      return NextResponse.json(result);
    } catch (e) {
      problems.push(`${provider.label}: ${e instanceof Error ? e.message : "ошибка"}`);
    }
  }

  if (empty) {
    const result: FeedPage = {
      products: [],
      cursor: body.cursor ?? "0.0",
      provider: empty.provider.id,
      providerLabel: empty.provider.label,
      looped: false,
      total: empty.total,
      noMore: true,
    };
    return NextResponse.json(result);
  }

  return NextResponse.json(
    { error: "Ни один источник не ответил", problems },
    { status: 502 },
  );
}
