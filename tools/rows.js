/**
 * Профиль текстовых строк по вертикали: где в заданной колонке изображения
 * начинается и заканчивается каждая строка «чернил».
 *
 * Дополняет tools/diff.js: там --row/--col меряют края поперёк, а здесь
 * видно, на какой высоте стоит каждая строка текста. Именно так ловится
 * расхождение вида «первые четыре строки абзаца совпали, дальше уехало на 1px».
 *
 *   node tools/rows.js --a scratch/about.png --left 428 --right 861
 *   node tools/rows.js --a Design_Mockup/fullpage.png --left 428 --right 861
 *
 * Считает через canvas в том же Chrome — без доп. зависимостей.
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

  const file = arg('a', 'scratch/full.png');
  const left = Number(arg('left', 0));
  const right = Number(arg('right', 0)); // 0 → до правого края

  const browser = await puppeteer.launch({ executablePath, headless: 'new' });
  const page = await browser.newPage();
  await page.goto('about:blank');

  // Как и в diff.js: file://-картинка «портит» canvas, передаём data-URI
  const uri = 'data:image/png;base64,'
    + fs.readFileSync(path.resolve(file)).toString('base64');

  const bands = await page.evaluate((u, L, R) => new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      const r = R || c.width;
      const w = r - L;
      const d = c.getContext('2d').getImageData(L, 0, w, c.height).data;

      const out = [];
      let start = null;
      for (let y = 0; y < c.height; y++) {
        let ink = 0;
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          // «Чернила» — заметно темнее кремового фона #F2EADF
          if (d[i] < 200 || d[i + 1] < 190) ink++;
        }
        if (ink > 0 && start === null) start = y;
        if (ink === 0 && start !== null) { out.push([start, y - 1]); start = null; }
      }
      if (start !== null) out.push([start, c.height - 1]);
      res(out);
    };
    img.src = u;
  }), uri, left, right);

  console.log(`${file} — колонка x ${left}..${right || '→'}, строки с текстом:`);
  console.log('  ' + bands.map(([a, b]) => `${a}-${b}`).join('  '));

  await browser.close();
})();
