#!/usr/bin/env node
/**
 * Уборка в каталоге картинок.
 *
 * После смены источника товаров на диске остаются снимки прежней витрины: их
 * никто уже не показывает, а место они занимают — у каталога на десятки тысяч
 * карточек это гигабайты. Скрипт сверяет файлы с текущим снапшотом и удаляет
 * то, на что больше нет ссылок.
 *
 * По умолчанию только показывает, что собирается удалить: стирать чужие файлы
 * без спроса нельзя.
 *
 *   node scripts/prune-images.mjs --file /var/lib/swiper/catalog.json
 *   node scripts/prune-images.mjs --file /var/lib/swiper/catalog.json --delete
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, unlinkSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).flatMap((a, i, all) =>
    a.startsWith("--") ? [[a.slice(2), all[i + 1]?.startsWith("--") === false ? all[i + 1] : true]] : [],
  ),
);

const FILE = String(args.file || process.env.CATALOG_FILE || "data/catalog.json");
const DIR = String(args.dir || process.env.IMAGE_DIR || join(dirname(FILE), "images"));
const DELETE = !!args.delete;

/** Имя файла — хэш адреса: та же формула, что у загрузчика картинок. */
const nameFor = (url) => `${createHash("sha256").update(url).digest("hex").slice(0, 32)}.webp`;

const mb = (n) => (n / 1024 / 1024).toFixed(1);

function main() {
  if (!existsSync(FILE)) {
    console.error(`Снапшота нет: ${FILE}. Без него непонятно, какие картинки нужны, — выходим.`);
    process.exitCode = 1;
    return;
  }
  if (!existsSync(DIR)) {
    console.error(`Каталога картинок нет: ${DIR}`);
    process.exitCode = 1;
    return;
  }

  const file = JSON.parse(readFileSync(FILE, "utf8"));
  const products = file.products ?? [];

  // Нужными считаем и перенесённые к себе снимки (/media/…), и те, что ещё
  // лежат внешними адресами: они могут переехать при следующем прогоне.
  const keep = new Set();
  for (const p of products) {
    for (const u of p.images ?? []) {
      const local = /^\/media\/([a-f0-9]{32}\.webp)$/.exec(u);
      if (local) keep.add(local[1]);
      else if (/^https?:\/\//.test(u)) keep.add(nameFor(u));
    }
  }
  // Превью лежат рядом и живут вместе со своим снимком.
  for (const name of [...keep]) keep.add(name.replace(/\.webp$/, "-t.webp"));

  const files = readdirSync(DIR).filter((f) => f.endsWith(".webp"));
  const extra = files.filter((f) => !keep.has(f));

  let bytes = 0;
  for (const f of extra) {
    try {
      bytes += statSync(join(DIR, f)).size;
    } catch {
      // файл исчез между чтением списка и проверкой — не беда
    }
  }

  console.log(`Снапшот: карточек ${products.length}, нужных файлов ${keep.size}`);
  console.log(`На диске: ${files.length} файлов, лишних ${extra.length} на ${mb(bytes)} МБ`);
  for (const f of extra.slice(0, 5)) console.log(`  например ${f}`);

  if (!extra.length) return;
  if (!DELETE) {
    console.log("");
    console.log("Это предварительный просмотр. Чтобы удалить, добавьте --delete");
    return;
  }

  let removed = 0;
  for (const f of extra) {
    try {
      unlinkSync(join(DIR, f));
      removed += 1;
    } catch (e) {
      console.error(`  не удалось удалить ${f}: ${e.message}`);
    }
  }

  // Манифест хранит соответствие имени файла исходному адресу: записи об
  // удалённых снимках в нём больше не нужны.
  const manifestPath = join(DIR, "manifest.json");
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const cleaned = Object.fromEntries(Object.entries(manifest).filter(([name]) => keep.has(name)));
    writeFileSync(manifestPath, JSON.stringify(cleaned));
    console.log(`Манифест: было ${Object.keys(manifest).length} записей, стало ${Object.keys(cleaned).length}`);
  } catch {
    // манифеста нет — и ладно
  }

  console.log(`Удалено ${removed} файлов, освобождено ${mb(bytes)} МБ`);
}

main();
