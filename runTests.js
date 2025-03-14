// runTests.js
const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
    const browser = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    const testHtmlPath = 'file://' + path.resolve(__dirname, 'test.html');
    await page.goto(testHtmlPath);
    await page.waitForFunction('window.mochaFinished === true', { timeout: 10000 }).catch(() => {});
    const failures = await page.evaluate(() => window.mochaFailures);
    
    await browser.close();
    if (failures > 0) {
        console.error(`Tests failed with ${failures} failure(s).`);
        process.exit(1);
    } else {
        console.log('All tests passed.');
        process.exit(0);
    }
})();