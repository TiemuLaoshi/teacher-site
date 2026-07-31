/**
 * Локальный просмотр сайта: node tools/serve.js [порт]
 *
 * Нужен, потому что через file:// страница ведёт себя не как на проде
 * (иначе считаются пути, запрещён fetch — упрётся на Этапе 3 с API
 * бронирования). Отдаёт папку проекта как есть, без кеша, и печатает
 * адрес в локальной сети — по нему можно открыть сайт с телефона.
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const port = Number(process.argv[2] || 5173);
const root = path.resolve(__dirname, '..');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  let file = path.join(root, rel === '/' ? 'index.html' : rel);

  // Не выпускать за пределы папки проекта
  if (!file.startsWith(root)) {
    res.writeHead(403).end('403');
    return;
  }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    file = path.join(file, 'index.html');
  }
  if (!fs.existsSync(file)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404: ' + rel);
    return;
  }

  res.writeHead(200, {
    'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
    // Без кеша: правишь CSS — обновил страницу и сразу видно
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(file).pipe(res);
}).listen(port, () => {
  const lan = Object.values(os.networkInterfaces()).flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
  console.log(`Сайт: http://localhost:${port}`);
  lan.forEach((ip) => console.log(`С телефона (та же сеть): http://${ip}:${port}`));
  console.log('Остановить — Ctrl+C');
});
