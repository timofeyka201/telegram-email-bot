import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Все внешние картинки идут через /api/img (нужен Referer для alicdn),
  // поэтому next/image здесь не используется.
};

export default nextConfig;
