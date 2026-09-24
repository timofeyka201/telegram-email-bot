import { NextResponse } from "next/server";
import { authStore } from "@/lib/auth/store";
import { currentUser, clientKey, noteFailure, tooManyAttempts } from "@/lib/auth/session";
import { normalizeEmail } from "@/lib/auth/password";
import { appUrl, mailProblem, sendMail, verifyEmail } from "@/lib/auth/mail";
import { issueToken } from "@/lib/auth/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Один ответ на любой исход: иначе по форме можно узнать, кто здесь зарегистрирован. */
const SAME_ANSWER = {
  ok: true,
  message: "Если такой адрес зарегистрирован и ещё не подтверждён, письмо уже в пути. Проверьте и папку со спамом.",
};

/**
 * Выслать письмо с подтверждением. Работает и без сессии: до подтверждения
 * войти нельзя, а значит просить войти, чтобы получить письмо, — замкнутый круг.
 */
export async function POST(req: Request) {
  const key = `verify:${clientKey(req)}`;
  if (tooManyAttempts(key)) {
    return NextResponse.json({ error: "Слишком много писем. Подождите несколько минут." }, { status: 429 });
  }
  // Каждое письмо считаем попыткой: иначе форму можно превратить в рассылку.
  noteFailure(key);

  let body: { email?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    // Тело необязательно: вошедшему пользователю адрес известен и так.
  }

  const store = authStore();
  let user = await currentUser().catch(() => null);

  if (!user) {
    const email = normalizeEmail(String(body.email ?? ""));
    if (!email) return NextResponse.json({ error: "Укажите почту" }, { status: 400 });
    try {
      const id = await store.userIdByEmail(email);
      user = id ? await store.getUser(id) : null;
    } catch (e) {
      console.error("Повторное письмо: хранилище недоступно —", e);
      return NextResponse.json({ error: "Хранилище недоступно, попробуйте позже" }, { status: 503 });
    }
  }

  // Ни существующего адреса, ни уже подтверждённого не выдаём — ответ один.
  if (!user || user.emailVerified) return NextResponse.json(SAME_ANSWER);

  const link = `${await appUrl()}/verify?token=${await issueToken("verify", user.id)}`;
  const letter = verifyEmail(link);
  const sent = await sendMail(user.email, letter.subject, letter.html, letter.text);

  if (!sent.delivered) {
    console.error("Подтверждение почты не отправлено:", sent.reason);
    // Здесь молчать нельзя: человек ждёт письмо, которого не будет.
    const local = process.env.NODE_ENV !== "production";
    return NextResponse.json(
      { error: `Письмо не отправлено: ${sent.reason ?? mailProblem() ?? "неизвестная причина"}`, link: local ? link : undefined },
      { status: 503 },
    );
  }
  return NextResponse.json(SAME_ANSWER);
}
