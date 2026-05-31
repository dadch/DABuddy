// Mobile-Viewport-Screenshots.
const puppeteer = require('puppeteer-core');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://localhost:3000';
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, isMobile: true });
    await page.goto(BASE + '/login', { waitUntil: 'networkidle0' });
    await page.type('#username', 'admin');
    await page.type('#password', 'passwort123');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0' }),
      page.click('button[type="submit"]'),
    ]);
    for (const p of process.argv.slice(2)) {
      const safe = p.replace(/[\/\?\=&]/g, '_').replace(/^_+/, '') || 'dashboard';
      await page.goto(BASE + p, { waitUntil: 'networkidle0' });
      await page.screenshot({ path: '/tmp/mob-' + safe + '.png' });
      console.log('  ' + p + ' -> /tmp/mob-' + safe + '.png');
    }
    // Also: dashboard with sidebar open (via real click on hamburger)
    await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle0' });
    await page.click('.app-mobile-bar .menu-toggle');
    // Allow CSS transition (250 ms)
    await new Promise(r => setTimeout(r, 400));
    await page.screenshot({ path: '/tmp/mob-dashboard-menu.png' });
    console.log('  dashboard (menu open) -> /tmp/mob-dashboard-menu.png');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
