const puppeteer = require('puppeteer-core');
const { parentPort, workerData } = require('worker_threads');
const { resolve } = require('path');

const { extract_content, sleep } = require('../../lib');
const { set_error, NAVIGATE, DONE, set_data } = require('./action');

async function run() {
  const { endpoint, wait } = workerData;
  const browser = await puppeteer.connect({
    browserWSEndpoint: endpoint,
  });
  const page = await browser.newPage();

  async function handle_navigate(value) {
    const { url } = value;
    try {
      const [title, lines] = await extract_content(url, workerData, page);
      return {
        meta: value,
        title,
        lines,
      };
    } catch (e) {
      const now = new Date();
      const timestamp = `${now.getFullYear()}${
        now.getMonth() + 1
      }${now.getDate()}${now.getHours()}${now.getMinutes()}${now.getSeconds()}`;
      const screenshot_path = resolve(`shot_${timestamp}.jpeg`);
      await page.screenshot({
        path: screenshot_path,
      });
      e.message = `Error while processing '${url}': ${e.message}
    screenshot has been saved to '${screenshot_path}'`;
      parentPort.postMessage(set_error(e));
      process.exit(1); // exit on error
    }
  }

  parentPort.on('message', async (action) => {
    const { type, payload } = action;

    switch (type) {
      case NAVIGATE:
        const data = await handle_navigate(payload);
        await sleep(wait);
        parentPort.postMessage(set_data(data));
        break;
      case DONE:
        process.exit(0);
      default:
        parentPort.postMessage(new Error(`[worker]Error while processing message: unsupported action type '${type}'`));
    }
  });
}

run();
