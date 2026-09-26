/**
 * Иконки для домашнего экрана и вкладки браузера.
 *
 * Источник один — assets/icon.png, макет 512×512. Раньше здесь лежала
 * векторная копия знака, и стоило поправить рисунок, как копия расходилась с
 * оригиналом; теперь все размеры получаются из одного файла.
 *
 * Рисует sharp — он и так стоит для перекодировки фотографий каталога.
 */
import { mkdir, writeFile } from "node:fs/promises";

let sharp;
try {
  ({ default: sharp } = await import("sharp"));
} catch {
  console.error("Нужен sharp: npm i sharp (готовые PNG лежат в public/icons)");
  process.exit(1);
}

const SOURCE = new URL("../assets/icon.png", import.meta.url);
const OUT = new URL("../public/icons/", import.meta.url);

/*
 * maskable система обрезает под свою форму — круг, квадрат со скруглением или
 * каплю. В макете рисунок и так лежит с запасом от краёв, поэтому отдельного
 * уменьшения не нужно: обрезается только сплошная заливка.
 */
const TARGETS = [
  { file: "icon-32.png", size: 32 },
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
  { file: "icon-maskable-512.png", size: 512 },
  { file: "apple-touch-icon.png", size: 180 },
];

async function main() {
  await mkdir(OUT, { recursive: true });
  for (const { file, size } of TARGETS) {
    const png = await sharp(SOURCE.pathname).resize(size, size, { fit: "cover" }).png().toBuffer();
    await writeFile(new URL(file, OUT), png);
    console.log(`${file} — ${size}×${size}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
