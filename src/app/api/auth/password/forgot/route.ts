import { NextResponse } from "next/server";
import { authStore } from "@/lib/auth/store";
import { clientKey, noteFailure, tooManyAttempts } from "@/lib/auth/session";
import { normalizeEmail } from "@/lib/auth/password";
import { appUrl, resetEmail, sendMail } from "@/lib/auth/mail";
import { issueToken } from "@/lib/auth/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Один ответ на любой исход: иначе форма превращается в проверку, кто здесь зарегистрирован. */
const SAME_ANSWER = {
  ok: true,
  message: "Если такой адрес зарегистрирован, письмо со ссылкой уже в пути. Проверьте и папку со спамом.",
};

export async function POST(req: Request) {
  const key = `forgot:${clientKey(req)}`;
  if (tooManyAttempts(key)) {
    return NextResponse.json({ error: "Слишком много запросов. Подождите несколько минут." }, { status: 429 });
  }
  noteFailure(key);

  let body: { email?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const email = normalizeEmail(String(body.email ?? ""));
  if (!email) return NextResponse.json({ error: "Укажите почту" }, { status: 400 });

  try {
    const store = authStore();
    const id = await store.userIdByEmail(email);
    const user = id ? await store.getUser(id) : null;

    if (user) {
      const link = `${await appUrl()}/reset?token=${await issueToken("reset", user.id)}`;
      const letter = resetEmail(link);
      const sent = await sendMail(user.email, letter.subject, letter.html, letter.text);
      if (!sent.delivered) {
        console.error("Письмо для смены пароля не отправлено:", sent.reason);
        // Незнакомцу об этом знать незачем, а разработчику на своей машине — нужно.
        if (process.env.NODE_ENV !== "production") {
          return NextResponse.json({ ...SAME_ANSWER, link, warning: sent.reason });
        }
      }
    }
  } catch (e) {
    console.error("Смена пароля: хранилище недоступно —", e);
    return NextResponse.json({ error: "Хранилище недоступно, попробуйте позже" }, { status: 503 });
  }

  return NextResponse.json(SAME_ANSWER);
}
