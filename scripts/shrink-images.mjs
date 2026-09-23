/**
 * Уменьшение картинок в уже собранном снапшоте.
 *
 * Импортёр какое-то время сохранял ссылки на полноразмерные фотографии Etsy —
 * по несколько сотен килобайт на карточку там, где хватает 570 точек. Заново
 * выкачивать каталог ради этого расточительно: у ссылок Etsy размер закодирован
 * в самом пути, и его можно подменить.
 *
 * Подмена опирается на форму адреса, а не на документированное поле, поэтому
 * скрипт сначала проверяет несколько получившихся ссылок на живом сервере и
 * отказывается работать, если хоть одна не отвечает. Лучше оставить как есть,
 * чем разом обезобразить весь каталог.
 *
 *   node scripts/shrink-images.mjs --file /var/lib/swiper/catalog.json
 *   node scripts/shrink-images.mjs --file ... --dry            только показать
 */
import { readFileSync, renameSync, writeFileSync } from "node:fs";

const args = Object.fromEntries(
  process.argv.slice(2).flatMap((a, i, all) =>
    a.startsWith("--") ? [[a.slice(2), all[i + 1]?.startsWith("--") === false ? all[i + 1] : true]] : [],
  ),
);

const FILE = String(args.file || process.env.CATALOG_FILE || "data/catalog.json");
const DRY = !!args.dry;
const SAMPLES = Number(args.samples ?? 5);

/** В пути Etsy размер записан сегментом il_fullxfull — его и меняем. */
const shrink = (url) => url.replace(/\/il_fullxfull\./, "/il_570xN.");

async function reachable(url) {
  try {
    const res = await fetch(url, { method: "GET", headers: { Range: "bytes=0-64" }, cache: "no-store" });
    return res.ok || res.status === 206;
  } catch {
    return false;
  }
}

async function main() {
  const file = JSON.parse(readFileSync(FILE, "utf8"));
  const products = file.products ?? [];

  const candidates = products.filter((p) => (p.images ?? []).some((u) => u !== shrink(u)));
  console.log(`Всего карточек: ${products.length}, с полноразмерными ссылками: ${candidates.length}`);
  if (!candidates.length) {
    console.log("Менять нечего.");
    return;
  }

  // Проверка на образцах: если подмена не работает, каталог останется целым.
  const step = Math.max(1, Math.floor(candidates.length / SAMPLES));
  const probes = [];
  for (let i = 0; i < candidates.length && probes.length < SAMPLES; i += step) {
    const original = candidates[i].images.find((u) => u !== shrink(u));
    if (original) probes.push(shrink(original));
  }

  console.log(`Проверяю ${probes.length} получившихся ссылок…`);
  const results = await Promise.all(probes.map(reachable));
  const bad = results.filter((ok) => !ok).length;
  results.forEach((ok, i) => console.log(`  ${ok ? "✓" : "✗"} ${probes[i]}`));

  if (bad) {
    console.error(`\nНе отвечают ${bad} из ${probes.length}. Подмена ненадёжна — ничего не меняю.`);
    console.error("Картинки обновятся сами при следующем импорте: новые карточки уже сохраняются в нужном размере.");
    process.exitCode = 1;
    return;
  }

  let changed = 0;
  for (const p of products) {
    const before = p.images ?? [];
    const after = before.map(shrink);
    if (after.some((u, i) => u !== before[i])) changed += 1;
    p.images = after;
  }

  if (DRY) {
    console.log(`\nВсё проверенное отвечает. Изменилось бы карточек: ${changed}. Запуск без --dry применит правку.`);
    return;
  }

  // Через временный файл: приложение читает снапшот на лету.
  const tmp = `${FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(file));
  renameSync(tmp, FILE);
  console.log(`\nГотово: поправлено карточек ${changed}. Приложение подхватит само.`);
}

main().catch((e) => {
  console.error("Не удалось:", e.message || e);
  process.exitCode = 1;
});
