/**
 * Иконки для домашнего экрана. Системы не принимают SVG: Android хочет PNG
 * 192 и 512, iOS — apple-touch-icon 180. Рисуем их из того же макета, что и
 * фавиконку.
 *
 * Рисует sharp — он и так стоит для перекодировки фотографий каталога. Раньше
 * здесь поднимался headless-браузер, которого в зависимостях проекта нет, и
 * перерисовать иконки было нечем.
 */
import { mkdir, writeFile } from "node:fs/promises";

let sharp;
try {
  ({ default: sharp } = await import("sharp"));
} catch {
  console.error("Нужен sharp: npm i -D sharp (готовые PNG лежат в public/icons)");
  process.exit(1);
}

const OUT = new URL("../public/icons/", import.meta.url);

/** Логотип. safe — доля холста под рисунок: у maskable края срезает система. */
const svg = (safe = 1) => {
  const pad = ((1 - safe) / 2) * 32;
  const inner = 32 * safe;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  <rect width="32" height="32" fill="#FF5B2E"/>
  <g transform="translate(${pad} ${pad}) scale(${inner / 32})">
    <path d="M22.5 9.2C22.5 6.1 9.5 5.6 9.5 11.4c0 5.4 13 3.6 13 9.4 0 5.4-11.5 5.6-13 1.4"
          fill="none" stroke="#15161A" stroke-width="4.2" stroke-linecap="round"/>
    <circle cx="9.5" cy="22.2" r="3.1" fill="#C6F135"/>
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
  for (const { file, size, safe } of TARGETS) {
    const source = Buffer.from(svg(safe).replace('width="32" height="32"', `width="${size}" height="${size}"`));
    const png = await sharp(source, { density: 384 }).resize(size, size).png().toBuffer();
    await writeFile(new URL(file, OUT), png);
    console.log(`${file} — ${size}×${size}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
