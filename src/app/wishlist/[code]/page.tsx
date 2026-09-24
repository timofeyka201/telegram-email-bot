"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import AuthSheet from "@/components/AuthSheet";
import Img from "@/components/Img";
import { IconArrowLeft, IconCheck, IconExternal, IconGift } from "@/components/Icons";
import { toast } from "@/components/Toast";
import { useHydrated, useStore } from "@/lib/store";
import { formatNative, formatRub, needsConversion, plural } from "@/lib/money";
import { loadFriendWishlist, toggleReserve } from "@/lib/wish/client";
import { formatCode, normalizeCode, type FriendItem, type FriendView } from "@/lib/wish/types";

/**
 * Чужой список желаний. Главное здесь — бронь: она существует ровно для того,
 * чтобы двое не подарили одно и то же, и поэтому видна всем гостям сразу.
 * Владельцу её не показывают нигде и никогда.
 */
export default function FriendWishlistPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const hydrated = useHydrated();
  const account = useStore((s) => s.account);

  const code = normalizeCode(String(params.code ?? ""));
  const [view, setView] = useState<FriendView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);

  const load = useCallback(async () => {
    if (!code) {
      setError("Код состоит из шести букв и цифр: SW-K7QM4X");
      setLoading(false);
      return;
    }
    setLoading(true);
    const result = await loadFriendWishlist(code);
    setLoading(false);
    if (result.kind === "mine") {
      router.replace("/wishlist");
      return;
    }
    if (result.kind === "error") {
      setError(result.message);
      setView(null);
      return;
    }
    setError(null);
    setView(result.wishlist);
  }, [code, router]);

  // Перезагружаем и после входа: гостю кнопки брони не положены, вошедшему — да.
  useEffect(() => {
    if (hydrated) void load();
  }, [hydrated, load, account]);

  async function reserve(item: FriendItem) {
    if (!code) return;
    if (!account) {
      setAuthOpen(true);
      return;
    }
    setBusyId(item.id);
    const { wishlist, error: failure } = await toggleReserve(code, item.id, !item.mine);
    setBusyId(null);
    if (wishlist) setView(wishlist);
    if (failure) toast(failure);
    else toast(item.mine ? "Бронь снята" : "Забронировали — другие увидят, что подарок занят", item.mine ? "default" : "like");
  }

  if (!hydrated) return <div className="flex-1" />;

  return (
    <div className="flex flex-1 flex-col">
      <header className="safe-top sticky top-0 z-30 bg-[var(--color-bg)]/92 px-4 pb-3 pt-3 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <Link
            href="/wishlist"
            aria-label="К своему вишлисту"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-2)] text-[var(--color-muted)]"
          >
            <IconArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate font-display text-[22px] leading-tight">
              {view?.title ?? "Вишлист"}
            </h1>
            <p className="truncate text-[12px] text-[var(--color-muted)]">
              {view ? `${view.ownerName} · ${formatCode(view.code)}` : code ? formatCode(code) : ""}
            </p>
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-3 p-4 pb-28">
        {loading ? (
          <p className="py-10 text-center text-[14px] text-[var(--color-muted)]">Загружаем…</p>
        ) : error ? (
          <div className="rounded-3xl bg-[var(--color-surface)] p-6 text-center">
            <h2 className="font-display text-[17px] font-bold">Не открылось</h2>
            <p className="mt-1.5 text-[13px] leading-snug text-[var(--color-muted)]">{error}</p>
            <Link
              href="/wishlist"
              className="brand-gradient mt-4 inline-block rounded-full px-6 py-3 text-[14px] font-bold"
            >
              К своему вишлисту
            </Link>
          </div>
        ) : !view ? null : (
          <>
            {view.note && (
              <p className="rounded-3xl bg-[var(--color-surface)] p-4 text-[13px] leading-snug text-[var(--color-ink-soft)]">
                {view.note}
              </p>
            )}

            <p className="px-1 text-[12px] leading-snug text-[var(--color-muted)]">
              {view.canReserve
                ? `${view.items.length} ${plural(view.items.length, "желание", "желания", "желаний")}. Бронь видна другим гостям, но не владельцу списка.`
                : "Войдите, чтобы забронировать подарок — тогда другие гости увидят, что он уже занят."}
            </p>

            {view.items.length === 0 ? (
              <p className="rounded-3xl bg-[var(--color-surface)] p-6 text-center text-[14px] text-[var(--color-muted)]">
                Список пока пуст.
              </p>
            ) : (
              view.items.map((item) => (
                <GiftCard
                  key={item.id}
                  item={item}
                  canReserve={view.canReserve}
                  busy={busyId === item.id}
                  onReserve={() => reserve(item)}
                />
              ))
            )}
          </>
        )}
      </div>

      <AuthSheet open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
}

function GiftCard({
  item,
  canReserve,
  busy,
  onReserve,
}: {
  item: FriendItem;
  canReserve: boolean;
  busy: boolean;
  onReserve: () => void;
}) {
  const rates = useStore((s) => s.rates);
  const takenByOther = item.reserved && !item.mine;

  return (
    <div
      className={`soft-shadow flex gap-3 rounded-3xl bg-[var(--color-surface)] p-3 ${takenByOther ? "opacity-70" : ""}`}
    >
      <Img
        src={item.image}
        alt={item.title}
        className="h-[92px] w-[92px] shrink-0 rounded-2xl"
        fallbackLabel={item.title.slice(0, 24)}
      />
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
          <p className="mt-1 line-clamp-3 rounded-xl bg-[var(--color-surface-2)] px-2.5 py-1.5 text-[12px] leading-snug text-[var(--color-ink-soft)]">
            {item.note}
          </p>
        )}

        <div className="mt-auto flex items-center gap-1.5 pt-2">
          {takenByOther ? (
            <span className="rounded-xl bg-[var(--color-surface-2)] px-3 py-1.5 text-[12px] font-bold text-[var(--color-muted)]">
              Занято · {item.reservedBy}
            </span>
          ) : (
            <button
              type="button"
              disabled={busy || (!canReserve && item.mine)}
              onClick={onReserve}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[12px] font-bold disabled:opacity-60 ${
                item.mine
                  ? "bg-[var(--color-like-soft)] text-[var(--color-like)]"
                  : "bg-[var(--color-brand)] on-accent"
              }`}
            >
              {item.mine ? <IconCheck className="h-3.5 w-3.5" /> : <IconGift className="h-3.5 w-3.5" />}
              {busy ? "…" : item.mine ? "Дарю я — снять" : "Беру на себя"}
            </button>
          )}
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer noopener"
              aria-label="Открыть в магазине"
              className="ml-auto flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--color-surface-2)] text-[var(--color-muted)]"
            >
              <IconExternal className="h-4 w-4" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
