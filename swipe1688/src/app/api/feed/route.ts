import { NextRequest, NextResponse } from "next/server";
import { getProvider, defaultProvider, PROVIDERS } from "@/lib/providers";
import type { FeedPage } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { provider?: string; query?: string; cursor?: string | null; seed?: number };

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

  for (const provider of chain) {
    if (!provider.ready()) {
      problems.push(`${provider.label}: не настроен`);
      continue;
    }
    // Курсор принадлежит конкретному источнику — при переключении начинаем сначала.
    const cursor = provider.id === requested.id ? (body.cursor ?? null) : null;
    try {
      const page = await provider.page({ query, cursor, seed });
      if (!page.products.length) {
        problems.push(`${provider.label}: пусто по запросу «${query || "витрина"}»`);
        continue;
      }
      const result: FeedPage = {
        products: page.products,
        cursor: page.cursor,
        provider: provider.id,
        providerLabel: provider.label,
        looped: page.looped,
      };
      return NextResponse.json(result);
    } catch (e) {
      problems.push(`${provider.label}: ${e instanceof Error ? e.message : "ошибка"}`);
    }
  }

  return NextResponse.json(
    { error: "Ни один источник не ответил", problems },
    { status: 502 },
  );
}
