"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import AuthSheet from "@/components/AuthSheet";
import Img from "@/components/Img";
import ProductSheet from "@/components/ProductSheet";
import Sheet from "@/components/Sheet";
import WishCardForm from "@/components/WishCardForm";
import { IconBookmark, IconCheck, IconExternal, IconGear, IconSearch, IconShare, IconTrash } from "@/components/Icons";
import { toast } from "@/components/Toast";
import { useHydrated, useStore } from "@/lib/store";
import { formatNative, formatRub, needsConversion, plural } from "@/lib/money";
import { loadMyWishlist, loadReservations, removeItem, saveWishlistSettings } from "@/lib/wish/client";
import { formatCode, MAX_NOTE, MAX_TITLE, normalizeCode, type OwnerItem, type OwnerView, type ReservedEntry } from "@/lib/wish/types";
import type { Product } from "@/lib/types";

type Tab = "mine" | "gifts";

/**
 * Вишлист целиком: свой список, чужие списки по коду и памятка о том, что вы
 * уже кому-то пообещали. Всё в одном месте, потому что это одна история —
 * подарки, — и разносить её по трём экранам незачем.
 */
export default function WishlistPage() {
  const hydrated = useHydrated();
  const account = useStore((s) => s.account);
  const localWishlist = useStore((s) => s.wishlist);

  const [view, setView] = useState<OwnerView | null>(null);
  const [gifts, setGifts] = useState<ReservedEntry[]>([]);
  const [tab, setTab] = useState<Tab>("mine");
  const [loading, setLoading] = useState(true);
  const [authOpen, setAuthOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<OwnerItem | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sheet, setSheet] = useState<Product | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [mine, reserved] = await Promise.all([loadMyWishlist(), loadReservations()]);
    setView(mine);
    setGifts(reserved);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!account) {
      setLoading(false);
      return;
    }
    void refresh();
  }, [hydrated, account, refresh]);

  if (!hydrated) return <div className="flex-1" />;

  return (
    <div className="flex flex-1 flex-col">
      <header className="safe-top sticky top-0 z-30 min-w-0 border-b border-[var(--color-line)] bg-[var(--color-surface)]/92 backdrop-blur-md">
        <div className="flex items-baseline justify-between gap-3 px-4 pb-2 pt-3">
          <h1 className="truncate font-display text-[20px] font-bold">{view?.title ?? "Вишлист"}</h1>
          {account && view && (
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label="Настройки списка"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-2)] text-[var(--color-muted)]"
            >
              <IconGear className="h-4 w-4" />
            </button>
          )}
        </div>

        {account && (
          <div className="mx-4 mb-2 flex rounded-full bg-[var(--color-surface-2)] p-1">
            {(
              [
                ["mine", "Мой список", view?.items.length ?? 0],
                ["gifts", "Я дарю", gifts.length],
              ] as const
            ).map(([id, label, count]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                aria-pressed={tab === id}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-[13px] font-bold transition-colors ${
                  tab === id ? "bg-[var(--color-surface)] text-[var(--color-ink)] soft-shadow" : "text-[var(--color-muted)]"
                }`}
              >
                {label}
                {count > 0 && <span className="tnum opacity-60">{count}</span>}
              </button>
            ))}
          </div>
        )}
      </header>

      <div className="flex flex-1 flex-col gap-4 p-4 pb-28">
        {!account ? (
          <>
            <GuestBlock count={localWishlist.length} onLogin={() => setAuthOpen(true)} />
            <FindByCode />
          </>
        ) : loading ? (
          <p className="py-10 text-center text-[14px] text-[var(--color-muted)]">Загружаем…</p>
        ) : !view ? (
          <p className="rounded-3xl bg-[var(--color-surface)] p-5 text-center text-[14px] text-[var(--color-muted)]">
            Список не открылся. Проверьте связь и обновите страницу.
          </p>
        ) : tab === "mine" ? (
          <>
            <ShareBlock view={view} />

            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
              className="flex items-center justify-center gap-2 rounded-3xl border border-dashed border-[var(--color-line)] bg-[var(--color-surface)] py-4 text-[14px] font-bold text-[var(--color-brand)]"
            >
              + Добавить своё желание
            </button>

            {view.items.length === 0 ? (
              <EmptyMine />
            ) : (
              <div className="flex flex-col gap-3">
                <AnimatePresence initial={false}>
                  {view.items.map((item) => (
                    <MyItem
                      key={item.id}
                      item={item}
                      onOpen={() => item.product && setSheet(item.product)}
                      onEdit={() => {
                        setEditing(item);
                        setFormOpen(true);
                      }}
                      onRemove={async () => {
                        const next = await removeItem(item.id);
                        if (next) setView(next);
                        toast("Убрали из вишлиста");
                      }}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </>
        ) : (
          <Gifts entries={gifts} />
        )}

        {/* Поиск внизу: вошедший пришёл сюда за своим списком, а не за чужим. */}
        {account && <FindByCode />}
      </div>

      <WishCardForm
        open={formOpen}
        item={editing}
        onClose={() => setFormOpen(false)}
        onSaved={(next) => setView(next)}
      />
      {view && (
        <SettingsSheetInner
          open={settingsOpen}
          view={view}
          onClose={() => setSettingsOpen(false)}
          onSaved={(next) => setView(next)}
        />
      )}
      <ProductSheet product={sheet} onClose={() => setSheet(null)} />
      <AuthSheet open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
}

/** Поиск чужого списка по коду — то, ради чего код вообще короткий. */
function FindByCode() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const code = normalizeCode(value);
        if (!code) {
          setError("Код состоит из шести букв и цифр: SW-K7QM4X");
          return;
        }
        setError(null);
        router.push(`/wishlist/${code}`);
      }}
      className="soft-shadow rounded-3xl bg-[var(--color-surface)] p-4"
    >
      <p className="mb-2 text-[13px] font-bold">Открыть чужой вишлист</p>
      <p className="mb-2 text-[12px] leading-snug text-[var(--color-muted)]">Введите код друга или вставьте ссылку на его список.</p>
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          placeholder="SW-K7QM4X"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          className="w-full min-w-0 rounded-2xl border border-[var(--color-line)] bg-[var(--color-bg)] px-3.5 py-2.5 text-[15px] uppercase outline-none placeholder:normal-case focus:border-[var(--color-brand)]"
        />
        <button
          type="submit"
          aria-label="Найти"
          className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-2xl bg-[var(--color-brand)] text-white"
        >
          <IconSearch className="h-5 w-5" />
        </button>
      </div>
      {error && <p className="mt-2 text-[12px] font-medium text-[var(--color-nope)]">{error}</p>}
    </form>
  );
}

/** Код и ссылка. Делиться должно быть в одно нажатие — иначе не поделятся. */
function ShareBlock({ view }: { view: OwnerView }) {
  const [copied, setCopied] = useState(false);
  const link = typeof window === "undefined" ? "" : `${window.location.origin}/wishlist/${view.code}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast("Скопируйте ссылку вручную");
    }
  }

  async function share() {
    if (!navigator.share) return copy();
    try {
      await navigator.share({ title: view.title, text: "Мой вишлист в Swiper", url: link });
    } catch {
      /* передумали — это не ошибка */
    }
  }

  return (
    <div className="soft-shadow rounded-3xl bg-[var(--color-surface)] p-4">
      <p className="text-[13px] font-bold">Код списка</p>
      <p className="tnum mt-1 font-display text-[26px] font-bold tracking-[0.12em] text-[var(--color-brand)]">
        {formatCode(view.code)}
      </p>
      <p className="mt-1 text-[12px] leading-snug text-[var(--color-muted)]">
        {view.shared
          ? "Продиктуйте код или отправьте ссылку. Брони друзей вам не видны — сюрприз останется сюрпризом."
          : "Доступ по ссылке выключен: сейчас список никто, кроме вас, не откроет."}
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={share}
          className="brand-gradient flex flex-1 items-center justify-center gap-2 rounded-2xl py-2.5 text-[14px] font-bold text-white"
        >
          <IconShare className="h-4 w-4" />
          Поделиться
        </button>
        <button
          type="button"
          onClick={copy}
          className="flex shrink-0 items-center gap-1.5 rounded-2xl bg-[var(--color-surface-2)] px-4 py-2.5 text-[14px] font-bold text-[var(--color-ink-soft)]"
        >
          {copied ? <IconCheck className="h-4 w-4" /> : null}
          {copied ? "Скопировано" : "Копировать"}
        </button>
      </div>
    </div>
  );
}

function MyItem({
  item,
  onOpen,
  onEdit,
  onRemove,
}: {
  item: OwnerItem;
  onOpen: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const rates = useStore((s) => s.rates);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
      className="soft-shadow flex gap-3 overflow-hidden rounded-3xl bg-[var(--color-surface)] p-3"
    >
      <button
        type="button"
        onClick={item.product ? onOpen : undefined}
        className="h-[92px] w-[92px] shrink-0 overflow-hidden rounded-2xl"
        aria-label={item.product ? "Открыть карточку" : undefined}
      >
        <Img src={item.image} alt={item.title} className="h-full w-full" fallbackLabel={item.title.slice(0, 24)} />
      </button>

      <div className="flex min-w-0 flex-1 flex-col">
        <p className="line-clamp-2 text-[14px] font-semibold leading-tight">{item.title}</p>
        {item.price !== undefined && (
          <p className="tnum mt-1 font-display text-[16px] font-bold leading-none">
            {formatRub(item.price, item.currency, rates)}
            {needsConversion(item.currency) && (
              <span className="ml-1.5 text-[12px] font-medium text-[var(--color-muted)]">
                {formatNative(item.price, item.currency)}
              </span>
            )}
          </p>
        )}
        {item.note && (
          <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-[var(--color-muted)]">{item.note}</p>
        )}

        <div className="mt-auto flex items-center gap-1.5 pt-2">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-xl bg-[var(--color-surface-2)] px-3 py-1.5 text-[12px] font-bold text-[var(--color-ink-soft)]"
          >
            {item.note ? "Изменить" : "Добавить пожелание"}
          </button>
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer noopener"
              aria-label="Открыть в магазине"
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--color-surface-2)] text-[var(--color-muted)]"
            >
              <IconExternal className="h-4 w-4" />
            </a>
          )}
          <button
            type="button"
            onClick={onRemove}
            aria-label="Убрать из вишлиста"
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--color-surface-2)] text-[var(--color-muted)]"
          >
            <IconTrash className="h-4 w-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

/** Правка названия, подписи и доступа. */
function SettingsSheetInner({
  open,
  view,
  onClose,
  onSaved,
}: {
  open: boolean;
  view: OwnerView;
  onClose: () => void;
  onSaved: (next: OwnerView) => void;
}) {
  const [title, setTitle] = useState(view.title);
  const [note, setNote] = useState(view.note ?? "");
  const [shared, setShared] = useState(view.shared);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(view.title);
    setNote(view.note ?? "");
    setShared(view.shared);
  }, [open, view]);

  const field =
    "w-full rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] px-3.5 py-2.5 text-[15px] outline-none focus:border-[var(--color-brand)]";

  return (
    <Sheet
      open={open}
      title="Настройки списка"
      onClose={onClose}
      footer={
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const next = await saveWishlistSettings({ title, note, shared });
            setBusy(false);
            if (next) {
              onSaved(next);
              toast("Сохранили");
              onClose();
            } else toast("Не получилось сохранить");
          }}
          className="brand-gradient w-full rounded-2xl py-3.5 text-[15px] font-bold text-white disabled:opacity-60"
        >
          {busy ? "Сохраняем…" : "Сохранить"}
        </button>
      }
    >
      <div className="flex flex-col gap-3 pt-1">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-[var(--color-muted)]">Название</span>
          <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, MAX_TITLE))} className={field} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-[var(--color-muted)]">Подпись для гостей</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, MAX_NOTE))}
            rows={3}
            placeholder="«День рождения 14 марта, доставка до 10-го»"
            className={`${field} resize-none`}
          />
        </label>
        <button
          type="button"
          onClick={() => setShared(!shared)}
          className="flex items-center justify-between rounded-2xl bg-[var(--color-surface-2)] px-4 py-3 text-left"
        >
          <span className="min-w-0 pr-3">
            <span className="block text-[14px] font-bold">Доступ по ссылке</span>
            <span className="block text-[12px] leading-snug text-[var(--color-muted)]">
              Выключите, когда праздник прошёл: код перестанет открываться.
            </span>
          </span>
          <span
            aria-hidden
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
              shared ? "bg-[var(--color-brand)]" : "bg-[var(--color-line)]"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${shared ? "left-[22px]" : "left-0.5"}`}
            />
          </span>
        </button>
      </div>
    </Sheet>
  );
}

function Gifts({ entries }: { entries: ReservedEntry[] }) {
  const rates = useStore((s) => s.rates);
  if (!entries.length) {
    return (
      <div className="rounded-3xl bg-[var(--color-surface)] p-6 text-center">
        <h2 className="font-display text-[17px] font-bold">Пока ничего не забронировано</h2>
        <p className="mt-1.5 text-[13px] leading-snug text-[var(--color-muted)]">
          Откройте список друга по коду и отметьте подарок за собой — чтобы двое не подарили одно и то же.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {entries.map((entry) => (
        <div key={`${entry.code}:${entry.itemId}`} className="soft-shadow flex gap-3 rounded-3xl bg-[var(--color-surface)] p-3">
          <Img src={entry.image} alt={entry.title} className="h-[72px] w-[72px] shrink-0 rounded-2xl" fallbackLabel="" />
          <div className="flex min-w-0 flex-1 flex-col justify-center">
            <p className="line-clamp-2 text-[14px] font-semibold leading-tight">{entry.title}</p>
            <p className="mt-1 text-[12px] text-[var(--color-muted)]">
              {/* «Для {имя}» требует падежа, а имя произвольное. Двоеточие честнее. */}
              Кому: {entry.ownerName}
              {entry.price !== undefined && ` · ${formatRub(entry.price, entry.currency, rates)}`}
            </p>
            <Link
              href={`/wishlist/${entry.code}`}
              className="mt-1 text-[12px] font-bold text-[var(--color-brand)]"
            >
              Открыть список {formatCode(entry.code)}
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyMine() {
  return (
    <div className="rounded-3xl bg-[var(--color-surface)] p-6 text-center">
      <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-brand-soft)]">
        <IconBookmark className="h-7 w-7 text-[var(--color-brand)]" />
      </span>
      <h2 className="font-display text-[17px] font-bold">Список пуст</h2>
      <p className="mt-1.5 text-[13px] leading-snug text-[var(--color-muted)]">
        Нажимайте закладку на карточке товара в ленте — или добавьте своё желание с любой другой ссылкой.
      </p>
      <Link href="/" className="brand-gradient mt-4 inline-block rounded-2xl px-6 py-3 text-[14px] font-bold text-white">
        В ленту
      </Link>
    </div>
  );
}

function GuestBlock({ count, onLogin }: { count: number; onLogin: () => void }) {
  return (
    <div className="rounded-3xl bg-[var(--color-surface)] p-6 text-center">
      <h2 className="font-display text-[17px] font-bold">Вишлист живёт в аккаунте</h2>
      <p className="mt-1.5 text-[13px] leading-snug text-[var(--color-muted)]">
        {count > 0
          ? `В этом браузере уже отложено ${count} ${plural(count, "желание", "желания", "желаний")}. Войдите — список переедет в аккаунт, получит код и станет доступен друзьям.`
          : "Войдите, чтобы список получил код, открывался по ссылке и принимал брони друзей."}
      </p>
      <button
        type="button"
        onClick={onLogin}
        className="brand-gradient mt-4 rounded-2xl px-6 py-3 text-[14px] font-bold text-white"
      >
        Войти или зарегистрироваться
      </button>
    </div>
  );
}
