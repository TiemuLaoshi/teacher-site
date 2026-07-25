/**
 * Попиксельное сравнение своего скриншота с эталоном + замер краёв.
 *
 *   node tools/diff.js --a scratch/hero-r2.png --b scratch/ref-hero900.png
 *       → scratch/diff.png (карта расхождений) + профиль различий по строкам
 *
 *   node tools/diff.js --a scratch/ref-hero900.png --row 500 --edges
 *       → координаты цветовых переходов на строке 500 (замер краёв блоков)
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
const toUrl = (p) => 'file:///' + path.resolve(p).replace(/\\/g, '/');

(async () => {
  const executablePath = CHROME_CANDIDATES.find(fs.existsSync);
  if (!executablePath) throw new Error('Chrome/Edge не найден');

  const aPath = arg('a', 'scratch/hero.png');
  const bPath = arg('b', null);
  const threshold = Number(arg('threshold', 24));

  const outDir = path.resolve('scratch');
  fs.mkdirSync(outDir, { recursive: true });

  const holder = path.join(outDir, '_diff.html');
  fs.writeFileSync(holder, '<body style="margin:0"></body>');

  const browser = await puppeteer.launch({ executablePath, headless: 'new' });
  const page = await browser.newPage();
  await page.goto(toUrl(holder), { waitUntil: 'load' });

  // Картинки передаём как data-URI: file://-изображение «портит» canvas
  // (tainted), и getImageData падает с SecurityError.
  const dataUri = (p) =>
    'data:image/png;base64,' + fs.readFileSync(path.resolve(p)).toString('base64');

  const load = async (key, uri) => page.evaluate((k, u) => new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => {
      const c = document.createElement('canvas');
      c.width = i.naturalWidth; c.height = i.naturalHeight;
      c.getContext('2d').drawImage(i, 0, 0);
      window.__imgs = window.__imgs || {};
      window.__imgs[k] = c;
      res({ w: i.naturalWidth, h: i.naturalHeight });
    };
    i.onerror = () => rej(new Error('не загрузилось: ' + k));
    i.src = u;
  }), key, uri);

  const aUrl = 'A';
  const aDim = await load(aUrl, dataUri(aPath));

  // --- Режим замера краёв: где на строке (--row) или столбце (--col)
  //     меняется цвет. Строка — для горизонтальных границ, столбец — для
  //     вертикальных (высота блоков, отступы сверху). ---
  if (process.argv.includes('--edges')) {
    const col = arg('col', null);
    const row = Number(arg('row', Math.floor(aDim.h / 2)));
    const runs = await page.evaluate((u, y, thr, cx) => {
      const c = window.__imgs[u];
      const vertical = cx !== null;
      const d = vertical
        ? c.getContext('2d').getImageData(Number(cx), 0, 1, c.height).data
        : c.getContext('2d').getImageData(0, y, c.width, 1).data;
      const len = vertical ? c.height : c.width;
      const hex = (i) => '#' + [d[i], d[i + 1], d[i + 2]]
        .map((v) => v.toString(16).padStart(2, '0')).join('');
      const out = [];
      let start = 0;
      for (let x = 1; x < len; x++) {
        const i = x * 4, j = (x - 1) * 4;
        const delta = Math.abs(d[i] - d[j]) + Math.abs(d[i + 1] - d[j + 1]) + Math.abs(d[i + 2] - d[j + 2]);
        if (delta > thr) { out.push({ from: start, to: x - 1, color: hex(j) }); start = x; }
      }
      out.push({ from: start, to: len - 1, color: hex((len - 1) * 4) });
      return out;
    }, aUrl, row, threshold, col);

    const axis = col !== null ? `столбец ${col}` : `строка ${row}`;
    console.log(`${aPath} — ${axis}, участки одного цвета (длина ≥4px):`);
    runs.filter((r) => r.to - r.from >= 4)
      .forEach((r) => console.log(`  x ${String(r.from).padStart(4)}–${String(r.to).padStart(4)}  (${String(r.to - r.from + 1).padStart(4)}px)  ${r.color}`));
    await browser.close();
    return;
  }

  // --- Режим сравнения двух картинок ---
  if (!bPath) throw new Error('нужен --b <эталон> либо флаг --edges');
  const bUrl = 'B';
  const bDim = await load(bUrl, dataUri(bPath));

  // --dx/--dy сдвигают картинку A перед сравнением. Нужны, чтобы отличить
  // «блок смещён на N px» от «содержимое действительно другое».
  const dx = Number(arg('dx', 0));
  const dy = Number(arg('dy', 0));

  const res = await page.evaluate((ua, ub, thr, sx, sy) => {
    let ca = window.__imgs[ua];
    const cb = window.__imgs[ub];
    const w = Math.min(ca.width, cb.width);
    const h = Math.min(ca.height, cb.height);
    if (sx || sy) {
      const shifted = document.createElement('canvas');
      shifted.width = ca.width; shifted.height = ca.height;
      shifted.getContext('2d').drawImage(ca, sx, sy);
      ca = shifted;
    }
    const da = ca.getContext('2d').getImageData(0, 0, w, h).data;
    const db = cb.getContext('2d').getImageData(0, 0, w, h).data;

    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const octx = out.getContext('2d');
    const img = octx.createImageData(w, h);

    let diffCount = 0;
    const rows = new Array(h).fill(0);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const delta = Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
        const bad = delta > thr;
        if (bad) { diffCount++; rows[y]++; }
        // Совпадения — бледный серый фон, расхождения — красным
        const base = 235 - Math.round((255 - da[i]) * .12);
        img.data[i] = bad ? 220 : base;
        img.data[i + 1] = bad ? 30 : base;
        img.data[i + 2] = bad ? 30 : base;
        img.data[i + 3] = 255;
      }
    }
    octx.putImageData(img, 0, 0);
    return { w, h, diffCount, rows, png: out.toDataURL('image/png') };
  }, aUrl, bUrl, threshold, dx, dy);

  const outPath = path.join(outDir, arg('out', 'diff') + '.png');
  fs.writeFileSync(outPath, Buffer.from(res.png.split(',')[1], 'base64'));

  const pct = (res.diffCount / (res.w * res.h) * 100).toFixed(2);
  console.log(`Сравнение ${aPath} ↔ ${bPath}`);
  console.log(`Область ${res.w}×${res.h}, расходится ${pct}% пикселей → ${outPath}`);
  console.log(`Размеры: A ${aDim.w}×${aDim.h}, B ${bDim.w}×${bDim.h}`);

  // Полосы по 20px — видно, на какой высоте расхождения
  console.log('\nРасхождения по горизонтальным полосам (20px):');
  for (let y = 0; y < res.h; y += 20) {
    const sum = res.rows.slice(y, y + 20).reduce((a, b) => a + b, 0);
    const share = sum / (20 * res.w);
    if (share > .008) {
      const bar = '█'.repeat(Math.min(50, Math.round(share * 100)));
      console.log(`  y ${String(y).padStart(4)}–${String(y + 19).padStart(4)}  ${(share * 100).toFixed(1).padStart(5)}%  ${bar}`);
    }
  }

  await browser.close();
})();
