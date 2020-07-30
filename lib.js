const puppeteer = require('puppeteer-core');

const BROWSER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/11.1.2 Safari/605.1.15';

/**
 * @param {*} fn function to be wrapped
 * @param {number} times maximum retry count
 * @param {number} delay delay between each retry
 */
function with_retry(fn, times, delay = 0) {
  console.assert(times > 0, 'times must be larger than 0');
  return async function (...args) {
    let need_retry = false;
    for (let i = 0; i < times; i++) {
      try {
        return await fn(...args);
      } catch (e) {
        need_retry = true;
      }
      if (need_retry) {
        if (delay > 24) await sleep(delay);
      }
    }
    return fn(...args);
  };
}

function goto_with_retry(page, times, timeout) {
  return with_retry(async (url) => {
    await page.goto(url, {
      timeout,
    });
  }, times);
}

async function sleep(t) {
  return new Promise((res) => {
    setTimeout(() => {
      res();
    }, t);
  });
}

/**
 * @param {*} title chapter title
 * @param {*} lines string array contains content
 * @param {*} out output stream
 * @param {*} filter filter function to filter lines that will be discard
 */
async function write_chapter(title, lines, out, filter) {
  const length = lines.length;

  // write title
  if (title) {
    await out.write(title + '\n');
  }
  // write body
  for (let i = 0; i < length; i++) {
    if (filter && filter(lines[i])) {
      continue;
    }
    await out.write('    ' + lines[i] + '\n');
  }
  await out.write('\n');
}

let browser_instance = null;
let page_instance = null;

async function get_page(headless, singleton = true) {
  if (browser_instance === null) {
    browser_instance = await puppeteer.launch({
      headless,
      executablePath: '/Applications/Chromium.app/Contents/MacOS/Chromium',
    });
  }
  if (!singleton) {
    const page = await browser_instance.newPage();
    await page.setUserAgent(BROWSER_AGENT);
    return page;
  } else if (!page_instance) {
    page_instance = await browser_instance.newPage();
    await page_instance.setUserAgent(BROWSER_AGENT);
  }
  return page_instance;
}

async function close_browser() {
  if (browser_instance) {
    await browser_instance.close();
  }
}

module.exports = {
  sleep,
  write_chapter,
  get_page,
  close_browser,
  goto_with_retry,
};
