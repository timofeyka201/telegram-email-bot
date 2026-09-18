import type { MetadataRoute } from "next";

/** Витрина живёт на телефоне, поэтому её можно поставить на домашний экран. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Swiper — свайп-витрина товаров",
    short_name: "Swiper",
    description: "Свайпайте товары: вправо — нравится, влево — мимо, вверх — в корзину.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f5f4fa",
    theme_color: "#5b3df5",
    lang: "ru",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
