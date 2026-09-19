/**
 * Service worker приложения Swiper.
 *
 * Задача скромная: приложение должно открываться с домашнего экрана даже без
 * сети и не моргать белым экраном в метро. Поэтому — никакого предварительного
 * кэша со списком файлов (имена сборок Next меняются каждый деплой), только
 * кэширование по факту обращения.
 */

const VERSION = "v1";
const SHELL = `swiper-shell-${VERSION}`;
const DATA = `swiper-data-${VERSION}`;
const IMAGES = `swiper-images-${VERSION}`;
const OFFLINE_URL = "/offline";

/** Картинок много и они тяжёлые: держим последние N, остальное вытесняем. */
const IMAGE_LIMIT = 200;
/**
 * Картинки с чужих доменов приходят «непрозрачными»: содержимое нам не видно,
 * и браузер засчитывает каждую в квоту с большим запасом. Поэтому их держим
 * заметно меньше — иначе переполнение выбрасывает весь кэш целиком.
 */
const FOREIGN_IMAGE_LIMIT = 60;

/**
 * Кладём в кэш сразу при установке. Иначе первая же загрузка ускользает:
 * страницу, на которой worker только устанавливается, он ещё не контролирует
 * и закэшировать не может — а с домашнего экрана приложение могут открыть
 * сразу в метро.
 */
const PRECACHE = [OFFLINE_URL, "/", "/likes", "/cart", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      // Поимённо, а не addAll: тот падает целиком, если не получилась одна
      // страница, и установка срывается вся.
      await Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => undefined)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Чужие версии кэша удаляем, иначе они копятся от деплоя к деплою.
      const keep = new Set([SHELL, DATA, IMAGES]);
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith("swiper-") && !keep.has(n)).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  const data = event.data;

  // Обновление по команде страницы: иначе новый worker ждёт закрытия всех вкладок.
  if (data === "skip-waiting") {
    self.skipWaiting();
    return;
  }

  /**
   * Страница присылает адреса файлов, которые ей понадобились. Своими силами
   * worker их не увидит: при первой загрузке он ещё не управляет страницей, и
   * её сборки проходят мимо него — без этого списка приложение без сети
   * открылось бы разметкой без кода.
   */
  if (data && data.type === "warm" && Array.isArray(data.urls)) {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(SHELL);
        await Promise.all(
          data.urls.slice(0, 120).map(async (url) => {
            try {
              if (await cache.match(url)) return;
              await cache.add(url);
            } catch (e) {
              void e;
            }
          }),
        );
      })(),
    );
  }
});

async function trim(cacheName, limit) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - limit; i += 1) await cache.delete(keys[i]);
}

/** Сеть вперёд, кэш — подстраховка. Для того, что должно быть свежим. */
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (e) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw e;
  }
}

/** Кэш вперёд. Для того, что не меняется: хэшированные сборки и картинки. */
async function cacheFirst(request, cacheName, limit) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok || response.type === "opaque") {
    // Квота может кончиться. Это не повод не показать уже полученную картинку.
    try {
      await cache.put(request, response.clone());
      if (limit) void trim(cacheName, limit);
    } catch (e) {
      void e;
    }
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Учётные записи и синхронизация обязаны ходить в сеть: кэш здесь означал бы
  // чужую сессию на общем устройстве и потерю только что сделанных изменений.
  if (url.pathname.startsWith("/api/auth") || url.pathname.startsWith("/api/sync")) return;

  // Переходы по страницам: свежая версия, иначе сохранённая, иначе «нет сети».
  if (request.mode === "navigate") {
    event.respondWith(
      networkFirst(request, SHELL).catch(async () => {
        const cache = await caches.open(SHELL);
        return (await cache.match(OFFLINE_URL)) ?? Response.error();
      }),
    );
    return;
  }

  if (url.origin === self.location.origin) {
    // Сборки Next лежат по хэшированным адресам — содержимое по ним не меняется.
    if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
      event.respondWith(cacheFirst(request, SHELL));
      return;
    }
    // Карточка товара и курсы валют: без сети показываем то, что уже видели.
    // Ленту (/api/feed) кэшировать нечем — это POST, а Cache API хранит только
    // GET. Уже просмотренные карточки и так лежат в хранилище приложения.
    if (url.pathname === "/api/prices" || url.pathname === "/api/item") {
      event.respondWith(networkFirst(request, DATA));
      return;
    }
    if (url.pathname === "/api/img" || url.pathname === "/api/placeholder") {
      event.respondWith(cacheFirst(request, IMAGES, IMAGE_LIMIT));
      return;
    }
    return;
  }

  // Картинки товаров лежат на чужих доменах и грузятся напрямую.
  if (request.destination === "image") {
    event.respondWith(cacheFirst(request, IMAGES, FOREIGN_IMAGE_LIMIT).catch(() => Response.error()));
  }
});
