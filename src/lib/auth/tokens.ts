import { randomBytes } from "node:crypto";
import { authStore } from "./store";

export type TokenKind = "verify" | "reset";

/**
 * Сутки на подтверждение почты и час на смену пароля. Ссылка сброса живёт мало
 * намеренно: она пускает в аккаунт, и чем дольше лежит в почте, тем опаснее.
 */
export const TOKEN_TTL: Record<TokenKind, number> = { verify: 24 * 60 * 60, reset: 60 * 60 };

/** 32 случайных байта: перебрать нельзя, подсмотреть в базе бесполезно — он одноразовый. */
export async function issueToken(kind: TokenKind, userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await authStore().putToken(`${kind}:${token}`, userId, TOKEN_TTL[kind]);
  return token;
}

/** Возвращает id владельца и гасит ссылку. Просроченную стирает сам store. */
export async function consumeToken(kind: TokenKind, token: string): Promise<string | null> {
  if (!token || token.length > 200) return null;
  return authStore().takeToken(`${kind}:${token}`);
}
