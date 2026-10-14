import { readFile, statfs } from "node:fs/promises";
import { dirname, join } from "node:path";
import { catalogInfo, catalogProducts } from "../catalog";
import { readEvents, type StatEvent } from "./events";

/**
 * Сводка по журналу событий.
 *
 * Одно место на все цифры: по нему рисуется страница в приложении и печатает
 * отчёт консольная команда. Два счётчика, считающие одно и то же по-разному,
 * хуже одного — спорить с собственной статистикой занятие безнадёжное.
 *
 * Всё считается в памяти за один проход по событиям: даже сотня тысяч свайпов
 * в сутки — это десяток мегабайт текста, и ради них городить базу данных
 * незачем.
 */

export type Slice = { label: string; n: number; share?: number };

export type Report = {
  from: string;
  to: string;
  days: number;
  people: {
    devices: number;
    newDevices: number;
    sessions: number;
    perDay: { day: string; devices: number; sessions: number; swipes: number; shops: number }[];
  };
  swipes: {
    total: number;
    like: number;
    cart: number;
    dislike: number;
    likeRate: number;
    perSession: number;
    undoPer100: number;
    byDepth: { range: string; n: number; likeRate: number }[];
    sessionDepth: { median: number; p90: number; bounced: number };
  };
  funnel: { label: string; n: number; share: number }[];
  money: {
    shops: number;
    shopsPer100Swipes: number;
    byScreen: Slice[];
    orders: number;
    revenue: number;
    commission: number;
    conversion: number;
    per1000Swipes: number;
  };
  retention: { d1: number; d7: number; d30: number; base: number };
  quality: {
    tasteShare: number;
    tasteLikeRate: number;
    exploreLikeRate: number;
    topCategories: { label: string; n: number; likeRate: number }[];
    topTags: { label: string; n: number; likeRate: number }[];
    quizWith: { devices: number; likeRate: number };
    quizWithout: { devices: number; likeRate: number };
    reasons: Slice[];
  };
  search: {
    queries: number;
    sessionsWith: number;
    empty: number;
    loose: number;
    exhausted: number;
    top: { label: string; n: number; found: number }[];
  };
  filters: { sessionsWith: number; groups: Slice[]; sheet: number };
  social: { shares: number; itemViews: number; giftViews: number; saves: Slice[] };
  health: {
    feed: { n: number; p50: number; p95: number; errors: number };
    waits: { n: number; p95: number; retried: number };
    catalog: {
      total: number;
      generatedAt: string | null;
      ageHours: number | null;
      images: number;
      ungrouped: number;
      groups: number;
      budgetUsed: number | null;
    };
    system: { rssMb: number; freeGb: number | null; uptimeHours: number };
  };
};

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

function quantile(values: number[], q: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * q)));
  return Math.round(sorted[i]);
}

/** Доля «хочу» и «в корзину» среди свайпов: главный показатель попадания. */
function likeRateOf(bag: { like: number; total: number }): number {
  return pct(bag.like, bag.total);
}

const DEPTHS: { range: string; from: number; to: number }[] = [
  { range: "1–20", from: 0, to: 20 },
  { range: "21–50", from: 20, to: 50 },
  { range: "51–100", from: 50, to: 100 },
  { range: "101–300", from: 100, to: 300 },
  { range: "301+", from: 300, to: Number.POSITIVE_INFINITY },
];

async function budgetUsed(): Promise<number | null> {
  const auth = process.env.AUTH_FILE?.trim();
  const path = join(auth ? dirname(auth) : ".data", "ae-budget.json");
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as { day?: string; used?: number };
    const today = new Date().toISOString().slice(0, 10);
    return parsed.day === today ? num(parsed.used) : 0;
  } catch {
    return null;
  }
}

async function freeGb(): Promise<number | null> {
  try {
    const fs = await statfs(process.cwd());
    return Math.round(((fs.bavail * fs.bsize) / 1024 ** 3) * 10) / 10;
  } catch {
    return null;
  }
}

export async function buildReport(days = 7): Promise<Report> {
  /*
   * Для удержания нужна история длиннее отчёта: чтобы узнать, вернулся ли
   * человек на седьмой день, нужны и его первый день, и седьмой. Поэтому
   * события читаем с запасом, а считаем по ним две разные вещи.
   */
  const events = await readEvents(Math.max(days, 31));
  const edge = new Date(Date.now() - days * 86_400_000).toISOString();
  const window = events.filter((e) => e.at >= edge);

  const dayOf = (e: StatEvent) => e.at.slice(0, 10);

  // ——— люди и дни
  const devices = new Set<string>();
  const sessions = new Set<string>();
  const firstDay = new Map<string, string>();
  const deviceDays = new Map<string, Set<string>>();
  for (const e of events) {
    const device = str(e.device);
    if (!device) continue;
    const day = dayOf(e);
    if (!firstDay.has(device) || day < (firstDay.get(device) as string)) firstDay.set(device, day);
    if (!deviceDays.has(device)) deviceDays.set(device, new Set());
    deviceDays.get(device)?.add(day);
  }
  const perDay = new Map<string, { devices: Set<string>; sessions: Set<string>; swipes: number; shops: number }>();
  const dayBag = (day: string) => {
    if (!perDay.has(day)) perDay.set(day, { devices: new Set(), sessions: new Set(), swipes: 0, shops: 0 });
    return perDay.get(day) as { devices: Set<string>; sessions: Set<string>; swipes: number; shops: number };
  };

  // ——— свайпы
  let like = 0;
  let cart = 0;
  let dislike = 0;
  let undo = 0;
  const depth = DEPTHS.map((d) => ({ ...d, n: 0, like: 0 }));
  const sessionSwipes = new Map<string, number>();
  const byCategory = new Map<string, { n: number; like: number }>();
  const byTag = new Map<string, { n: number; like: number }>();
  const taste = { total: 0, like: 0 };
  const explore = { total: 0, like: 0 };
  const deviceSwipes = new Map<string, { total: number; like: number }>();

  // ——— воронка, деньги, поиск, фильтры, социальное, здоровье
  const opens = { total: 0, first: 0, standalone: 0 };
  const onboarded = new Set<string>();
  const quizDone = new Set<string>();
  const quizSkipped = new Set<string>();
  const swiped = new Set<string>();
  const swipedTen = new Set<string>();
  const shops = { total: 0, byScreen: new Map<string, number>() };
  const orders = { n: 0, revenue: 0, commission: 0 };
  const reasons = new Map<string, number>();
  const search = { queries: 0, empty: 0, loose: 0, exhausted: 0, top: new Map<string, { n: number; found: number }>() };
  const searchSessions = new Set<string>();
  const filterSessions = new Set<string>();
  const filterGroups = new Map<string, number>();
  let sheetFilters = 0;
  const social = { shares: 0, itemViews: 0, giftViews: 0, saves: new Map<string, number>() };
  const feedMs: number[] = [];
  let feedErrors = 0;
  const waitMs: number[] = [];
  let waitRetried = 0;

  for (const e of window) {
    const device = str(e.device);
    const session = str(e.session);
    const day = dayOf(e);
    if (device) {
      devices.add(device);
      dayBag(day).devices.add(device);
    }
    if (session) {
      sessions.add(session);
      dayBag(day).sessions.add(session);
    }

    switch (e.type) {
      case "open": {
        opens.total += 1;
        if (e.first === true) opens.first += 1;
        if (e.standalone === true) opens.standalone += 1;
        if (device && e.onboarded === true) onboarded.add(device);
        break;
      }
      case "onboard": {
        if (device) onboarded.add(device);
        break;
      }
      case "quiz": {
        if (!device) break;
        if (e.skipped === true) quizSkipped.add(device);
        else quizDone.add(device);
        break;
      }
      case "swipe": {
        dayBag(day).swipes += 1;
        const decision = str(e.d);
        const good = decision === "like" || decision === "super";
        if (decision === "like") like += 1;
        else if (decision === "super") cart += 1;
        else dislike += 1;

        const n = num(e.n);
        const bucket = depth.find((d) => n >= d.from && n < d.to);
        if (bucket) {
          bucket.n += 1;
          if (good) bucket.like += 1;
        }
        if (session) sessionSwipes.set(session, (sessionSwipes.get(session) ?? 0) + 1);
        if (device) {
          swiped.add(device);
          const bag = deviceSwipes.get(device) ?? { total: 0, like: 0 };
          bag.total += 1;
          if (good) bag.like += 1;
          deviceSwipes.set(device, bag);
          if (bag.total >= 10) swipedTen.add(device);
        }
        const category = str(e.category);
        if (category) {
          const bag = byCategory.get(category) ?? { n: 0, like: 0 };
          bag.n += 1;
          if (good) bag.like += 1;
          byCategory.set(category, bag);
        }
        for (const tag of Array.isArray(e.tags) ? (e.tags as unknown[]) : []) {
          const key = str(tag);
          if (!key) continue;
          const bag = byTag.get(key) ?? { n: 0, like: 0 };
          bag.n += 1;
          if (good) bag.like += 1;
          byTag.set(key, bag);
        }
        const why = str(e.why);
        if (why === "taste") {
          taste.total += 1;
          if (good) taste.like += 1;
        } else if (why === "explore") {
          explore.total += 1;
          if (good) explore.like += 1;
        }
        break;
      }
      case "undo":
        undo += 1;
        break;
      case "reason": {
        const reason = str(e.reason);
        if (reason) reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
        break;
      }
      case "shop": {
        shops.total += 1;
        dayBag(day).shops += 1;
        const from = str(e.from) ?? "unknown";
        shops.byScreen.set(from, (shops.byScreen.get(from) ?? 0) + 1);
        break;
      }
      case "order": {
        const status = (str(e.status) ?? "").toLowerCase();
        // Отменённые заказы в выручку не берём: деньги по ним не придут.
        if (status.includes("cancel") || status.includes("отмен")) break;
        orders.n += 1;
        orders.revenue += num(e.price);
        orders.commission += num(e.commission);
        break;
      }
      case "search": {
        search.queries += 1;
        if (session) searchSessions.add(session);
        const found = num(e.found);
        if (!found) search.empty += 1;
        if (e.loose === true) search.loose += 1;
        if (e.noMore === true) search.exhausted += 1;
        const q = str(e.q)?.toLowerCase();
        if (q) {
          const bag = search.top.get(q) ?? { n: 0, found: 0 };
          bag.n += 1;
          bag.found = Math.max(bag.found, found);
          search.top.set(q, bag);
        }
        break;
      }
      case "filter": {
        if (session) filterSessions.add(session);
        if (str(e.what) === "sheet") sheetFilters += 1;
        const group = str(e.group);
        if (group) filterGroups.set(group, (filterGroups.get(group) ?? 0) + 1);
        break;
      }
      case "save": {
        const key = `${str(e.kind) ?? "?"}:${str(e.action) ?? "?"}`;
        social.saves.set(key, (social.saves.get(key) ?? 0) + 1);
        break;
      }
      case "share":
        social.shares += 1;
        break;
      case "view": {
        if (str(e.kind) === "gift") social.giftViews += 1;
        else social.itemViews += 1;
        break;
      }
      case "wait": {
        waitMs.push(num(e.ms));
        if (num(e.tries) > 1) waitRetried += 1;
        break;
      }
      case "feed": {
        if (e.error === true) feedErrors += 1;
        else feedMs.push(num(e.ms));
        break;
      }
    }
  }

  const swipes = like + cart + dislike;
  const good = like + cart;

  // ——— удержание: смотрим только на устройства, у которых есть и «потом»
  const retention = (gap: number) => {
    let base = 0;
    let back = 0;
    const horizon = new Date(Date.now() - gap * 86_400_000).toISOString().slice(0, 10);
    for (const [device, first] of firstDay) {
      // Если с первого дня ещё не прошло `gap` суток, судить рано.
      if (first > horizon) continue;
      base += 1;
      const target = new Date(new Date(`${first}T00:00:00Z`).getTime() + gap * 86_400_000)
        .toISOString()
        .slice(0, 10);
      const seen = deviceDays.get(device);
      // Вернулся в этот день или позже — считаем вернувшимся.
      if (seen && [...seen].some((d) => d >= target)) back += 1;
    }
    return { base, share: pct(back, base) };
  };
  const d1 = retention(1);
  const d7 = retention(7);
  const d30 = retention(30);

  // ——— эффект теста вкусов: первые полсотни карточек у ответивших и у пропустивших
  const firstFifty = (group: Set<string>) => {
    let total = 0;
    let liked = 0;
    for (const device of group) {
      const bag = deviceSwipes.get(device);
      if (!bag) continue;
      total += Math.min(50, bag.total);
      liked += Math.round((bag.like / Math.max(1, bag.total)) * Math.min(50, bag.total));
    }
    return { devices: group.size, likeRate: pct(liked, total) };
  };

  const info = catalogInfo();
  const products = catalogProducts();
  const images = products.filter((p) => p.images?.[0]?.startsWith("/media/")).length;
  const ungrouped = products.filter((p) => !p.group).length;
  const groups = new Set(products.map((p) => p.group).filter(Boolean)).size;
  const ageHours = info.generatedAt
    ? Math.round(((Date.now() - new Date(info.generatedAt).getTime()) / 3_600_000) * 10) / 10
    : null;

  const funnel = [
    { label: "Открыли приложение", n: devices.size },
    { label: "Прошли знакомство", n: onboarded.size },
    { label: "Ответили на тест", n: quizDone.size },
    { label: "Пропустили тест", n: quizSkipped.size },
    { label: "Сделали первый свайп", n: swiped.size },
    { label: "Досвайпали до десяти", n: swipedTen.size },
  ].map((row) => ({ ...row, share: pct(row.n, devices.size) }));

  const sorted = (map: Map<string, { n: number; like: number }>, min: number) =>
    [...map.entries()]
      .filter(([, bag]) => bag.n >= min)
      .sort((a, b) => b[1].n - a[1].n)
      .slice(0, 12)
      .map(([label, bag]) => ({ label, n: bag.n, likeRate: likeRateOf({ like: bag.like, total: bag.n }) }));

  const slices = (map: Map<string, number>, whole: number) =>
    [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([label, n]) => ({ label, n, share: pct(n, whole) }));

  const depths = [...sessionSwipes.values()];

  return {
    from: window[0]?.at.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    to: new Date().toISOString().slice(0, 10),
    days,
    people: {
      devices: devices.size,
      newDevices: opens.first,
      sessions: sessions.size,
      perDay: [...perDay.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([day, bag]) => ({
          day,
          devices: bag.devices.size,
          sessions: bag.sessions.size,
          swipes: bag.swipes,
          shops: bag.shops,
        })),
    },
    swipes: {
      total: swipes,
      like,
      cart,
      dislike,
      likeRate: pct(good, swipes),
      perSession: sessions.size ? Math.round((swipes / sessions.size) * 10) / 10 : 0,
      undoPer100: swipes ? Math.round((undo / swipes) * 1000) / 10 : 0,
      byDepth: depth.map((d) => ({ range: d.range, n: d.n, likeRate: pct(d.like, d.n) })),
      sessionDepth: {
        median: quantile(depths, 0.5),
        p90: quantile(depths, 0.9),
        bounced: pct(depths.filter((n) => n < 5).length, depths.length),
      },
    },
    funnel,
    money: {
      shops: shops.total,
      shopsPer100Swipes: swipes ? Math.round((shops.total / swipes) * 1000) / 10 : 0,
      byScreen: slices(shops.byScreen, shops.total),
      orders: orders.n,
      revenue: Math.round(orders.revenue),
      commission: Math.round(orders.commission),
      conversion: pct(orders.n, shops.total),
      per1000Swipes: swipes ? Math.round((orders.commission / swipes) * 1000) : 0,
    },
    retention: { d1: d1.share, d7: d7.share, d30: d30.share, base: d1.base },
    quality: {
      tasteShare: pct(taste.total, taste.total + explore.total),
      tasteLikeRate: pct(taste.like, taste.total),
      exploreLikeRate: pct(explore.like, explore.total),
      topCategories: sorted(byCategory, 5),
      topTags: sorted(byTag, 5),
      quizWith: firstFifty(quizDone),
      quizWithout: firstFifty(quizSkipped),
      reasons: slices(reasons, [...reasons.values()].reduce((a, b) => a + b, 0)),
    },
    search: {
      queries: search.queries,
      sessionsWith: pct(searchSessions.size, sessions.size),
      empty: pct(search.empty, search.queries),
      loose: pct(search.loose, search.queries),
      exhausted: pct(search.exhausted, search.queries),
      top: [...search.top.entries()]
        .sort((a, b) => b[1].n - a[1].n)
        .slice(0, 20)
        .map(([label, bag]) => ({ label, n: bag.n, found: bag.found })),
    },
    filters: {
      sessionsWith: pct(filterSessions.size, sessions.size),
      groups: slices(filterGroups, [...filterGroups.values()].reduce((a, b) => a + b, 0)),
      sheet: sheetFilters,
    },
    social: {
      shares: social.shares,
      itemViews: social.itemViews,
      giftViews: social.giftViews,
      saves: slices(social.saves, [...social.saves.values()].reduce((a, b) => a + b, 0)),
    },
    health: {
      feed: { n: feedMs.length, p50: quantile(feedMs, 0.5), p95: quantile(feedMs, 0.95), errors: feedErrors },
      waits: { n: waitMs.length, p95: quantile(waitMs, 0.95), retried: waitRetried },
      catalog: {
        total: info.total,
        generatedAt: info.generatedAt,
        ageHours,
        images: pct(images, products.length),
        ungrouped: pct(ungrouped, products.length),
        groups,
        budgetUsed: await budgetUsed(),
      },
      system: {
        rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        freeGb: await freeGb(),
        uptimeHours: Math.round((process.uptime() / 3600) * 10) / 10,
      },
    },
  };
}
