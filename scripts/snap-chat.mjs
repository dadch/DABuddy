import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox']
});
const page = await browser.newPage();
page.on('pageerror', e => console.log('  [err]', e.message));
await page.setViewport({ width: 1280, height: 800 });
await page.goto('http://localhost:3000/login');
await page.type('#username', 'admin');
await page.type('#password', 'passwort123');
await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
await page.goto('http://localhost:3000/dashboard/thesis/14/chat');
await new Promise(r => setTimeout(r, 1500));
await page.screenshot({ path: '/tmp/chat-all.png', fullPage: false });

// Suchen nach "Pflichtenheft"
await page.type('#chatSearch', 'pflicht');
await new Promise(r => setTimeout(r, 400));
await page.screenshot({ path: '/tmp/chat-search-hit.png', fullPage: false });

// Suchen nach etwas, das nicht existiert
await page.evaluate(() => { document.getElementById('chatSearch').value = 'xyz123'; document.getElementById('chatSearch').dispatchEvent(new Event('input')); });
await new Promise(r => setTimeout(r, 400));
await page.screenshot({ path: '/tmp/chat-search-empty.png', fullPage: false });

await browser.close();
