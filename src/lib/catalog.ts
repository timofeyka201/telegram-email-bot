import { readFileSync, statSync } from "node:fs";
import bundled from "../../data/catalog.json";
import type { Product } from "./types";

export type CatalogFile = {
  version: number;
  kind: string;
  generatedAt?: string;
  categories?: string[];
  products: Product[];
};

/**
 * Снапшот каталога.
 *
 * Раньше файл импортировался статически и запекался в сборку: обновить каталог
 * можно было только пересборкой и выкладкой. При живом API с дневным лимитом
 * запросов это неудобно вдвойне — импортёр должен работать по расписанию и
 * обновлять витрину, ничего не пересобирая.
 *
 * Поэтому снапшот читается с диска, а файл в репозитории остаётся запасным:
 * пока импортёр не отработал ни разу, приложение показывает то, что приехало
 * вместе с кодом.
 */
const BUNDLED = bundled as unknown as CatalogFile;

/** Где лежит снапшот. На сервере — рядом с данными, а не внутри кода. */
export function catalogPath(): string | null {
  const configured = process.env.CATALOG_FILE?.trim();
  if (configured) return configured;
  // Тот же каталог, что и у учётных записей: он вне выкладки и переживает её.
  const auth = process.env.AUTH_FILE?.trim();
  if (auth) return auth.replace(/[^/]+$/, "catalog.json");
  return null;
}

type Loaded = { file: CatalogFile; source: "snapshot" | "bundled"; mtimeMs: number };
let cache: Loaded | null = null;

/**
 * Перечитываем, когда файл на диске изменился. Импортёр пишет его атомарно
 * (во временный файл и переименованием), поэтому полуфайл сюда не попадёт, а
 * приложению не нужен перезапуск, чтобы увидеть свежий каталог.
 */
function load(): Loaded {
  const path = catalogPath();
  if (!path) {
    if (!cache || cache.source !== "bundled") cache = { file: BUNDLED, source: "bundled", mtimeMs: 0 };
    return cache;
  }

  let mtimeMs = 0;
  try {
    mtimeMs = statSync(path).mtimeMs;
  } catch {
    // Снапшота ещё нет — показываем то, что приехало с кодом.
    if (!cache || cache.source !== "bundled") cache = { file: BUNDLED, source: "bundled", mtimeMs: 0 };
    return cache;
  }

  if (cache && cache.source === "snapshot" && cache.mtimeMs === mtimeMs) return cache;

  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as CatalogFile;
    if (!Array.isArray(parsed.products) || !parsed.products.length) throw new Error("пустой снапшот");
    cache = { file: parsed, source: "snapshot", mtimeMs };
  } catch (e) {
    // Битый снапшот не должен ронять витрину: остаёмся на запасном каталоге.
    console.error("Каталог: снапшот не прочитан —", e instanceof Error ? e.message : e);
    cache = { file: BUNDLED, source: "bundled", mtimeMs };
  }
  return cache;
}

export function catalogProducts(): Product[] {
  const { file } = load();
  return Array.isArray(file.products) ? file.products : [];
}

export function catalogInfo(): { kind: string; generatedAt: string | null; total: number; source: string; path: string | null } {
  const { file, source } = load();
  return {
    kind: file.kind ?? "unknown",
    generatedAt: file.generatedAt ?? null,
    total: catalogProducts().length,
    source,
    path: catalogPath(),
  };
}

export function catalogCategories(): string[] {
  const { file } = load();
  if (file.categories?.length) return file.categories;
  return [...new Set(catalogProducts().map((p) => p.category).filter(Boolean) as string[])];
}
