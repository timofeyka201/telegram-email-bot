/**
 * Перенос картинок каталога на свой сервер.
 *
 * Пока фотографии лежат на чужом CDN, их скорость нам не подконтрольна: для
 * пользователей из России зарубежный узел может отвечать медленно или не
 * отвечать вовсе. Скрипт скачивает их один раз, ужимает до размера карточки,
 * перекодирует в WebP и подменяет ссылки в снапшоте на свои.
 *
 * Рядом кладётся manifest.json — соответствие имени файла исходному адресу.
 * Без него после подмены ссылок восстановить потерянный файл было бы неоткуда.
 *
 *   node scripts/cache-images.mjs --file /var/lib/swiper/catalog.json
 *   node scripts/cache-images.mjs --file ... --limit 500
 */
import { createHash } from "node:crypto";
import { mkdirSync, existsSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).flatMap((a, i, all) =>
    a.startsWith("--") ? [[a.slice(2), all[i + 1]?.startsWith("--") === false ? all[i + 1] : true]] : [],
  ),
);

const FILE = String(args.file || process.env.CATALOG_FILE || "data/catalog.json");
const DIR = String(args.dir || process.env.IMAGE_DIR || join(dirname(FILE), "images"));
const MANIFEST = join(DIR, "manifest.json");
/** Ширина карточки на телефоне с запасом под плотные экраны. */
const WIDTH = Number(args.width ?? 640);
const QUALITY = Number(args.quality ?? 78);
/** Сколько картинок обработать за прогон: чтобы первый запуск не длился часами. */
const LIMIT = Number(args.limit ?? Infinity);
/** Качаем в несколько потоков, но без фанатизма — чужой CDN нам ничего не должен. */
const PARALLEL = Number(args.parallel ?? 6);

let sharp;
try {
  ({ default: sharp } = await import("sharp"));
} catch {
  console.error("Нужен sharp: npm i -D sharp");
  process.exit(1);
}

/** Имя файла — от адреса: один и тот же снимок не скачивается дважды. */
const nameFor = (url) => `${createHash("sha256").update(url).digest("hex").slice(0, 32)}.webp`;

const readManifest = () => {
  try {
    return JSON.parse(readFileSync(MANIFEST, "utf8"));
  } catch {
    return {};
  }
};

async function fetchAndConvert(url, target) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0", Referer: "" },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const input = Buffer.from(await res.arrayBuffer());
  if (input.length < 100) throw new Error("подозрительно маленький файл");

  const out = await sharp(input)
    // withoutEnlargement: маленький оригинал не растягиваем — только испортим.
    .resize({ width: WIDTH, withoutEnlargement: true })
    .webp({ quality: QUALITY })
    .toBuffer();

  // Через временный файл: сервер отдаёт эту папку и не должен встретить половину файла.
  const tmp = `${target}.tmp`;
  writeFileSync(tmp, out);
  renameSync(tmp, target);
  return { from: input.length, to: out.length };
}

async function main() {
  const file = JSON.parse(readFileSync(FILE, "utf8"));
  const products = file.products ?? [];
  mkdirSync(DIR, { recursive: true });
  const manifest = readManifest();

  // Собираем уникальные внешние адреса: одна картинка может встретиться у
  // нескольких карточек, качать её дважды незачем.
  const remote = new Set();
  for (const p of products) for (const u of p.images ?? []) if (/^https?:\/\//.test(u)) remote.add(u);

  const todo = [...remote].filter((u) => !existsSync(join(DIR, nameFor(u)))).slice(0, LIMIT);
  console.log(`Внешних картинок: ${remote.size}, уже скачано: ${remote.size - [...remote].filter((u) => !existsSync(join(DIR, nameFor(u)))).length}, к загрузке: ${todo.length}`);

  let done = 0;
  let failed = 0;
  let bytesIn = 0;
  let bytesOut = 0;

  // Простая очередь: несколько работников разбирают один список.
  const queue = [...todo];
  await Promise.all(
    Array.from({ length: Math.min(PARALLEL, queue.length) }, async () => {
      for (let url = queue.shift(); url; url = queue.shift()) {
        const name = nameFor(url);
        try {
          const { from, to } = await fetchAndConvert(url, join(DIR, name));
          manifest[name] = url;
          bytesIn += from;
          bytesOut += to;
          done += 1;
          if (done % 100 === 0) console.log(`  скачано ${done} из ${todo.length}`);
        } catch (e) {
          failed += 1;
          if (failed <= 5) console.log(`  не удалось ${url.slice(0, 70)}: ${e.message}`);
        }
      }
    }),
  );

  writeFileSync(MANIFEST, JSON.stringify(manifest));

  // Подменяем в снапшоте только то, что реально лежит на диске: карточка с
  // битой локальной ссылкой хуже карточки с медленной чужой.
  let rewritten = 0;
  for (const p of products) {
    p.images = (p.images ?? []).map((u) => {
      if (!/^https?:\/\//.test(u)) return u;
      const name = nameFor(u);
      if (!existsSync(join(DIR, name))) return u;
      rewritten += 1;
      return `/media/${name}`;
    });
  }

  const tmp = `${FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(file));
  renameSync(tmp, FILE);

  const mb = (n) => (n / 1024 / 1024).toFixed(1);
  console.log(
    `\nГотово: скачано ${done}, не удалось ${failed}, ссылок переписано ${rewritten}.\n` +
      (done ? `Вес: было ${mb(bytesIn)} МБ, стало ${mb(bytesOut)} МБ (${Math.round((1 - bytesOut / bytesIn) * 100)}% экономии).\n` : "") +
      `Папка: ${DIR}`,
  );
}

main().catch((e) => {
  console.error("Не удалось:", e.message || e);
  process.exitCode = 1;
});
