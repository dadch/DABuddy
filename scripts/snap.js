// One-shot Puppeteer screenshot: login then visit pages
const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://localhost:3000';
const USER = 'admin';
const PASS = 'passwort123';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    // Login
    await page.goto(BASE + '/login', { waitUntil: 'networkidle0' });
    await page.type('#username', USER);
    await page.type('#password', PASS);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0' }),
      page.click('button[type="submit"]'),
    ]);

    const pages = process.argv.slice(2);
    for (const p of pages) {
      const safe = p.replace(/[\/\?\=&]/g, '_').replace(/^_+/, '');
      const url = BASE + p;
      const out = '/tmp/snap-' + (safe || 'dashboard') + '.png';
      await page.goto(url, { waitUntil: 'networkidle0' });
      await page.screenshot({ path: out, fullPage: false });
      console.log('  ' + p + ' -> ' + out);
    }
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
