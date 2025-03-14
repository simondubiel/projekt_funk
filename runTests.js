// runTests.js
const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({
    headless: "new", // Opting into the new headless mode
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  // Resolve the path to the test.html file inside the tests folder.
  const testHtmlPath = 'file://' + path.resolve(__dirname, 'tests', 'test.html');
  console.log("Loading test file from:", testHtmlPath);
  
  await page.goto(testHtmlPath);

  // Wait up to 10 seconds for tests to finish.
  await page.waitForFunction('window.mochaFinished === true', { timeout: 10000 }).catch(() => {});

  // Retrieve the number of failures from the page.
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