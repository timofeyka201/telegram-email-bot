import { NextRequest, NextResponse } from "next/server";
import { getProvider, defaultProvider, PROVIDERS } from "@/lib/providers";
import type { TasteHint } from "@/lib/taste";
import { logEvent } from "@/lib/stats/events";
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
  filters?: { group?: string; categories?: string[]; maxPrice?: number; onlyDiscount?: boolean };
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

  /*
   * Настоящая витрина есть — значит подменять её нечем.
   *
   * Офлайн-подборка стоит в цепочке запасных и отвечала всякий раз, когда у
   * снапшота по запросу было пусто: человек искал что-то, чего на AliExpress
   * не нашлось, и получал двенадцать встроенных карточек со ссылками на 1688.
   * Хуже того, приложение запоминало ответивший источник и продолжало
   * спрашивать его дальше — витрина так и оставалась подборкой до сброса.
   * Поэтому подборка участвует, только когда снапшота нет вовсе, и просьбу
   * клиента взять её мы тоже не исполняем, если настоящая витрина готова.
   */
  const live = PROVIDERS.some((p) => !p.fallbackOnly && p.ready());
  const usable = PROVIDERS.filter((p) => p.ready() && (!live || !p.fallbackOnly));
  const asked = body.provider ? getProvider(body.provider) : defaultProvider();
  const requested = usable.includes(asked) ? asked : (usable[0] ?? defaultProvider());

  // Порядок попыток: запрошенный источник, затем остальные пригодные.
  const chain = [requested, ...usable.filter((p) => p.id !== requested.id)];
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
      /*
       * «Под фильтром показали всё» — это ответ витрины, а не её молчание.
       * Если пойти дальше по цепочке, следом ответит офлайн-подборка, и
       * человек получит дюжину чужих карточек вместо честного «это всё».
       */
      if (!page.products.length && page.noMore) {
        const done: FeedPage = {
          products: [],
          cursor: page.cursor,
          provider: provider.id,
          providerLabel: provider.label,
          looped: false,
          total: page.total,
          noMore: true,
        };
        return NextResponse.json(done);
      }
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
      // Сколько сервер думал над страницей: отсюда берутся p50/p95 и ответ на
      // вопрос «почему долго крутится подбор».
      void logEvent("feed", {
        ms: Date.now() - startedAt,
        n: page.products.length,
        search: !!query,
        filtered: !!(body.filters && Object.keys(body.filters).length),
        provider: provider.id,
      });
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

  void logEvent("feed", { ms: Date.now() - startedAt, n: 0, error: true, search: !!query });
  return NextResponse.json(
    { error: "Ни один источник не ответил", problems },
    { status: 502 },
  );
}
