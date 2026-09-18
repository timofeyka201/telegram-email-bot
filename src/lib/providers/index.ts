import { bhapiProvider } from "./bhapi";
import { localProvider } from "./local";
import { catalogProvider } from "./dummyjson";
import { demoProvider } from "./demo";
import { wbProvider } from "./wildberries";
import type { Provider } from "./types";

/**
 * Порядок важен: это же и цепочка запасных вариантов в /api/feed.
 * Первой идёт своя база — она не зависит от внешних API и не может отказать.
 */
export const PROVIDERS: Provider[] = [localProvider, bhapiProvider, wbProvider, catalogProvider, demoProvider];

export function getProvider(id?: string | null): Provider {
  return PROVIDERS.find((p) => p.id === id) ?? defaultProvider();
}

/** По умолчанию — своя база: маркетплейсы режут серверные запросы лимитами. */
export function defaultProvider(): Provider {
  return localProvider.ready() ? localProvider : wbProvider;
}

export function providerInfo() {
  return PROVIDERS.map((p) => ({ id: p.id, label: p.label, note: p.note, ready: p.ready(), needsToken: p.needsToken }));
}

export type { Provider };
