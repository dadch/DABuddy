import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox']
});
const page = await browser.newPage();
page.on('console', m => console.log('  [console]', m.type(), m.text()));
page.on('pageerror', e => console.log('  [pageerror]', e.message));
page.on('requestfailed', r => console.log('  [reqfail]', r.url(), r.failure()?.errorText));
await page.setViewport({ width: 1280, height: 900 });
await page.goto('http://localhost:3000/login');
await page.type('#username', 'admin');
await page.type('#password', 'passwort123');
await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
await page.goto('http://localhost:3000/dashboard/thesis/1');
await new Promise(r => setTimeout(r, 800));
await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll('button')).find(b => {
    const oc = b.getAttribute('onclick') || '';
    return oc.includes('openEvaluationForm(13') && oc.includes("'final'") && oc.includes('true');
  });
  if (btn) btn.click();
});
await new Promise(r => setTimeout(r, 2500));
await browser.close();
