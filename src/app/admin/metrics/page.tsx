import Link from "next/link";
import { notFound } from "next/navigation";
import { buildReport, type Report, type Slice } from "@/lib/stats/aggregate";
import { metricsAccess } from "@/lib/stats/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = { title: "Метрики — Swiper", robots: { index: false, follow: false } };

/**
 * Страница метрик: то же, что печатает консольная команда, но с телефона.
 *
 * Собирается на сервере и отдаётся готовой разметкой — ни графиков на
 * библиотеках, ни запросов из браузера. Пользы от красивых диаграмм на
 * двух десятках событий никакой, а вот прочитать цифру в очереди за кофе
 * хочется.
 */

const nf = new Intl.NumberFormat("ru-RU");

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="soft-shadow rounded-2xl bg-[var(--color-surface)] p-4">
      <p className="text-[12px] font-bold uppercase tracking-wider text-[var(--color-muted)]">{label}</p>
      <p className="font-display mt-1 text-[26px] font-bold leading-none">{value}</p>
      {note && <p className="mt-1.5 text-[13px] leading-snug text-[var(--color-muted)]">{note}</p>}
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="font-display text-[19px] font-bold">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Rows({ rows }: { rows: { label: string; value: string; note?: string }[] }) {
  if (!rows.length) return <p className="text-[14px] text-[var(--color-muted)]">Пока пусто.</p>;
  return (
    <div className="soft-shadow overflow-hidden rounded-2xl bg-[var(--color-surface)]">
      {rows.map((row, i) => (
        <div
          key={row.label}
          className={`flex items-baseline justify-between gap-3 px-4 py-3 ${
            i ? "border-t border-[var(--color-line)]" : ""
          }`}
        >
          <span className="min-w-0 flex-1 truncate text-[14px]">{row.label}</span>
          <span className="tnum shrink-0 text-[15px] font-bold">{row.value}</span>
          {row.note && <span className="tnum shrink-0 text-[13px] text-[var(--color-muted)]">{row.note}</span>}
        </div>
      ))}
    </div>
  );
}

const slices = (list: Slice[]) =>
  list.map((s) => ({ label: s.label, value: nf.format(s.n), note: s.share !== undefined ? `${s.share}%` : undefined }));

export default async function MetricsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; key?: string }>;
}) {
  const { days: raw, key } = await searchParams;
  /*
   * Ключ в адресе — чтобы открыть метрики с телефона, не заводя вход. Он
   * остаётся в истории браузера, поэтому ссылкой лучше не делиться; у кого
   * есть вход и почта в METRICS_EMAILS, ключ не нужен вовсе.
   */
  const access = await metricsAccess(key);
  if (access === "denied") notFound();

  if (access === "unset") {
    return (
      <main className="mx-auto w-full max-w-[520px] px-4 py-8">
        <h1 className="font-display text-[24px] font-bold">Метрики не настроены</h1>
        <p className="mt-2 text-[15px] leading-snug text-[var(--color-muted)]">
          Добавьте в <code>/home/swiper/.env.production</code> строку <code>METRICS_EMAILS=ваша@почта</code> — и
          страница откроется для этого входа. Для консольной команды там же пригодится{" "}
          <code>METRICS_KEY=длинная-случайная-строка</code>. После правки файла перезапустите службу.
        </p>
      </main>
    );
  }

  const days = Math.min(120, Math.max(1, Number(raw ?? 7) || 7));
  const r: Report = await buildReport(days);

  return (
    <main className="mx-auto w-full max-w-[520px] px-4 pb-16 pt-6">
      <header className="flex items-baseline justify-between gap-3">
        <h1 className="font-display text-[24px] font-bold">Метрики</h1>
        <nav className="flex gap-2 text-[13px] font-semibold">
          {[1, 7, 30].map((d) => (
            <Link
              key={d}
              href={`/admin/metrics?days=${d}${key ? `&key=${encodeURIComponent(key)}` : ""}`}
              className={`rounded-full px-3 py-1.5 ${
                d === days ? "bg-[var(--color-ink)] text-[var(--color-surface)]" : "bg-[var(--color-surface)]"
              }`}
            >
              {d} дн.
            </Link>
          ))}
        </nav>
      </header>
      <p className="mt-1 text-[13px] text-[var(--color-muted)]">
        {r.from} — {r.to}
      </p>

      <div className="mt-5 grid grid-cols-2 gap-2.5">
        <Tile label="Устройств" value={nf.format(r.people.devices)} note={`${r.people.newDevices} новых`} />
        <Tile label="Сессий" value={nf.format(r.people.sessions)} note={`${r.swipes.perSession} свайпа на сессию`} />
        <Tile label="Свайпов" value={nf.format(r.swipes.total)} note={`${r.swipes.likeRate}% «хочу»`} />
        <Tile
          label="В магазин"
          value={nf.format(r.money.shops)}
          note={`${r.money.shopsPer100Swipes} на 100 свайпов`}
        />
        <Tile
          label="Заказов"
          value={nf.format(r.money.orders)}
          note={`конверсия ${r.money.conversion}% от переходов`}
        />
        <Tile
          label="Комиссия"
          value={`${nf.format(r.money.commission)} ₽`}
          note={`${nf.format(r.money.per1000Swipes)} ₽ на 1000 свайпов`}
        />
      </div>

      <Block title="Учится ли лента">
        <Rows
          rows={r.swipes.byDepth.map((d) => ({
            label: `Карточки ${d.range}`,
            value: `${d.likeRate}%`,
            note: nf.format(d.n),
          }))}
        />
        <p className="mt-2 text-[13px] leading-snug text-[var(--color-muted)]">
          Доля «хочу» по глубине ленты. Если справа больше, чем слева, — подстройка работает.
        </p>
      </Block>

      <Block title="Вкус против разведки">
        <Rows
          rows={[
            { label: "Выбрал вкус", value: `${r.quality.tasteLikeRate}%`, note: `${r.quality.tasteShare}% ленты` },
            { label: "Разведка", value: `${r.quality.exploreLikeRate}%` },
            {
              label: "Тест пройден",
              value: `${r.quality.quizWith.likeRate}%`,
              note: `${r.quality.quizWith.devices} чел.`,
            },
            {
              label: "Тест пропущен",
              value: `${r.quality.quizWithout.likeRate}%`,
              note: `${r.quality.quizWithout.devices} чел.`,
            },
          ]}
        />
      </Block>

      <Block title="Воронка первого запуска">
        <Rows rows={r.funnel.map((f) => ({ label: f.label, value: nf.format(f.n), note: `${f.share}%` }))} />
      </Block>

      <Block title="Возвращаются">
        <Rows
          rows={[
            { label: "На следующий день", value: `${r.retention.d1}%` },
            { label: "Через неделю", value: `${r.retention.d7}%` },
            { label: "Через месяц", value: `${r.retention.d30}%` },
            { label: "Глубина сессии, медиана", value: nf.format(r.swipes.sessionDepth.median) },
            { label: "Ушли раньше пяти карточек", value: `${r.swipes.sessionDepth.bounced}%` },
            { label: "Отмен на 100 свайпов", value: String(r.swipes.undoPer100) },
          ]}
        />
      </Block>

      <Block title="Категории">
        <Rows
          rows={r.quality.topCategories.map((c) => ({
            label: c.label,
            value: `${c.likeRate}%`,
            note: nf.format(c.n),
          }))}
        />
      </Block>

      <Block title="Метки">
        <Rows
          rows={r.quality.topTags.map((t) => ({ label: t.label, value: `${t.likeRate}%`, note: nf.format(t.n) }))}
        />
      </Block>

      <Block title="Причины отказов">
        <Rows rows={slices(r.quality.reasons)} />
      </Block>

      <Block title="Поиск">
        <Rows
          rows={[
            { label: "Запросов", value: nf.format(r.search.queries), note: `${r.search.sessionsWith}% сессий` },
            { label: "Ничего не нашлось", value: `${r.search.empty}%` },
            { label: "Нашлось по части слов", value: `${r.search.loose}%` },
            { label: "Досмотрели всё найденное", value: `${r.search.exhausted}%` },
          ]}
        />
        {r.search.top.length > 0 && (
          <div className="mt-3">
            <Rows
              rows={r.search.top.map((q) => ({
                label: q.label,
                value: nf.format(q.n),
                note: q.found ? `${nf.format(q.found)} шт.` : "пусто",
              }))}
            />
          </div>
        )}
      </Block>

      <Block title="Фильтры и переходы">
        <Rows
          rows={[
            { label: "Сессий с фильтром", value: `${r.filters.sessionsWith}%` },
            { label: "Применений из шторки", value: nf.format(r.filters.sheet) },
            ...slices(r.filters.groups).map((s) => ({ ...s, label: `Раздел «${s.label}»` })),
            ...slices(r.money.byScreen).map((s) => ({ ...s, label: `В магазин из «${s.label}»` })),
          ]}
        />
      </Block>

      <Block title="Делятся и сохраняют">
        <Rows
          rows={[
            { label: "Нажали «поделиться»", value: nf.format(r.social.shares) },
            { label: "Открыли карточку по ссылке", value: nf.format(r.social.itemViews) },
            { label: "Открыли чужой вишлист", value: nf.format(r.social.giftViews) },
            ...slices(r.social.saves),
          ]}
        />
      </Block>

      <Block title="Здоровье">
        <Rows
          rows={[
            { label: "Лента, медиана", value: `${r.health.feed.p50} мс`, note: `${nf.format(r.health.feed.n)} стр.` },
            { label: "Лента, 95-й процентиль", value: `${r.health.feed.p95} мс` },
            { label: "Ошибок ленты", value: nf.format(r.health.feed.errors) },
            {
              label: "Долгих ожиданий",
              value: nf.format(r.health.waits.n),
              note: `${r.health.waits.retried} с повтором`,
            },
            { label: "Каталог", value: nf.format(r.health.catalog.total), note: `${r.health.catalog.groups} разделов` },
            { label: "Со своими картинками", value: `${r.health.catalog.images}%` },
            { label: "Без раздела", value: `${r.health.catalog.ungrouped}%` },
            {
              label: "Снапшот обновлён",
              value: r.health.catalog.ageHours === null ? "—" : `${r.health.catalog.ageHours} ч назад`,
            },
            {
              label: "Запросов к площадке сегодня",
              value: r.health.catalog.budgetUsed === null ? "—" : nf.format(r.health.catalog.budgetUsed),
            },
            { label: "Память приложения", value: `${nf.format(r.health.system.rssMb)} МБ` },
            {
              label: "Свободно на диске",
              value: r.health.system.freeGb === null ? "—" : `${r.health.system.freeGb} ГБ`,
            },
            { label: "Служба работает", value: `${r.health.system.uptimeHours} ч` },
          ]}
        />
      </Block>

      <Block title="По дням">
        <Rows
          rows={r.people.perDay.map((d) => ({
            label: d.day,
            value: `${nf.format(d.devices)} чел.`,
            note: `${nf.format(d.swipes)} св. · ${nf.format(d.shops)} пер.`,
          }))}
        />
      </Block>

      <p className="mt-8 text-[13px] leading-snug text-[var(--color-muted)]">
        В журнале нет ни почты, ни адреса, ни браузера: только случайный идентификатор устройства, а у поисковых
        запросов нет и его. Сырые события хранятся 90 дней.
      </p>
    </main>
  );
}
