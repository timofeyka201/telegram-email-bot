import { catalogCategories, catalogInfo, catalogProducts } from "../catalog";
import { categoryLabel, groupLabel } from "../categories";
import type { Product } from "../types";
import { toRub } from "../money";
import type { TasteHint } from "../taste";
import { searchCatalog } from "../search";
import { decodeCursor, encodeCursor, mulberry32, shuffle, type Filters, type GroupFacet, type PageArgs, type Provider, type ProviderPage } from "./types";

/**
 * Собственная база товаров: файл data/catalog.json, который отдаётся
 * постранично. Ни от каких внешних API не зависит — а значит, не ловит ни
 * лимитов, ни блокировок по IP, которыми маркетплейсы встречают серверные
 * запросы из дата-центров.
 *
 * Наполняется импортёрами (scripts/build-catalog-*.mjs), которые пишут снапшот
 * на диск. Читается он лениво, поэтому обновлённый каталог подхватывается без
 * перезапуска приложения.
 */

const PAGE = 18;

/**
 * Сколько карточек просматривается, чтобы набрать страницу.
 *
 * Было пятьдесят четыре — ровно три страницы, — и вкус в таком окне почти
 * ничего не решал: если любимая категория занимает в каталоге три процента,
 * в окне из пятидесяти четырёх карточек её будет полторы штуки, и
 * подстраивать нечего. С шестью сотнями кандидатов в том же случае
 * набирается два десятка — уже есть из чего выбирать. Просмотр шестисот
 * карточек в памяти стоит доли миллисекунды, а остаток окна уходит в этом
 * круге безвозвратно: при каталоге в сто тысяч позиций это не потеря.
 */
const POOL = Number(process.env.FEED_POOL ?? 600);

/**
 * Какую долю страницы выбирает вкус. Остальное — разведка: случайные карточки
 * из того же окна. Без неё лента схлопывается в две-три любимые категории и
 * человек перестаёт находить новое, а вместе с этим пропадает и смысл
 * бесконечной ленты.
 */
const TASTE_SHARE = Number(process.env.FEED_TASTE_SHARE ?? 0.7);

/**
 * Вес категории, ниже которого разведка её не предлагает. −4 — это примерно
 * три отказа подряд: уже не случайность.
 */
const HARD_NO = -4;

/**
 * Вес, ниже которого по модулю категория считается неизученной: человек по
 * ней ещё не высказался, и именно такие интереснее всего показать в разведке.
 */
const UNKNOWN = 2;

/**
 * Категории приходят из разных источников разными слагами: «furniture» и
 * «Furniture» — это одно и то же. Схлопываем их по русскому ярлыку, он же
 * становится значением фильтра. Одиночные категории в список не берём: выбирать
 * из них нечего, а строку фильтров они забивают.
 */
function buildCategoryFacets(all: Product[]): string[] {
  const counts = new Map<string, number>();
  for (const p of all) {
    if (!p.category) continue;
    const label = categoryLabel(p.category);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ru"))
    .map(([label]) => label);
}

/**
 * Цены отложенных товаров. Идентификаторы с суффиксом круга («-r1») указывают
 * на тот же товар, поэтому суффикс отбрасываем.
 */
export function currentPrices(ids: string[]): Record<string, number> {
  const byId = new Map(catalogProducts().map((p) => [p.id, p]));
  const out: Record<string, number> = {};
  for (const id of ids) {
    const base = id.replace(/-r\d+$/, "");
    const price = byId.get(base)?.price;
    if (price !== undefined) out[id] = price;
  }
  return out;
}

/**
 * Разделы с их категориями. Тридцать с лишним категорий плоской строкой —
 * это свиток, по которому надо скроллить до «Купальников»; с разделом
 * сверху до них два тапа: «Женская одежда» → «Купальники».
 *
 * Пустые разделы в строку не попадают, иначе человек нажимает на раздел и
 * оказывается в пустоте.
 */
function buildGroupFacets(all: Product[]): GroupFacet[] {
  const counts = new Map<string, Map<string, number>>();
  for (const p of all) {
    if (!p.category) continue;
    const group = groupLabel(p);
    if (!counts.has(group)) counts.set(group, new Map());
    const inside = counts.get(group)!;
    const label = categoryLabel(p.category);
    inside.set(label, (inside.get(label) ?? 0) + 1);
  }

  const size = (inside: Map<string, number>) => [...inside.values()].reduce((a, b) => a + b, 0);
  return [...counts.entries()]
    .filter(([, inside]) => size(inside) >= 2)
    .sort((a, b) => size(b[1]) - size(a[1]) || a[0].localeCompare(b[0], "ru"))
    .map(([title, inside]) => ({
      title,
      categories: [...inside.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ru"))
        .map(([label]) => label),
    }));
}

/**
 * Диапазон цен, разделы и список категорий для панели фильтров.
 * Пересчитываются вместе со снапшотом: прежние константы вычислялись один раз
 * при запуске и после обновления каталога показывали бы вчерашние категории.
 */
export function facets(): { categories: string[]; groups: GroupFacet[]; maxPrice: number; currency: string } {
  const all = catalogProducts();
  return {
    categories: buildCategoryFacets(all),
    groups: buildGroupFacets(all),
    maxPrice: all.reduce((max, p) => (p.price !== undefined && p.price > max ? p.price : max), 0),
    currency: all[0]?.currency ?? "RUB",
  };
}

export function meta(): { kind: string; generatedAt: string | null; total: number; categories: string[]; source: string } {
  const info = catalogInfo();
  return { ...info, categories: catalogCategories() };
}

/** Фильтры применяются к своей базе — у неё есть и категории, и цены. */
function passes(p: Product, f?: Filters): boolean {
  if (!f) return true;
  if (f.group && groupLabel(p) !== f.group) return false;
  // В фильтре лежат ярлыки, а не слаги — так совпадают синонимы из разных источников.
  if (f.categories?.length && (!p.category || !f.categories.includes(categoryLabel(p.category)))) return false;
  if (f.maxPrice !== undefined && (p.price === undefined || p.price > f.maxPrice)) return false;
  if (f.onlyDiscount && !(p.priceMax !== undefined && p.price !== undefined && p.priceMax > p.price)) return false;
  return true;
}

/**
 * Оценка товара под профиль вкуса. Считается так, чтобы ни один сигнал не
 * перебивал остальные полностью: лента должна подстраиваться, но не схлопываться
 * в одну категорию.
 */
function score(p: Product, hint: TasteHint | undefined, rnd: () => number): number {
  // Небольшой шум не даёт ленте застыть в одном и том же порядке.
  let value = rnd() * 1.2;
  if (!hint) return value;

  const label = p.category ? categoryLabel(p.category) : undefined;
  if (label && hint.picked?.includes(label)) value += 3;
  if (label && hint.categories) value += hint.categories[label] ?? 0;
  if (p.brand && hint.brands) value += (hint.brands[p.brand] ?? 0) * 0.7;

  if (hint.budget !== undefined && p.price !== undefined) {
    const rub = toRub(p.price, p.currency, hint.rates ?? {}) ?? p.price;
    // Выход за бюджет наказывается тем сильнее, чем сильнее превышение.
    if (rub > hint.budget) value -= Math.min(4, 1.5 + (rub / hint.budget - 1) * 2);
  }
  return value;
}

/** Название источника по снапшоту: витрина на AliExpress не должна называться
 *  «своей базой» — человек видит этот ярлык в настройках. */
const SNAPSHOT_LABEL: Record<string, string> = { ae: "AliExpress", etsy: "Etsy", global: "Открытый каталог" };

/**
 * Страница из окна кандидатов: большая часть — под вкус, остаток — разведка.
 *
 * Разведочные карточки берутся случайно из того, что вкус отложил, и
 * перемешиваются с остальными: если поставить их блоком в конец, человек
 * просто досвайпает до «чужого» куска и решит, что лента сломалась.
 */
function pick(found: Product[], hint: TasteHint, rnd: () => number): Product[] {
  const scored = found
    .map((p) => ({ p, s: score(p, hint, rnd) }))
    .sort((a, b) => b.s - a.s);

  const liked = Math.min(scored.length, Math.max(1, Math.round(PAGE * TASTE_SHARE)));
  const out = scored.slice(0, liked).map((x) => x.p);

  /*
   * Разведка — это «покажи что-нибудь ещё», и порядок предпочтений тут
   * такой: сперва то, о чём человек ещё не высказывался, потом знакомое, но
   * не отвергнутое, и только в крайнем случае что угодно. Категории,
   * уведённые глубоко в минус, не предлагаются: шесть отказов подряд — это
   * уже ответ. А если человек отверг вообще всё, кроме любимого, лента
   * честно станет лентой любимого.
   */
  const open = scored.slice(liked).map((x) => x.p);
  const weightOf = (p: Product) => hint.categories?.[categoryLabel(p.category)] ?? 0;
  const already = new Set(out.map((p) => categoryLabel(p.category)));
  const fresh = (p: Product) => !already.has(categoryLabel(p.category));
  const tiers = [
    open.filter((p) => fresh(p) && Math.abs(weightOf(p)) < UNKNOWN),
    open.filter((p) => fresh(p) && weightOf(p) > HARD_NO),
    open.filter((p) => weightOf(p) > HARD_NO),
    open,
  ];

  const taken = new Set<string>();
  for (const tier of tiers) {
    const bag = tier.filter((p) => !taken.has(p.id));
    while (out.length < PAGE && bag.length) {
      const [p] = bag.splice(Math.floor(rnd() * bag.length), 1);
      taken.add(p.id);
      out.push(p);
    }
    if (out.length >= PAGE) break;
  }

  // Перетасовка Фишера — Йетса: порядок внутри страницы не должен выдавать,
  // что сначала идёт любимое, а потом новое.
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const localProvider: Provider = {
  id: "local",
  get label() {
    return SNAPSHOT_LABEL[catalogInfo().kind] ?? "Своя база";
  },
  get note() {
    return `${catalogProducts().length} карточек в снапшоте. Работает всегда, без внешних API.`;
  },
  needsToken: false,
  ready: () => catalogProducts().length > 0,

  async page({ query, cursor, seed, filters, hint }: PageArgs): Promise<ProviderPage> {
    const { offset, round } = decodeCursor(cursor);

    // Снимок берём один раз на запрос: между строками он может смениться, если
    // импортёр как раз дописал новый.
    const all = catalogProducts();
    if (!all.length) return { products: [], cursor: encodeCursor(0, round), looped: false };

    // Отвергнутое исключаем жёстко: свайп влево — это «больше не показывай».
    const banned = new Set(hint?.exclude ?? []);

    /*
     * Поиск идёт отдельной дорогой.
     *
     * Выдача по запросу упорядочена близостью к нему, а не вкусом и не
     * случайностью: человек, набравший «красное платье», ждёт красных платьев,
     * а не того, что ему обычно нравится. Круги здесь тоже ни к чему —
     * найденное конечно, и когда оно кончится, честнее так и сказать.
     */
    if (query.trim()) {
      const { ranked, total, loose } = searchCatalog(all, query, {
        accept: (p) => passes(p, filters),
        filterKey: JSON.stringify(filters ?? {}),
      });
      const found: Product[] = [];
      let i = offset;
      for (; i < ranked.length && found.length < PAGE; i++) {
        if (!banned.has(ranked[i].id)) found.push(ranked[i]);
      }
      return { products: found, cursor: encodeCursor(i, 0), looped: false, total, loose };
    }

    /*
     * Окно не должно съедать круг целиком: шестьсот кандидатов на страницу
     * разумны для ста тысяч карточек, а для запасного каталога в две сотни
     * это весь каталог за один заход — и лента пошла бы по второму кругу
     * сразу же. Больше восьмой части витрины за страницу не берём.
     */
    const pool = Math.max(PAGE * 3, Math.min(POOL, Math.floor(all.length / 12)));

    /** Отбор подряд с места остановки: что набрали и докуда дошли. */
    const collect = (list: Product[], from: number, strict: boolean) => {
      const found: Product[] = [];
      let i = from;
      for (; i < list.length && found.length < pool; i++) {
        const p = list[i];
        if (banned.has(p.id)) continue;
        if (strict && !passes(p, filters)) continue;
        found.push(p);
      }
      return { found, next: i };
    };

    /**
     * Порядок карточек фиксирован на круг: он зависит только от снапшота и
     * зерна сессии.
     *
     * Раньше витрина сортировалась по вкусу целиком, а страница вырезалась из
     * неё по смещению. Но вкус меняется с каждым свайпом, и список под
     * смещением уезжал: часть карточек приезжала по второму разу, часть
     * пропускалась навсегда. Клиент повторы отбрасывал, страница приходила
     * пустой, и человек смотрел на «подбираем следующие карточки» столько,
     * сколько нужно было запросов, чтобы случайно набрать непоказанное.
     *
     * Теперь смещение идёт по неизменному порядку, а вкус решает только то,
     * какие карточки из очередного окна показать первыми.
     */
    // Круг текущий, а если он пройден до конца — следующий: каталог конечен,
    // а лента не должна заканчиваться. Суффикс круга не даёт идентификаторам
    // совпасть с уже показанными.
    for (let r = round, from = offset, pass = 0; pass < 2; pass++, r += 1, from = 0) {
      const ordered = shuffle(all, seed + r * 104729);
      let { found, next } = collect(ordered, from, true);
      // Под фильтры не подошло ничего: показываем витрину целиком, а не
      // пустой экран. С поиском так делать нельзя — там это была бы подмена
      // выдачи, — а фильтры человек видит и может снять.
      if (!found.length) ({ found, next } = collect(ordered, from, false));
      if (!found.length) continue;

      const rnd = mulberry32(seed + r * 104729 + from);
      const picked = hint ? pick(found, hint, rnd) : found.slice(0, PAGE);

      const products = r > 0 ? picked.map((p) => ({ ...p, id: `${p.id}-r${r}` })) : picked;
      return { products, cursor: encodeCursor(next, r), looped: r !== round };
    }

    // Сюда попадаем, только если исключено вообще всё, что есть в каталоге.
    return { products: [], cursor: encodeCursor(0, round), looped: false };
  },
};
