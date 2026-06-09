import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox']
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
await page.goto('http://localhost:3000/login');
await page.type('#username', 'admin');
await page.type('#password', 'passwort123');
await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
await page.goto('http://localhost:3000/dashboard/thesis/1');
await new Promise(r => setTimeout(r, 800));
await page.screenshot({ path: '/tmp/td-full.png', fullPage: true });
await browser.close();
