#!/usr/bin/env node
/**
 * Пересборка категорий по названиям товаров.
 *
 * Сейчас категория достаётся товару от фида, в котором он лежал: платье из
 * фида «Дом и сад» так и подписано «Дом и сад». Этот скрипт смотрит на само
 * название и предлагает категорию по нему — и раздел, в который эта
 * категория входит: «Купальники» попадают в «Женскую одежду», футболка с
 * «мужская» в названии — в «Мужскую».
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
import { tagsByTitle } from "./ae-tags.mjs";

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

  /** Метки: сколько карточек получили каждую. */
  const tagCounts = new Map();
  let tagged = 0;
  let tagTotal = 0;

  /** Раздел → категория → сколько карточек. */
  const tree = new Map();
  const examples = new Map();
  const kept = new Map();
  const moved = new Map();
  let keptTotal = 0;
  let changed = 0;

  for (const p of products) {
    const tags = tagsByTitle(p.title);
    if (tags.length) tagged += 1;
    tagTotal += tags.length;
    for (const tag of tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    if (APPLY) p.tags = tags.length ? tags : undefined;

    const next = categoryByTitle(p.title);
    if (!next) {
      keptTotal += 1;
      const was = p.category ?? "без категории";
      kept.set(was, (kept.get(was) ?? 0) + 1);
      continue;
    }
    const { category, parent } = next;
    changed += category === p.category ? 0 : 1;
    if (!tree.has(parent)) tree.set(parent, new Map());
    const branch = tree.get(parent);
    branch.set(category, (branch.get(category) ?? 0) + 1);
    const key = `${parent}/${category}`;
    if (!examples.has(key)) examples.set(key, []);
    const bag = examples.get(key);
    if (bag.length < SAMPLES) bag.push(`${p.category ?? "—"} → ${p.title.slice(0, 64)}`);
    const pair = `${p.category ?? "—"} → ${parent} / ${category}`;
    moved.set(pair, (moved.get(pair) ?? 0) + 1);
    if (APPLY) {
      p.category = category;
      p.group = parent;
    }
  }

  const total = (branch) => [...branch.values()].reduce((a, b) => a + b, 0);

  console.log("ЧТО ПОЛУЧИЛОСЬ");
  for (const [parent, branch] of [...tree.entries()].sort((a, b) => total(b[1]) - total(a[1]))) {
    console.log("");
    console.log(`  ${pad(total(branch), 6)} ${parent.toUpperCase()}`);
    for (const [category, n] of [...branch.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`      ${pad(n, 6)} ${category}`);
      for (const line of examples.get(`${parent}/${category}`) ?? []) console.log(`               ${line}`);
    }
  }

  if (kept.size) {
    console.log("");
    console.log("ОСТАЛОСЬ КАК БЫЛО (название ни о чём не сказало)");
    for (const [category, n] of [...kept.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
      console.log(`  ${pad(n, 6)} ${category}`);
    }
  }

  console.log("");
  console.log("СКРЫТЫЕ МЕТКИ (их человек не видит, на них учится лента)");
  console.log(
    `  есть хотя бы одна у ${tagged} из ${products.length} (${Math.round((tagged / products.length) * 100)}%), ` +
      `в среднем ${(tagTotal / products.length).toFixed(1)} на карточку`,
  );
  // По группам — чтобы было видно, какие правила не срабатывают вовсе.
  const byGroup = new Map();
  for (const [tag, n] of tagCounts) {
    const group = tag.split(":")[0];
    byGroup.set(group, (byGroup.get(group) ?? 0) + n);
  }
  for (const [group, n] of [...byGroup.entries()].sort((a, b) => b[1] - a[1])) {
    const top = [...tagCounts.entries()]
      .filter(([tag]) => tag.startsWith(`${group}:`))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([tag, k]) => `${tag.split(":")[1]} ${k}`)
      .join(", ");
    console.log(`  ${pad(n, 6)} ${pad(group, 10)} ${top}`);
  }

  console.log("");
  console.log("САМЫЕ ЧАСТЫЕ ПЕРЕЕЗДЫ");
  for (const [pair, n] of [...moved.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    console.log(`  ${pad(n, 6)} ${pair}`);
  }

  const matched = products.length - keptTotal;
  console.log("");
  console.log(
    `Итог: по названию определилось ${matched} из ${products.length} (${Math.round((matched / products.length) * 100)}%), ` +
      `сменили категорию ${changed}, осталось как было ${keptTotal}.`,
  );

  if (!APPLY) {
    console.log("");
    console.log("Это предварительный просмотр. Чтобы переписать снапшот, добавьте --apply");
    return;
  }

  file.categories = [...new Set((file.products ?? []).map((p) => p.category).filter(Boolean))];
  file.tags = [...new Set((file.products ?? []).flatMap((p) => p.tags ?? []))].sort();
  file.groups = [...new Set((file.products ?? []).map((p) => p.group).filter(Boolean))];
  mkdirSync(dirname(FILE), { recursive: true });
  const tmp = `${FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(file));
  renameSync(tmp, FILE);
  console.log(`Снапшот переписан: ${FILE}`);
}

main();
