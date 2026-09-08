import { bhapiProvider } from "./bhapi";
import { catalogProvider } from "./dummyjson";
import { demoProvider } from "./demo";
import { wbProvider } from "./wildberries";
import type { Provider } from "./types";

/**
 * Порядок важен: это же и цепочка запасных вариантов в /api/feed.
 * Wildberries стоит сразу за 1688 — он на русском, без ключа и очень большой.
 */
export const PROVIDERS: Provider[] = [bhapiProvider, wbProvider, catalogProvider, demoProvider];

export function getProvider(id?: string | null): Provider {
  return PROVIDERS.find((p) => p.id === id) ?? defaultProvider();
}

/** Токен есть — идём в 1688; нет — в Wildberries, он работает сразу. */
export function defaultProvider(): Provider {
  return bhapiProvider.ready() ? bhapiProvider : wbProvider;
}

export function providerInfo() {
  return PROVIDERS.map((p) => ({ id: p.id, label: p.label, note: p.note, ready: p.ready(), needsToken: p.needsToken }));
}

export type { Provider };
