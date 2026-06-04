import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox']
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
await page.goto('http://localhost:3000/login');
await page.type('#username', 'admin');
await page.type('#password', 'passwort123');
await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
await page.goto('http://localhost:3000/dashboard/thesis/1');
await new Promise(r => setTimeout(r, 800));
// Klick auf "ausfüllen" für final phase im TM 13
const clicked = await page.evaluate(() => {
  const buttons = Array.from(document.querySelectorAll('button'));
  // Suche Button mit onclick wie openEvaluationForm(13, 'final', true)
  const btn = buttons.find(b => {
    const oc = b.getAttribute('onclick') || '';
    return oc.includes('openEvaluationForm(13') && oc.includes("'final'") && oc.includes('true');
  });
  if (btn) { btn.click(); return true; }
  return false;
});
console.log('clicked:', clicked);
await new Promise(r => setTimeout(r, 1500));
await page.screenshot({ path: '/tmp/eval-final.png', fullPage: false });
await browser.close();
