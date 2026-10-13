#!/usr/bin/env node
/**
 * Пересборка категорий по названиям товаров.
 *
 * Сейчас категория достаётся товару от фида, в котором он лежал: платье из
 * фида «Дом и сад» так и подписано «Дом и сад». Этот скрипт смотрит на само
 * название и предлагает категорию по нему.
 *
 * По умолчанию ничего не меняет — только показывает, что получилось бы:
 *
 *   node scripts/retag-categories.mjs --file /var/lib/swiper/catalog.json --limit 1000
 *
 * С флагом --apply переписывает снапшот (и только те карточки, которые
 * попали в --limit, если он задан).
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { categoryByTitle } from "./ae-taxonomy.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).flatMap((a, i, all) =>
    a.startsWith("--") ? [[a.slice(2), all[i + 1]?.startsWith("--") === false ? all[i + 1] : true]] : [],
  ),
);

const FILE = String(args.file || process.env.CATALOG_FILE || "data/catalog.json");
const LIMIT = Number(args.limit ?? Infinity);
const APPLY = !!args.apply;
/** Сколько примеров показать на каждую новую категорию. */
const SAMPLES = Number(args.samples ?? 2);

const pad = (s, n) => String(s).padEnd(n, " ");

function main() {
  const file = JSON.parse(readFileSync(FILE, "utf8"));
  const all = file.products ?? [];
  if (!all.length) {
    console.error(`В снапшоте ${FILE} нет товаров.`);
    process.exitCode = 1;
    return;
  }

  /*
   * Берём не первую тысячу, а равномерно по всему каталогу: карточки лежат в
   * порядке обхода, и первая тысяча — это почти наверняка одна категория,
   * по которой ничего не поймёшь.
   */
  const stride = Number.isFinite(LIMIT) && all.length > LIMIT ? Math.floor(all.length / LIMIT) : 1;
  const products = stride > 1 ? all.filter((_, i) => i % stride === 0).slice(0, LIMIT) : all;
  console.log(
    `Смотрим ${products.length} карточек из ${all.length}` +
      (stride > 1 ? `, каждую ${stride}-ю — чтобы выборка была по всему каталогу` : "") +
      ` (${FILE})`,
  );
  console.log("");

  const counts = new Map();
  const examples = new Map();
  const moved = new Map();
  let kept = 0;
  let changed = 0;

  for (const p of products) {
    const next = categoryByTitle(p.title);
    if (!next) {
      kept += 1;
      counts.set(`${p.category ?? "без категории"} (как было)`, (counts.get(`${p.category ?? "без категории"} (как было)`) ?? 0) + 1);
      continue;
    }
    changed += next === p.category ? 0 : 1;
    counts.set(next, (counts.get(next) ?? 0) + 1);
    if (!examples.has(next)) examples.set(next, []);
    const bag = examples.get(next);
    if (bag.length < SAMPLES) bag.push(`${p.category ?? "—"} → ${p.title.slice(0, 64)}`);
    const pair = `${p.category ?? "—"} → ${next}`;
    moved.set(pair, (moved.get(pair) ?? 0) + 1);
    if (APPLY) p.category = next;
  }

  console.log("ЧТО ПОЛУЧИЛОСЬ");
  for (const [category, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${pad(n, 6)} ${category}`);
    for (const line of examples.get(category) ?? []) console.log(`         ${line}`);
  }

  console.log("");
  console.log("САМЫЕ ЧАСТЫЕ ПЕРЕЕЗДЫ");
  for (const [pair, n] of [...moved.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    console.log(`  ${pad(n, 6)} ${pair}`);
  }

  const matched = products.length - kept;
  console.log("");
  console.log(
    `Итог: по названию определилось ${matched} из ${products.length} (${Math.round((matched / products.length) * 100)}%), ` +
      `сменили категорию ${changed}, осталось как было ${kept}.`,
  );

  if (!APPLY) {
    console.log("");
    console.log("Это предварительный просмотр. Чтобы переписать снапшот, добавьте --apply");
    return;
  }

  file.categories = [...new Set((file.products ?? []).map((p) => p.category).filter(Boolean))];
  mkdirSync(dirname(FILE), { recursive: true });
  const tmp = `${FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(file));
  renameSync(tmp, FILE);
  console.log(`Снапшот переписан: ${FILE}`);
}

main();
