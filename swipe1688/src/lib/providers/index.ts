import { bhapiProvider } from "./bhapi";
import { catalogProvider } from "./dummyjson";
import { demoProvider } from "./demo";
import type { Provider } from "./types";

export const PROVIDERS: Provider[] = [bhapiProvider, catalogProvider, demoProvider];

export function getProvider(id?: string | null): Provider {
  return PROVIDERS.find((p) => p.id === id) ?? defaultProvider();
}

/** Токен есть — идём в 1688; нет — в открытый каталог, он работает сразу. */
export function defaultProvider(): Provider {
  return bhapiProvider.ready() ? bhapiProvider : catalogProvider;
}

export function providerInfo() {
  return PROVIDERS.map((p) => ({ id: p.id, label: p.label, note: p.note, ready: p.ready(), needsToken: p.needsToken }));
}

export type { Provider };
