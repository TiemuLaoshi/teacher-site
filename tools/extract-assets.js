/**
 * Извлекает исходные картинки из бандла макета.
 *
 * В бандле (`Design_Mockup/Сайт Тимура.html`, ~9.5 МБ) ресурсы лежат картой
 *   "UUID": { "mime": "...", "compressed": false, "data": "<base64>" }
 * а в разметке подставлены как <img src="UUID">. Блок
 * <script type="__bundler/ext_resources"> при этом пустой — не обманываться.
 *
 * Заявленный mime врёт: у картинок там image/jpeg, а по сигнатуре это WebP.
 * Реальный формат определяем по магическим байтам.
 *
 *   node tools/extract-assets.js                    — список ресурсов
 *   node tools/extract-assets.js --save scratch/mockup-assets
 */
const fs = require('fs');
const path = require('path');

const BUNDLE = 'Design_Mockup/Сайт Тимура.html';
const RE = /"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})":\{"mime":"([^"]+)","compressed":(true|false),"data":"([A-Za-z0-9+/=]+)"\}/g;

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i === -1 ? fallback : process.argv[i + 1];
}

function sniff(buf) {
  const a = buf.subarray(0, 12);
  if (a[0] === 0xFF && a[1] === 0xD8) return 'jpg';
  if (a[0] === 0x89 && a.subarray(1, 4).toString() === 'PNG') return 'png';
  if (a.subarray(0, 4).toString() === 'RIFF' && a.subarray(8, 12).toString() === 'WEBP') return 'webp';
  if (a.subarray(0, 4).toString() === 'wOF2') return 'woff2';
  if (a.subarray(0, 5).toString() === '<?xml' || a.subarray(0, 4).toString() === '<svg') return 'svg';
  return 'bin';
}

const html = fs.readFileSync(path.resolve(BUNDLE), 'utf8');
const saveDir = arg('save', null);
if (saveDir) fs.mkdirSync(path.resolve(saveDir), { recursive: true });

let n = 0;
for (const m of html.matchAll(RE)) {
  const [, id, mime, compressed, b64] = m;
  const buf = Buffer.from(b64, 'base64');
  const ext = sniff(buf);
  if (ext === 'woff2') continue; // шрифты не нужны, их берём из Google Fonts

  n++;
  console.log(`${id}  mime=${mime.padEnd(11)} факт=${ext.padEnd(4)} ${(buf.length / 1024).toFixed(0).padStart(5)} КБ${compressed === 'true' ? '  (сжат)' : ''}`);
  if (saveDir) fs.writeFileSync(path.join(path.resolve(saveDir), `${id}.${ext}`), buf);
}
console.log(`\nВсего картинок: ${n}${saveDir ? ` → ${saveDir}` : ''}`);
