/**
 * Рендер обложки для превью ссылки в мессенджерах (Этап 5.1):
 * tools/og-template.html → assets/img/og-cover.jpg, ровно 1200×630.
 *
 *   node tools/make-og.js
 *
 * JPEG, а не WebP: Telegram WebP-обложку покажет, а WhatsApp и часть
 * почтовых клиентов — нет, и превью останется пустым.
 */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];

(async () => {
  const executablePath = CHROME_CANDIDATES.find(fs.existsSync);
  if (!executablePath) throw new Error('Chrome/Edge не найден');

  const src = path.resolve('tools/og-template.html');
  const out = path.resolve('assets/img/og-cover.jpg');

  const browser = await puppeteer.launch({ executablePath, headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
  await page.goto('file:///' + src.replace(/\\/g, '/'), { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out, type: 'jpeg', quality: 88 });

  console.log(`${out} — 1200×630, ${(fs.statSync(out).size / 1024).toFixed(0)} КБ`);
  await browser.close();
})();
