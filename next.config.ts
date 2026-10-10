import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Все внешние картинки идут через /api/img (нужен Referer для alicdn),
  // поэтому next/image здесь не используется.

  // sharp — нативный модуль: собирать его в бандл нельзя, он должен
  // подгружаться из node_modules как есть. Нужен для фотографий, которые
  // пользователь прикладывает к своему желанию.
  serverExternalPackages: ["sharp"],
};

export default nextConfig;
