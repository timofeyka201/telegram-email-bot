"use client";

import { useEffect, useRef, useState } from "react";
import Img from "./Img";
import Sheet from "./Sheet";
import { toast } from "./Toast";
import { addCustomCard, patchItem } from "@/lib/wish/client";
import { MAX_NOTE, MAX_TITLE, type OwnerItem, type OwnerView } from "@/lib/wish/types";

const CURRENCIES = ["RUB", "USD", "EUR", "CNY"];

/**
 * Своя карточка в вишлисте. Желание не обязано быть товаром из ленты: билеты,
 * вещь из другого магазина или «набор для пайки» — всё это должно попадать в
 * список так же легко, как карточка Swiper.
 */
export default function WishCardForm({
  open,
  item,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** Правим существующую карточку или заводим новую. */
  item?: OwnerItem | null;
  onClose: () => void;
  onSaved: (view: OwnerView) => void;
}) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [image, setImage] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("RUB");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(item?.title ?? "");
    setUrl(item?.url ?? "");
    setImage(item?.image ?? "");
    setPrice(item?.price !== undefined ? String(item.price) : "");
    setCurrency(item?.currency || "RUB");
    setNote(item?.note ?? "");
    setError(null);
  }, [open, item]);

  /** Заполнение по ссылке: у большинства магазинов название, фото и цена лежат в разметке страницы. */
  async function fillFromLink() {
    if (!url.trim()) return;
    setFetching(true);
    setError(null);
    try {
      const res = await fetch(`/api/wishlist/preview?url=${encodeURIComponent(url.trim())}`);
      const data = (await res.json()) as {
        title?: string;
        image?: string;
        price?: number;
        currency?: string;
        url?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Не получилось прочитать страницу — заполните поля руками");
        return;
      }
      if (data.title && !title.trim()) setTitle(data.title);
      if (data.image) setImage(data.image);
      if (data.price !== undefined && !price.trim()) setPrice(String(data.price));
      if (data.currency) setCurrency(data.currency);
      if (data.url) setUrl(data.url);
      if (!data.title && !data.image && data.price === undefined) {
        setError("Страница ничего о себе не рассказала — заполните поля руками");
      }
    } catch {
      setError("Нет связи с сервером");
    } finally {
      setFetching(false);
    }
  }

  /**
   * Фото из галереи. Ссылку на своё фото человеку взять негде, поэтому файл
   * уезжает на сервер, а в карточке остаётся уже наш адрес.
   */
  async function uploadPhoto(file: File) {
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("photo", file);
      const res = await fetch("/api/wishlist/photo", { method: "POST", body });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error ?? "Не получилось загрузить фотографию");
        return;
      }
      setImage(data.url);
    } catch {
      setError("Нет связи с сервером");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    const clean = title.trim();
    if (!clean) {
      setError("Без названия карточку не сохранить");
      return;
    }
    setBusy(true);
    setError(null);
    const parsed = price.trim() ? Number(price.replace(",", ".").replace(/\s/g, "")) : undefined;
    const payload = {
      title: clean,
      url: url.trim() || undefined,
      image: image.trim() || undefined,
      price: Number.isFinite(parsed) ? parsed : undefined,
      currency,
      note: note.trim() || undefined,
    };

    if (item) {
      const view = await patchItem(item.id, { ...payload, price: payload.price ?? null });
      setBusy(false);
      if (!view) {
        setError("Не получилось сохранить");
        return;
      }
      onSaved(view);
      toast("Сохранили");
      onClose();
      return;
    }

    const { wishlist, error: failure } = await addCustomCard(payload);
    setBusy(false);
    if (!wishlist) {
      setError(failure ?? "Не получилось сохранить");
      return;
    }
    onSaved(wishlist);
    toast("Добавили в вишлист", "like");
    onClose();
  }

  const field =
    "w-full rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] px-3.5 py-2.5 text-[15px] outline-none focus:border-[var(--color-brand)]";

  return (
    <Sheet
      open={open}
      title={item ? "Правка желания" : "Своё желание"}
      onClose={onClose}
      footer={
        <button
          type="button"
          disabled={busy}
          onClick={save}
          className="brand-gradient w-full rounded-full py-3.5 text-[15px] font-bold disabled:opacity-60"
        >
          {busy ? "Сохраняем…" : item ? "Сохранить" : "Добавить в вишлист"}
        </button>
      }
    >
      <div className="flex flex-col gap-3 pt-1">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-[var(--color-muted)]">Ссылка на товар</span>
          <div className="flex gap-2">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              inputMode="url"
              placeholder="https://…"
              className={field}
            />
            <button
              type="button"
              disabled={!url.trim() || fetching}
              onClick={fillFromLink}
              className="shrink-0 rounded-2xl bg-[var(--color-surface-2)] px-3 text-[13px] font-bold text-[var(--color-ink-soft)] disabled:opacity-50"
            >
              {fetching ? "…" : "Заполнить"}
            </button>
          </div>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-[var(--color-muted)]">Название</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, MAX_TITLE))}
            placeholder="Что хочется"
            className={field}
          />
        </label>

        <div className="flex gap-2">
          <label className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-[var(--color-muted)]">Цена</span>
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              inputMode="decimal"
              placeholder="—"
              className={`tnum ${field}`}
            />
          </label>
          <label className="flex w-[110px] shrink-0 flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-[var(--color-muted)]">Валюта</span>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={field}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-[var(--color-muted)]">Фото</span>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              // Сбрасываем значение: иначе повторный выбор того же файла молчит.
              e.target.value = "";
              if (file) void uploadPhoto(file);
            }}
          />
          <div className="flex items-start gap-3">
            {image.trim() ? (
              <Img
                src={image.trim()}
                alt="Предпросмотр"
                className="h-24 w-24 shrink-0 rounded-2xl"
                fallbackLabel="Фото не открылось"
              />
            ) : (
              <span className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl border border-dashed border-[var(--color-line)] px-2 text-center text-[12px] leading-tight text-[var(--color-muted)]">
                Пока без фото
              </span>
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
                className="rounded-2xl bg-[var(--color-surface-2)] px-3.5 py-2.5 text-[14px] font-bold text-[var(--color-ink-soft)] disabled:opacity-60"
              >
                {uploading ? "Загружаем…" : image.trim() ? "Заменить фото" : "Выбрать из галереи"}
              </button>
              {image.trim() && !uploading && (
                <button
                  type="button"
                  onClick={() => setImage("")}
                  className="text-left text-[13px] font-semibold text-[var(--color-muted)]"
                >
                  Убрать фото
                </button>
              )}
            </div>
          </div>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-[var(--color-muted)]">Пожелание</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, MAX_NOTE))}
            rows={3}
            placeholder="Размер, цвет, «лучше без надписи» — всё, что важно дарителю"
            className={`${field} resize-none`}
          />
        </label>

        {error && (
          <p className="rounded-2xl bg-[var(--color-nope-soft)] px-3.5 py-2.5 text-[13px] font-medium text-[var(--color-nope)]">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}
