import type { MetadataRoute } from "next";

/**
 * Описание приложения для домашнего экрана. display: standalone убирает
 * адресную строку и кнопки браузера — приложение открывается своим окном.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    // id фиксирует приложение за собой: без него смена start_url создаёт
    // второй ярлык вместо обновления установленного.
    id: "/",
    name: "Swiper — свайп-витрина товаров",
    short_name: "Swiper",
    description: "Свайпайте товары: вправо — нравится, влево — мимо, вверх — в корзину.",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    // Браузеры, читающие display_override, берут режим отсюда, а display
    // оставляют как запасной вариант для тех, кто это поле не знает.
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait",
    background_color: "#eceef2",
    theme_color: "#ff5b2e",
    lang: "ru",
    categories: ["shopping", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // maskable система обрезает под форму своих иконок, поэтому он отдельный.
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
    shortcuts: [
      { name: "Избранное", short_name: "Избранное", url: "/likes" },
      { name: "Корзина", short_name: "Корзина", url: "/cart" },
    ],
  };
}
