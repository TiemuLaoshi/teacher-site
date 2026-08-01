/**
 * Рендер иконок сайта (Этап 5): tools/favicon-template.html → assets/img/.
 *
 *   node tools/make-favicon.js
 *
 * PNG, а не .ico и не SVG:
 *   • .ico — устаревший контейнер, все актуальные браузеры понимают PNG;
 *   • SVG потребовал бы вшить контур иероглифа (шрифта внутри иконки нет),
 *     а это лишняя ручная работа ради одного знака.
 * Пока в разметке объявлены <link rel="icon">, браузер не просит
 * /favicon.ico и 404 в консоли не появляется.
 */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];

// 32 — вкладка браузера, 180 — иконка на домашнем экране iOS
const SIZES = [
  { px: 32, out: 'assets/img/favicon-32.png' },
  { px: 180, out: 'assets/img/apple-touch-icon.png' },
];

(async () => {
  const executablePath = CHROME_CANDIDATES.find(fs.existsSync);
  if (!executablePath) throw new Error('Chrome/Edge не найден');

  const src = path.resolve('tools/favicon-template.html');
  const browser = await puppeteer.launch({ executablePath, headless: 'new' });
  const page = await browser.newPage();

  for (const { px, out } of SIZES) {
    // Рендерим всегда в 512px и уменьшаем через deviceScaleFactor —
    // так иероглиф не разваливается на мелком кегле.
    await page.setViewport({ width: 512, height: 512, deviceScaleFactor: px / 512 });
    await page.goto('file:///' + src.replace(/\\/g, '/'), { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);
    const file = path.resolve(out);
    await page.screenshot({ path: file, type: 'png' });
    console.log(`${out} — ${px}×${px}, ${(fs.statSync(file).size / 1024).toFixed(1)} КБ`);
  }

  await browser.close();
})();
