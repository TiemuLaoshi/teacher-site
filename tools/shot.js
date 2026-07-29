/**
 * Скриншот страницы для цикла сверки с макетом (Design_Mockup/screenshot_skill.md).
 *
 *   node tools/shot.js                       — весь index.html, десктоп 1440
 *   node tools/shot.js --width 390 --out m   — мобильная ширина
 *   node tools/shot.js --sel "#hero"         — только одна секция
 *
 * Использует уже установленный в системе Chrome (puppeteer-core, без загрузки
 * Chromium). Результат — scratch/<out>.png, папка в .gitignore.
 */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i === -1 ? fallback : process.argv[i + 1];
}

(async () => {
  const executablePath = CHROME_CANDIDATES.find(fs.existsSync);
  if (!executablePath) throw new Error('Chrome/Edge не найден — укажи путь в CHROME_CANDIDATES');

  const width = Number(arg('width', 1440));
  const sel = arg('sel', null);
  const out = arg('out', sel ? sel.replace(/[^a-z0-9]/gi, '') : 'full');
  // --file принимает и локальный путь, и http(s)-адрес (проверка прода)
  const target0 = arg('file', 'index.html');
  const url = /^https?:\/\//.test(target0)
    ? target0
    : 'file:///' + path.resolve(target0).replace(/\\/g, '/');

  const outDir = path.resolve('scratch');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, out + '.png');

  const browser = await puppeteer.launch({ executablePath, headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });

  // По умолчанию снимаем как «уменьшенное движение»: появления при скролле,
  // счётчики и лента отзывов тогда стоят в конечном состоянии, и кадр
  // сравним с эталоном. Без этого на fullPage-снимке блоки ниже экрана
  // попадают в кадр непроявленными. --motion 1 — снять живую страницу.
  if (!arg('motion', null)) {
    await page.emulateMediaFeatures([
      { name: 'prefers-reduced-motion', value: 'reduce' },
    ]);
  }

  await page.goto(url, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);

  // Прокрутить страницу до конца и вернуться наверх: без этого картинки с
  // loading="lazy" на первом (холодном) запуске не успевают декодироваться и
  // попадают в fullPage-кадр пустыми — сравнение врёт на несколько процентов.
  await page.evaluate(async () => {
    const step = window.innerHeight;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 50));
    }
    window.scrollTo(0, 0);
    await Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
  });
  // Дать доиграть входным анимациям (fadeUp ~.8s), иначе в кадр попадёт
  // недоигранный кадр и сравнение с эталоном будет ложно расходиться.
  await new Promise((r) => setTimeout(r, Number(arg('settle', 1000))));

  const target = sel ? await page.$(sel) : page;
  if (!target) throw new Error('Селектор не найден: ' + sel);
  await target.screenshot({ path: outPath, fullPage: !sel });

  const { width: w, height: h } = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
  }));
  console.log(`${outPath} — страница ${w}×${h}, viewport ${width}px`);

  await browser.close();
})();
