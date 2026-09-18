#!/usr/bin/env node
/**
 * Чистка уже собранной базы: убирает карточки-заготовки и заглушки вместо фото.
 * Сети не требует — работает по файлу.
 *
 *   node scripts/clean-catalog.mjs             # почистить data/catalog.json
 *   node scripts/clean-catalog.mjs --dry       # только показать, что удалится
 */
import { readFileSync, writeFileSync } from "node:fs";
import { keepReal, productLooksReal } from "./quality.mjs";

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, "").split("=");
  return [k, v ?? true];
}));
const FILE = String(args.file || "data/catalog.json");
const DRY = args.dry === true;

const data = JSON.parse(readFileSync(FILE, "utf8"));
const before = data.products.length;
const dropped = data.products.filter((p) => !productLooksReal(p));
const kept = keepReal(data.products);

console.log(`было: ${before}, останется: ${kept.length}, удаляем: ${dropped.length}\n`);
if (dropped.length) {
  console.log("примеры удаляемых:");
  for (const p of dropped.slice(0, 8)) {
    console.log(`  · ${String(p.title).slice(0, 44)} — ${(p.images?.[0] || "без фото").slice(0, 46)}`);
  }
}

if (DRY) {
  console.log("\n--dry: файл не изменён");
} else {
  data.products = kept;
  data.categories = [...new Set(kept.map((p) => p.category).filter(Boolean))];
  data.cleanedAt = new Date().toISOString().slice(0, 10);
  writeFileSync(FILE, JSON.stringify(data));
  console.log(`\nготово: ${FILE} — ${kept.length} карточек, ${data.categories.length} категорий`);
}
