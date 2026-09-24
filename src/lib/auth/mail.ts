import { headers } from "next/headers";

/**
 * Отправка писем через REST — по той же причине, что и Redis: на serverless
 * некуда держать SMTP-соединение. Resend взят как провайдер с бесплатным
 * тарифом; адрес шлюза вынесен в переменную, чтобы можно было подменить.
 */
const RESEND_BASE = process.env.RESEND_BASE || "https://api.resend.com";

/** Песочница Resend: письма уходят только на адрес владельца ключа. */
const SANDBOX_FROM = "Swiper <onboarding@resend.dev>";

const clean = (raw: string | undefined): string | undefined =>
  raw?.trim().replace(/^[A-Za-z_][A-Za-z0-9_]*\s*=\s*/, "").trim().replace(/^["']|["']$/g, "").trim() || undefined;

/** Что мешает отправлять письма, человеческим языком. null — всё на месте. */
export function mailProblem(): string | null {
  return clean(process.env.RESEND_API_KEY) ? null : "не задан RESEND_API_KEY — письма не отправляются";
}

export type MailResult = { delivered: boolean; reason?: string };

export async function sendMail(to: string, subject: string, html: string, text: string): Promise<MailResult> {
  const key = clean(process.env.RESEND_API_KEY);
  if (!key) return { delivered: false, reason: "RESEND_API_KEY не задан" };

  try {
    const res = await fetch(`${RESEND_BASE}/emails`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: clean(process.env.MAIL_FROM) || SANDBOX_FROM, to: [to], subject, html, text }),
      cache: "no-store",
    });
    if (res.ok) return { delivered: true };

    const body = await res.text().catch(() => "");
    const sandbox = !clean(process.env.MAIL_FROM);

    // 401 — ключ и правда негоден.
    if (res.status === 401) return { delivered: false, reason: `почтовый ключ не подошёл: ${body.slice(0, 160)}` };

    // 403 приходит и на негодный ключ, и — гораздо чаще — на попытку послать
    // письмо постороннему адресу с песочницы провайдера. Валить это на ключ
    // значит отправить человека чинить исправное.
    if (res.status === 403) {
      return {
        delivered: false,
        reason: sandbox
          ? "письма с адреса песочницы уходят только владельцу аккаунта. " +
            "Подтвердите свой домен у провайдера и задайте MAIL_FROM — тогда письма пойдут всем. " +
            `Ответ провайдера: ${body.slice(0, 200)}`
          : `провайдер отказал: ${body.slice(0, 200)}`,
      };
    }

    // Домен отправителя не подтверждён или адрес в MAIL_FROM не из него.
    if (res.status === 422) return { delivered: false, reason: `адрес отправителя отклонён: ${body.slice(0, 200)}` };
    return { delivered: false, reason: `почтовый сервис ответил ${res.status}: ${body.slice(0, 200)}` };
  } catch (e) {
    return { delivered: false, reason: e instanceof Error ? e.message : "почтовый сервис недоступен" };
  }
}

/**
 * Адрес приложения для ссылок в письмах. Берём из настройки, иначе собираем из
 * заголовков запроса — за прокси Vercel там уже подставлен настоящий домен.
 */
export async function appUrl(): Promise<string> {
  const configured = clean(process.env.APP_URL) || clean(process.env.NEXT_PUBLIC_APP_URL);
  if (configured) return configured.replace(/\/+$/, "");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) {
    const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    return `${proto}://${host}`;
  }
  const vercel = clean(process.env.VERCEL_PROJECT_PRODUCTION_URL) || clean(process.env.VERCEL_URL);
  return vercel ? `https://${vercel}` : "http://localhost:3000";
}

// ------------------------------------------------------------------ письма
const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Одна вёрстка на оба письма: почтовые клиенты понимают только таблицы и inline-стили. */
function layout(heading: string, lead: string, button: string, link: string, footer: string): string {
  const url = escape(link);
  return `<!doctype html>
<html lang="ru"><body style="margin:0;padding:24px;background:#eceef2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:24px;padding:32px;">
    <tr><td>
      <div style="font-size:20px;font-weight:800;letter-spacing:-0.02em;color:#15161a;margin-bottom:20px;">Swiper</div>
      <h1 style="margin:0 0 12px;font-size:22px;line-height:1.25;color:#15161a;">${escape(heading)}</h1>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.5;color:#3a3d45;">${escape(lead)}</p>
      <a href="${url}" style="display:inline-block;background:#ff5b2e;color:#15161a;text-decoration:none;font-weight:800;font-size:15px;padding:14px 28px;border-radius:999px;">${escape(button)}</a>
      <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#666b76;">Если кнопка не работает, откройте ссылку вручную:<br><a href="${url}" style="color:#c2431d;word-break:break-all;">${url}</a></p>
      <p style="margin:20px 0 0;font-size:13px;line-height:1.5;color:#666b76;">${escape(footer)}</p>
    </td></tr>
  </table>
</body></html>`;
}

export function verifyEmail(link: string): { subject: string; html: string; text: string } {
  const lead = "Остался один шаг: подтвердите, что это ваш адрес. Без этого вы сможете пользоваться приложением, но не сможете восстановить пароль.";
  return {
    subject: "Подтвердите почту — Swiper",
    html: layout("Подтвердите почту", lead, "Подтвердить почту", link, "Ссылка действует сутки. Если вы не регистрировались в Swiper, просто удалите письмо."),
    text: `Подтвердите почту в Swiper\n\n${lead}\n\n${link}\n\nСсылка действует сутки. Если вы не регистрировались, удалите письмо.`,
  };
}

export function resetEmail(link: string): { subject: string; html: string; text: string } {
  const lead = "Мы получили запрос на смену пароля. Придумайте новый — старый перестанет работать, и на других устройствах придётся войти заново.";
  return {
    subject: "Смена пароля — Swiper",
    html: layout("Новый пароль", lead, "Задать новый пароль", link, "Ссылка действует час. Если вы не просили менять пароль, ничего делать не нужно — пароль останется прежним."),
    text: `Смена пароля в Swiper\n\n${lead}\n\n${link}\n\nСсылка действует час. Если вы не просили менять пароль, ничего делать не нужно.`,
  };
}
