import { NextResponse } from "next/server";
import { currentUser, clientKey, noteFailure, tooManyAttempts } from "@/lib/auth/session";
import { appUrl, mailProblem, sendMail, verifyEmail } from "@/lib/auth/mail";
import { issueToken } from "@/lib/auth/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Выслать письмо с подтверждением текущему пользователю. */
export async function POST(req: Request) {
  const key = `verify:${clientKey(req)}`;
  if (tooManyAttempts(key)) {
    return NextResponse.json({ error: "Слишком много писем. Подождите несколько минут." }, { status: 429 });
  }

  const user = await currentUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  if (user.emailVerified) return NextResponse.json({ ok: true, alreadyVerified: true });

  // Каждое письмо считаем попыткой: иначе форму можно превратить в рассылку.
  noteFailure(key);

  const token = await issueToken("verify", user.id);
  const link = `${await appUrl()}/verify?token=${token}`;
  const letter = verifyEmail(link);
  const sent = await sendMail(user.email, letter.subject, letter.html, letter.text);

  if (!sent.delivered) {
    console.error("Подтверждение почты не отправлено:", sent.reason);
    // Без настроенной почты ссылку всё равно нужно как-то получить — но только
    // при локальной разработке: на сервере это обошло бы владение адресом.
    const local = process.env.NODE_ENV !== "production";
    return NextResponse.json(
      { error: `Письмо не отправлено: ${sent.reason}`, link: local ? link : undefined },
      { status: 503 },
    );
  }
  return NextResponse.json({ ok: true });
}
