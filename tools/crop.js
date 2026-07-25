/**
 * Нарезка эталонного рендера Design_Mockup/fullpage.png на фрагменты для
 * посекционной сверки (Design_Mockup/screenshot_skill.md).
 *
 *   node tools/crop.js --info                    — размеры эталона
 *   node tools/crop.js --top 0 --h 900 --out ref-hero
 *
 * Кроп делается через тот же Chrome, что и скриншоты — без доп. зависимостей.
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
  if (!executablePath) throw new Error('Chrome/Edge не найден');

  const src = path.resolve(arg('src', 'Design_Mockup/fullpage.png'));
  const url = 'file:///' + src.replace(/\\/g, '/');

  const browser = await puppeteer.launch({ executablePath, headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900 });
  await page.goto(url, { waitUntil: 'networkidle0' });

  const dims = await page.evaluate((u) => new Promise((res) => {
    const i = new Image();
    i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight });
    i.src = u;
  }), url);

  if (process.argv.includes('--info')) {
    console.log(`${src} — ${dims.w}×${dims.h}`);
    await browser.close();
    return;
  }

  const top = Number(arg('top', 0));
  const h = Number(arg('h', 900));
  const left = Number(arg('left', 0));
  const w = Number(arg('w', dims.w - left));
  const out = arg('out', `ref-${top}-${top + h}`);

  const outDir = path.resolve('scratch');
  fs.mkdirSync(outDir, { recursive: true });

  // Через реальный .html-файл, а не setContent: страница about:blank не имеет
  // права грузить file://-ресурсы, и ожидание load зависает.
  const holder = path.join(outDir, '_crop.html');
  fs.writeFileSync(holder, `<body style="margin:0;overflow:hidden"><img src="${url}"
    style="display:block;width:${dims.w}px;margin-top:-${top}px;margin-left:-${left}px"></body>`);
  await page.setViewport({ width: w, height: h });
  await page.goto('file:///' + holder.replace(/\\/g, '/'), { waitUntil: 'load' });

  const outPath = path.join(outDir, out + '.png');
  await page.screenshot({ path: outPath });
  console.log(`${outPath} — фрагмент ${w}×${h} с (${left},${top}) (исходник ${dims.w}×${dims.h})`);

  await browser.close();
})();
