import { localProvider } from "./local";
import { demoProvider } from "./demo";
import type { Provider } from "./types";

/**
 * Витрина стоит на снапшоте AliExpress: импортёр (scripts/build-catalog-ae.mjs)
 * складывает товары на диск, а лента читает только его. Ни один свайп не стоит
 * ни одного запроса к партнёрскому API.
 *
 * Прежние источники — 1688, Wildberries и открытый демонстрационный каталог —
 * из реестра убраны: витрина у них разная по качеству и валютам, а партнёрская
 * комиссия есть только у AliExpress. Код источников остался в репозитории,
 * вернуть любой из них — одна строка здесь.
 *
 * Порядок важен: это же и цепочка запасных вариантов в /api/feed. Офлайн-
 * подборка идёт последней — она не зависит ни от чего и не даёт ленте опустеть.
 */
export const PROVIDERS: Provider[] = [localProvider, demoProvider];

export function getProvider(id?: string | null): Provider {
  return PROVIDERS.find((p) => p.id === id) ?? defaultProvider();
}

/** По умолчанию — снапшот AliExpress; пока его нет, офлайн-подборка. */
export function defaultProvider(): Provider {
  return localProvider.ready() ? localProvider : demoProvider;
}

export function providerInfo() {
  return PROVIDERS.map((p) => ({ id: p.id, label: p.label, note: p.note, ready: p.ready(), needsToken: p.needsToken }));
}

export type { Provider };
