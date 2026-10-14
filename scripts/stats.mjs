#!/usr/bin/env node
/**
 * Сводка по метрикам в консоли.
 *
 * Считает не сам: спрашивает у работающего приложения (`/api/stats`) — иначе
 * пришлось бы держать две реализации одних и тех же цифр, которые рано или
 * поздно разойдутся и начнут спорить друг с другом.
 *
 *   npm run stats                      # за неделю
 *   npm run stats -- --days 30
 *   npm run stats -- --json            # сырой JSON, чтобы сложить куда-нибудь
 *   npm run stats -- --prune 90        # удалить журналы старше 90 суток
 *
 * Ключ берётся из METRICS_KEY (в окружении или в ENV_FILE). Если приложение
 * открыто по адресу, отличному от localhost, задайте APP_URL.
 */
import { readdirSync, readFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).flatMap((a, i, all) =>
    a.startsWith("--") ? [[a.slice(2), all[i + 1]?.startsWith("--") === false ? all[i + 1] : true]] : [],
  ),
);

/** Переменные окружения из файла — тот же приём, что у импортёра. */
function env() {
  const out = { ...process.env };
  for (const file of [process.env.ENV_FILE, ".env.local", ".env"].filter(Boolean)) {
    try {
      for (const line of readFileSync(file, "utf8").split("\n")) {
        const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
        if (m && !out[m[1]]) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    } catch {
      // Файла нет — не беда.
    }
  }
  return out;
}

const E = env();
const DAYS = Number(args.days ?? 7);
const BASE = String(args.url || E.APP_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");

const nf = new Intl.NumberFormat("ru-RU");
const pad = (s, n) => String(s).padEnd(n, " ");
const left = (s, n) => String(s).padStart(n, " ");

function statsDir() {
  if (E.STATS_DIR) return E.STATS_DIR;
  return E.AUTH_FILE ? join(dirname(E.AUTH_FILE), "events") : ".data/events";
}

/** Уборка: журнал старше `keep` суток удаляется целыми днями. */
function prune(keep) {
  const edge = new Date(Date.now() - keep * 86_400_000).toISOString().slice(0, 10);
  const dir = statsDir();
  let gone = 0;
  let files = [];
  try {
    files = readdirSync(dir);
  } catch {
    console.log(`Журналов нет: ${dir}`);
    return;
  }
  for (const file of files) {
    if (!/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(file)) continue;
    if (file.slice(0, 10) >= edge) continue;
    unlinkSync(join(dir, file));
    gone += 1;
  }
  console.log(`Удалено журналов старше ${keep} суток: ${gone} (${dir})`);
}

function table(title, rows) {
  if (!rows.length) return;
  console.log("");
  console.log(title.toUpperCase());
  for (const [label, value, note] of rows) {
    console.log(`  ${pad(label, 34)} ${left(value, 10)}${note ? `   ${note}` : ""}`);
  }
}

async function main() {
  if (args.prune) {
    prune(Number(args.prune === true ? 90 : args.prune));
    return;
  }

  const url = `${BASE}/api/stats?days=${DAYS}${E.METRICS_KEY ? `&key=${encodeURIComponent(E.METRICS_KEY)}` : ""}`;
  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    console.error(`Приложение не ответило (${BASE}): ${e instanceof Error ? e.message : e}`);
    console.error("Запущена ли служба? Адрес можно задать: --url http://127.0.0.1:3000");
    process.exitCode = 1;
    return;
  }

  if (res.status === 404) {
    console.error("Статистика не отдана: нужен METRICS_KEY в окружении (или ENV_FILE с ним).");
    process.exitCode = 1;
    return;
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error(body.error || `Ошибка ${res.status}`);
    process.exitCode = 1;
    return;
  }

  const r = await res.json();
  if (args.json) {
    console.log(JSON.stringify(r, null, 2));
    return;
  }

  console.log(`СВАЙПЕР — СВОДКА ЗА ${r.days} дн. (${r.from} — ${r.to})`);

  table("Люди", [
    ["Устройств", nf.format(r.people.devices), `новых ${nf.format(r.people.newDevices)}`],
    ["Сессий", nf.format(r.people.sessions), `${r.swipes.perSession} свайпа на сессию`],
    ["Свайпов", nf.format(r.swipes.total), `«хочу» ${r.swipes.likeRate}%`],
    ["  из них в корзину", nf.format(r.swipes.cart), ""],
    ["Отмен на 100 свайпов", String(r.swipes.undoPer100), ""],
    ["Глубина сессии (медиана)", nf.format(r.swipes.sessionDepth.median), `до пяти карточек ушло ${r.swipes.sessionDepth.bounced}%`],
  ]);

  table(
    "Учится ли лента (доля «хочу» по глубине)",
    r.swipes.byDepth.map((d) => [`Карточки ${d.range}`, `${d.likeRate}%`, `${nf.format(d.n)} свайпов`]),
  );

  table("Вкус против разведки", [
    ["Выбрал вкус", `${r.quality.tasteLikeRate}%`, `${r.quality.tasteShare}% ленты`],
    ["Разведка", `${r.quality.exploreLikeRate}%`, ""],
    ["Тест пройден", `${r.quality.quizWith.likeRate}%`, `${r.quality.quizWith.devices} чел.`],
    ["Тест пропущен", `${r.quality.quizWithout.likeRate}%`, `${r.quality.quizWithout.devices} чел.`],
  ]);

  table(
    "Воронка первого запуска",
    r.funnel.map((f) => [f.label, nf.format(f.n), `${f.share}%`]),
  );

  table("Деньги", [
    ["Переходов в магазин", nf.format(r.money.shops), `${r.money.shopsPer100Swipes} на 100 свайпов`],
    ...r.money.byScreen.map((s) => [`  из «${s.label}»`, nf.format(s.n), `${s.share}%`]),
    ["Заказов", nf.format(r.money.orders), `конверсия ${r.money.conversion}%`],
    ["Выручка", `${nf.format(r.money.revenue)} ₽`, ""],
    ["Комиссия", `${nf.format(r.money.commission)} ₽`, `${nf.format(r.money.per1000Swipes)} ₽ на 1000 свайпов`],
  ]);

  table("Возвращаются", [
    ["На следующий день", `${r.retention.d1}%`, `из ${r.retention.base} устройств`],
    ["Через неделю", `${r.retention.d7}%`, ""],
    ["Через месяц", `${r.retention.d30}%`, ""],
  ]);

  table(
    "Категории",
    r.quality.topCategories.map((c) => [c.label, `${c.likeRate}%`, `${nf.format(c.n)} свайпов`]),
  );
  table(
    "Метки",
    r.quality.topTags.map((t) => [t.label, `${t.likeRate}%`, `${nf.format(t.n)} свайпов`]),
  );
  table(
    "Причины отказов",
    r.quality.reasons.map((s) => [s.label, nf.format(s.n), `${s.share}%`]),
  );

  table("Поиск", [
    ["Запросов", nf.format(r.search.queries), `${r.search.sessionsWith}% сессий`],
    ["Ничего не нашлось", `${r.search.empty}%`, ""],
    ["По части слов", `${r.search.loose}%`, ""],
    ["Досмотрели всё", `${r.search.exhausted}%`, ""],
  ]);
  table(
    "Что искали",
    r.search.top.map((q) => [q.label, nf.format(q.n), q.found ? `нашлось ${nf.format(q.found)}` : "пусто"]),
  );

  table("Фильтры", [
    ["Сессий с фильтром", `${r.filters.sessionsWith}%`, ""],
    ["Применений из шторки", nf.format(r.filters.sheet), ""],
    ...r.filters.groups.map((s) => [`  раздел «${s.label}»`, nf.format(s.n), `${s.share}%`]),
  ]);

  table("Делятся и сохраняют", [
    ["Нажали «поделиться»", nf.format(r.social.shares), ""],
    ["Открыли карточку по ссылке", nf.format(r.social.itemViews), ""],
    ["Открыли чужой вишлист", nf.format(r.social.giftViews), ""],
    ...r.social.saves.map((s) => [`  ${s.label}`, nf.format(s.n), `${s.share}%`]),
  ]);

  table("Здоровье", [
    ["Лента, медиана", `${r.health.feed.p50} мс`, `${nf.format(r.health.feed.n)} страниц`],
    ["Лента, 95-й процентиль", `${r.health.feed.p95} мс`, ""],
    ["Ошибок ленты", nf.format(r.health.feed.errors), ""],
    ["Долгих ожиданий", nf.format(r.health.waits.n), `с повтором ${nf.format(r.health.waits.retried)}`],
    ["Каталог", nf.format(r.health.catalog.total), `${r.health.catalog.groups} разделов`],
    ["Со своими картинками", `${r.health.catalog.images}%`, ""],
    ["Без раздела", `${r.health.catalog.ungrouped}%`, ""],
    ["Снапшот обновлён", r.health.catalog.ageHours === null ? "—" : `${r.health.catalog.ageHours} ч назад`, ""],
    ["Запросов к площадке сегодня", r.health.catalog.budgetUsed === null ? "—" : nf.format(r.health.catalog.budgetUsed), ""],
    ["Память приложения", `${nf.format(r.health.system.rssMb)} МБ`, ""],
    ["Свободно на диске", r.health.system.freeGb === null ? "—" : `${r.health.system.freeGb} ГБ`, ""],
  ]);

  table(
    "По дням",
    r.people.perDay.map((d) => [d.day, `${nf.format(d.devices)} чел.`, `${nf.format(d.swipes)} свайпов · ${nf.format(d.shops)} переходов`]),
  );

  console.log("");
}

main();
