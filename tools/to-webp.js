/**
 * Перегон картинок в WebP тем же системным Chrome (Этап 4.2) — отдельный
 * конвертер ставить не нужно, кодек уже есть в браузере.
 *
 *   node tools/to-webp.js assets/img/student-cabinet.png
 *   node tools/to-webp.js assets/img/foo.jpg --q 0.9 --max 1200
 *
 * Пишет рядом .webp, печатает размеры до/после. Исходник не трогает —
 * удалять его решаешь сам, после того как посмотрел результат.
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
  const src = process.argv[2];
  if (!src) throw new Error('Укажи файл: node tools/to-webp.js assets/img/foo.png');

  const quality = Number(arg('q', 0.86));
  // Ограничение по ширине: исходники бывают в 2-3 раза больше, чем нужно
  // странице, и это самый дешёвый способ уронить вес
  const maxWidth = Number(arg('max', 0));
  const out = arg('out', src.replace(/\.(png|jpe?g)$/i, '.webp'));

  const executablePath = CHROME_CANDIDATES.find(fs.existsSync);
  if (!executablePath) throw new Error('Chrome/Edge не найден');

  const browser = await puppeteer.launch({
    executablePath,
    headless: 'new',
    // Иначе canvas с file://-картинкой считается «испорченным» и не отдаёт данные
    args: ['--allow-file-access-from-files'],
  });
  const page = await browser.newPage();
  // Страницу-держатель открываем с диска: с data:-адреса origin «пустой»,
  // и картинку по file:// туда уже не пустят
  fs.mkdirSync('scratch', { recursive: true });
  const holder = path.resolve('scratch/_webp.html');
  fs.writeFileSync(holder, '<body></body>');
  await page.goto('file:///' + holder.replace(/\\/g, '/'));

  const res = await page.evaluate(async (url, q, max) => {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = max && img.width > max ? max / img.width : 1;
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return {
      w: img.width, h: img.height, ow: c.width, oh: c.height,
      data: c.toDataURL('image/webp', q).split(',')[1],
    };
  }, 'file:///' + path.resolve(src).replace(/\\/g, '/'), quality, maxWidth);

  fs.writeFileSync(out, Buffer.from(res.data, 'base64'));
  const kb = (p) => (fs.statSync(p).size / 1024).toFixed(0) + ' КБ';
  console.log(`${src} ${res.w}×${res.h} ${kb(src)}  →  ${out} ${res.ow}×${res.oh} ${kb(out)}`);

  await browser.close();
})();
