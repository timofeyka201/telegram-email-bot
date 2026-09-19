/**
 * Иконки для домашнего экрана. Системы не принимают SVG: Android хочет PNG
 * 192 и 512, iOS — apple-touch-icon 180. Рисуем их из того же макета, что и
 * фавиконку, через headless-браузер — отдельная графическая библиотека ради
 * четырёх картинок в зависимости не идёт.
 */
import { mkdir, writeFile } from "node:fs/promises";

/** Playwright нужен только здесь и только при перерисовке иконок, поэтому в
 *  зависимости проекта не входит: готовые PNG лежат в репозитории. */
let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error("Нужен playwright: npm i -D playwright (иконки уже лежат в public/icons, пересобирать их не обязательно)");
  process.exit(1);
}

const OUT = new URL("../public/icons/", import.meta.url);

/** Логотип. safe — доля холста под рисунок: у maskable края срезает система. */
const svg = (safe = 1) => {
  const pad = ((1 - safe) / 2) * 32;
  const inner = 32 * safe;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  <defs>
    <linearGradient id="bg" x1="0" y1="32" x2="32" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#5B3DF5"/>
      <stop offset="100%" stop-color="#9B6BFF"/>
    </linearGradient>
  </defs>
  <rect width="32" height="32" fill="url(#bg)"/>
  <g transform="translate(${pad} ${pad}) scale(${inner / 32})">
    <path d="M22.5 9.2C22.5 6.1 9.5 5.6 9.5 11.4c0 5.4 13 3.6 13 9.4 0 5.4-11.5 5.6-13 1.4"
          fill="none" stroke="#fff" stroke-width="4.2" stroke-linecap="round"/>
    <circle cx="9.5" cy="22.2" r="3.1" fill="#fff"/>
  </g>
</svg>`;
};

// maskable обрезается по кругу: рисунок держим внутри 80% холста, иначе срежет хвост буквы.
const TARGETS = [
  { file: "icon-192.png", size: 192, safe: 1 },
  { file: "icon-512.png", size: 512, safe: 1 },
  { file: "icon-maskable-512.png", size: 512, safe: 0.78 },
  { file: "apple-touch-icon.png", size: 180, safe: 1 },
];

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const { file, size, safe } of TARGETS) {
      const page = await browser.newPage({ viewport: { width: size, height: size } });
      await page.setContent(
        `<body style="margin:0"><div style="width:${size}px;height:${size}px">${svg(safe)
          .replace('width="32" height="32"', `width="${size}" height="${size}"`)}</div></body>`,
      );
      const shot = await page.screenshot({ omitBackground: false });
      await writeFile(new URL(file, OUT), shot);
      await page.close();
      console.log(`${file} — ${size}×${size}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
