#!/usr/bin/env node
/**
 * Чистка каталога по границам витрины (`scripts/ae-scope.mjs`).
 *
 * Оставляет одежду, аксессуары и «для дома» с кухней, остальное выбрасывает.
 * Карточки, которым раздел не достался, по умолчанию остаются: запросы на них
 * потрачены, картинки скачаны, и среди них есть настоящая одежда, просто
 * неопознанная. Выбросить их тоже можно — `--drop-unknown`.
 *
 * По умолчанию ничего не меняет, только показывает, что осталось бы:
 *
 *   node scripts/keep-groups.mjs --file /var/lib/swiper/catalog.json
 *
 * С `--apply` переписывает снапшот, положив рядом резервную копию `.bak`
 * (прежняя копия затирается — она одна, последняя).
 *
 * Картинки удалённых карточек остаются на диске: их убирает отдельный
 * `npm run catalog:prune -- --file … --delete`.
 */
import { copyFileSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { inScope, scopeLines } from "./ae-scope.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).flatMap((a, i, all) =>
    a.startsWith("--") ? [[a.slice(2), all[i + 1]?.startsWith("--") === false ? all[i + 1] : true]] : [],
  ),
);

const FILE = String(args.file || process.env.CATALOG_FILE || "data/catalog.json");
const APPLY = !!args.apply;
const KEEP_UNKNOWN = !args["drop-unknown"];

const pad = (s, n) => String(s).padEnd(n, " ");
const share = (n, total) => `${Math.round((n / Math.max(1, total)) * 100)}%`;

function main() {
  const file = JSON.parse(readFileSync(FILE, "utf8"));
  const all = file.products ?? [];
  if (!all.length) {
    console.error(`В снапшоте ${FILE} нет товаров.`);
    process.exitCode = 1;
    return;
  }

  console.log(`Каталог: ${all.length} карточек (${FILE})`);
  console.log("");
  console.log("ОСТАВЛЯЕМ");
  for (const line of scopeLines()) console.log(`  ${line}`);
  console.log(`  Без раздела (название не опознано) — ${KEEP_UNKNOWN ? "оставляем" : "удаляем"}`);
  console.log("");

  const keep = [];
  const dropped = new Map();
  const kept = new Map();
  for (const p of all) {
    const where = p.group ?? "без раздела";
    if (inScope(p, { keepUnknown: KEEP_UNKNOWN })) {
      keep.push(p);
      kept.set(where, (kept.get(where) ?? 0) + 1);
    } else {
      dropped.set(where, (dropped.get(where) ?? 0) + 1);
    }
  }

  console.log("ЧТО ОСТАНЕТСЯ");
  for (const [group, n] of [...kept.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${pad(n, 8)} ${group}`);
  }
  console.log("");
  console.log("ЧТО УДАЛИТСЯ");
  for (const [group, n] of [...dropped.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${pad(n, 8)} ${group}`);
  }

  console.log("");
  console.log(
    `Итог: остаётся ${keep.length} из ${all.length} (${share(keep.length, all.length)}), ` +
      `удаляется ${all.length - keep.length} (${share(all.length - keep.length, all.length)}).`,
  );

  if (!APPLY) {
    console.log("");
    console.log("Это предварительный просмотр. Чтобы переписать снапшот, добавьте --apply");
    return;
  }

  if (!keep.length) {
    console.error("Остаётся ноль карточек — отказываюсь переписывать снапшот.");
    process.exitCode = 1;
    return;
  }

  // Резервная копия до того, как что-то трогаем: откатиться одной командой.
  copyFileSync(FILE, `${FILE}.bak`);

  file.products = keep;
  file.categories = [...new Set(keep.map((p) => p.category).filter(Boolean))];
  file.groups = [...new Set(keep.map((p) => p.group).filter(Boolean))];
  file.tags = [...new Set(keep.flatMap((p) => p.tags ?? []))].sort();

  mkdirSync(dirname(FILE), { recursive: true });
  const tmp = `${FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(file));
  renameSync(tmp, FILE);
  console.log("");
  console.log(`Снапшот переписан: ${FILE}`);
  console.log(`Резервная копия:   ${FILE}.bak`);
  console.log("Картинки удалённых карточек всё ещё на диске — их уберёт catalog:prune с --delete.");
}

main();
