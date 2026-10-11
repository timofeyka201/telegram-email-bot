#!/usr/bin/env node
/**
 * Починка обрезанных названий категорий в готовом снапшоте.
 *
 * Прежний импортёр резал название вслепую по 28 символам, и на кнопках
 * фильтра оказывались «Телефоны и телекоммуникацион» и «Пряди для
 * наращивания и пари». Сами по себе они не исправятся: название лежит в
 * каждой карточке, а переобходить ради этого сто пятьдесят тысяч товаров —
 * значит потратить дневной бюджет впустую.
 *
 * Скрипт спрашивает у площадки настоящие названия фидов и категорий (это
 * десяток-другой запросов), сопоставляет их с обрезками в снапшоте и
 * переписывает. Товары при этом не трогаются ничем, кроме подписи.
 *
 *   ENV_FILE=/home/swiper/.env.production \
 *     node scripts/fix-categories.mjs --file /var/lib/swiper/catalog.json
 *
 * Без --apply только показывает, что изменится.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { call, env, spent } from "./ae-api.mjs";
import { legacyShortCategory, shortCategory } from "./ae-category.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).flatMap((a, i, all) =>
    a.startsWith("--") ? [[a.slice(2), all[i + 1]?.startsWith("--") === false ? all[i + 1] : true]] : [],
  ),
);

const FILE = String(args.file || env.CATALOG_FILE || "data/catalog.json");
const APPLY = !!args.apply;

const pick = (o, ...keys) => {
  for (const key of keys) {
    const value = key.split(".").reduce((v, k) => v?.[k], o);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
};

async function feedTitles() {
  const titles = [];
  let page = 0;
  // Список фидов короткий, но отдаётся страницами по тридцать.
  for (; page <= 20; page++) {
    const query = { limit: 30 };
    if (page > 0) query.page = page;
    const data = await call("/api/v1/productsfeeds/feeds", { query });
    const rows = data?.data ?? data?.feeds ?? [];
    if (!rows.length) break;
    for (const f of rows) {
      const id = String(pick(f, "id", "feedId", "attributes.id") ?? "");
      const title = String(pick(f, "title", "name", "attributes.title", "attributes.name") ?? "");
      if (id && title) titles.push({ id, title });
    }
    const total = Number(pick(data, "meta.total", "total") ?? 0);
    if (total && titles.length >= total) break;
  }
  return titles;
}

async function categoryTitles(feedId) {
  try {
    const data = await call("/api/v1/productsfeeds/categories", { query: { productFeedId: feedId } });
    const rows = data?.data ?? data?.categories ?? [];
    return rows.map((c) => String(pick(c, "title", "name", "attributes.title") ?? "")).filter(Boolean);
  } catch (e) {
    console.error(`Категории фида ${feedId} не получены: ${e.message}`);
    return [];
  }
}

async function main() {
  const file = JSON.parse(readFileSync(FILE, "utf8"));
  const products = file.products ?? [];
  if (!products.length) {
    console.error(`В снапшоте ${FILE} нет товаров.`);
    process.exitCode = 1;
    return;
  }

  const feeds = await feedTitles();
  console.log(`Фидов: ${feeds.length}`);
  const full = new Set(feeds.map((f) => f.title));
  for (const feed of feeds) for (const title of await categoryTitles(feed.id)) full.add(title);
  console.log(`Названий всего: ${full.size}, запросов потрачено: ${spent.calls}`);

  /** Обрезок прежнего импортёра → целое название. */
  const rename = new Map();
  for (const title of full) {
    const was = legacyShortCategory(title);
    const now = shortCategory(title);
    if (was && now && was !== now) rename.set(was, now);
  }

  const counts = new Map();
  for (const p of products) {
    const next = p.category ? rename.get(p.category) : undefined;
    if (!next) continue;
    counts.set(`${p.category} → ${next}`, (counts.get(`${p.category} → ${next}`) ?? 0) + 1);
    if (APPLY) p.category = next;
  }

  if (!counts.size) {
    console.log("Обрезанных названий не нашлось — чинить нечего.");
    return;
  }
  for (const [pair, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${n}\t${pair}`);

  if (!APPLY) {
    console.log("");
    console.log("Это предварительный просмотр. Чтобы переписать снапшот, добавьте --apply");
    return;
  }

  file.categories = [...new Set(products.map((p) => p.category).filter(Boolean))];
  mkdirSync(dirname(FILE), { recursive: true });
  const tmp = `${FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(file));
  renameSync(tmp, FILE);
  console.log(`Готово: переписано карточек ${[...counts.values()].reduce((a, b) => a + b, 0)}, снапшот ${FILE}`);
}

main().catch((e) => {
  console.error("Не получилось:", e.message);
  process.exitCode = 1;
});
