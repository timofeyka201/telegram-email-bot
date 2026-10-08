import { mkdir, readFile, rename, writeFile, appendFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { aeConfigured, aeFetch, aeUserId } from "./client";

/**
 * Партнёрские ссылки AliExpress.
 *
 * Платформа превращает обычную ссылку на товар в «креатив» — ссылку с меткой,
 * по которой засчитывается комиссия, и с токеном erid для маркировки рекламы.
 * Создавать креативы на весь каталог бессмысленно: это десятки тысяч запросов
 * ради товаров, которые никто не откроет. Поэтому ссылка создаётся в момент
 * первого перехода и кладётся в кэш навсегда — товар на AliExpress живёт по
 * одному адресу, и метка к нему не меняется.
 */

export type Creative = { target: string; erid?: string; createdAt: number };

function storePath(name: string): string {
  const auth = process.env.AUTH_FILE?.trim();
  const dir = auth ? dirname(auth) : ".data";
  return join(dir, name);
}

const CACHE = () => storePath("ae-creatives.json");
/** Журнал переходов: та самая метрика «переходы в магазин». */
const CLICKS = () => storePath("ae-clicks.log");

let memo: Record<string, Creative> | null = null;
/** Один запрос на товар: десять одновременных переходов не должны создавать
 *  десять креативов. */
const inFlight = new Map<string, Promise<Creative | null>>();

async function readCache(): Promise<Record<string, Creative>> {
  if (memo) return memo;
  try {
    memo = JSON.parse(await readFile(CACHE(), "utf8")) as Record<string, Creative>;
  } catch {
    memo = {};
  }
  return memo;
}

async function saveCache(): Promise<void> {
  if (!memo) return;
  const path = CACHE();
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(memo));
  await rename(tmp, path);
}

/** Запись о переходе. Пишем строкой в файл: разбирать её будем потом, а
 *  потерять переход из-за недоступной базы нельзя. */
export async function noteClick(productId: string, outcome: "affiliate" | "direct"): Promise<void> {
  const line = JSON.stringify({ at: new Date().toISOString(), productId, outcome });
  try {
    const path = CLICKS();
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, line + "\n");
  } catch (e) {
    console.error("Переход не записан:", e instanceof Error ? e.message : e);
  }
}

type CreativeResponse = { targetLink?: string; eridToken?: string; article?: string };

/**
 * Партнёрская ссылка на товар. Возвращает null, если платформа не настроена
 * или отказала: в этом случае человека отправляем на обычную ссылку товара —
 * потерять комиссию неприятно, не пустить человека в магазин недопустимо.
 */
export async function affiliateLink(productId: string, url: string, title: string): Promise<Creative | null> {
  const cache = await readCache();
  const hit = cache[productId];
  if (hit) return hit;

  const userId = aeUserId();
  const placementId = process.env.AE_PLACEMENT_ID?.trim();
  if (!aeConfigured() || !userId || !placementId) return null;

  const pending = inFlight.get(productId);
  if (pending) return pending;

  const task = (async () => {
    try {
      const res = await aeFetch<CreativeResponse>(`/api/v1/users/${userId}/creative`, {
        method: "POST",
        body: {
          link: url,
          // Название попадает и в кабинет, и в данные для ОРД: пусть будет
          // человеческим, а не «товар №12345».
          title: title.slice(0, 120) || "Товар",
          placementId: Number(placementId),
          ordInfo: { description: title.slice(0, 200) || "Товар" },
          creationConditions: { createLinks: true, createArticles: false },
        },
      });
      if (!res.targetLink) return null;
      const creative: Creative = { target: res.targetLink, erid: res.eridToken, createdAt: Date.now() };
      (await readCache())[productId] = creative;
      await saveCache();
      return creative;
    } catch (e) {
      console.error("Партнёрская ссылка не создана:", e instanceof Error ? e.message : e);
      return null;
    } finally {
      inFlight.delete(productId);
    }
  })();

  inFlight.set(productId, task);
  return task;
}
