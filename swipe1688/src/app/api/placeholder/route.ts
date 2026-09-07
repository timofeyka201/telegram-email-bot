import { NextRequest, NextResponse } from "next/server";

/**
 * Локальная заглушка вместо фотографии: демо-подборка и «битые» картинки
 * не должны выглядеть как сломанная вёрстка, даже когда внешняя сеть недоступна.
 */

const PALETTES: [string, string][] = [
  ["#ffd9d2", "#ff9d8f"],
  ["#dbe7ff", "#9fb8ff"],
  ["#d9f3e4", "#8fd9b3"],
  ["#fff0cf", "#ffce6a"],
  ["#ece0ff", "#bda6ff"],
  ["#e2f0f7", "#9ecfe6"],
  ["#ffe4f0", "#ff9ec4"],
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
}

function wrap(text: string, perLine: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > perLine) {
      lines.push(line.trim());
      line = w;
      if (lines.length === maxLines) break;
    } else {
      line = `${line} ${w}`;
    }
  }
  if (lines.length < maxLines && line.trim()) lines.push(line.trim());
  return lines.slice(0, maxLines);
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const seed = sp.get("seed") || "x";
  const label = (sp.get("label") || "").slice(0, 90);
  const n = Number(sp.get("i") || 1);

  const h = hash(seed);
  const [a, b] = PALETTES[h % PALETTES.length];
  const angle = (h % 60) + 15;
  const cx = 30 + ((h >> 3) % 40);
  const cy = 28 + ((h >> 7) % 30);

  const lines = wrap(escapeXml(label), 22, 3);
  const text = lines
    .map((l, i) => `<tspan x="50%" dy="${i === 0 ? 0 : 34}">${l}</tspan>`)
    .join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 1200" width="900" height="1200">
  <defs>
    <linearGradient id="g" gradientTransform="rotate(${angle})">
      <stop offset="0%" stop-color="${a}"/>
      <stop offset="100%" stop-color="${b}"/>
    </linearGradient>
  </defs>
  <rect width="900" height="1200" fill="url(#g)"/>
  <circle cx="${cx * 9}" cy="${cy * 12}" r="${220 + (h % 120)}" fill="#ffffff" opacity="0.22"/>
  <circle cx="${900 - cx * 7}" cy="${1200 - cy * 8}" r="${140 + (h % 90)}" fill="#ffffff" opacity="0.16"/>
  <rect x="330" y="470" width="240" height="240" rx="40" fill="#ffffff" opacity="0.5"/>
  <text x="50%" y="610" text-anchor="middle" font-family="-apple-system, Segoe UI, Roboto, sans-serif"
        font-size="90" font-weight="700" fill="#1c1d21" opacity="0.45">${n}</text>
  ${
    lines.length
      ? `<text x="50%" y="820" text-anchor="middle" font-family="-apple-system, Segoe UI, Roboto, sans-serif"
        font-size="30" font-weight="600" fill="#1c1d21" opacity="0.6">${text}</text>`
      : ""
  }
</svg>`;

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
