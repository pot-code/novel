const ora = require('ora');
const fs = require('fs').promises;
const { blueBright, greenBright, red } = require('chalk');

const { empty_filter } = require('./filter');
const { close_browser, get_page, goto_with_retry, sleep, write_chapter } = require('../../lib');
const { ajv, validator_with_catalog, validator_with_heading } = require('./validate');

const SPINNER_COLORS = ['blue', 'cyan', 'gray', 'green', 'magenta', 'red', 'white', 'yellow'];

async function* get_chapter_with_catalog_gen(config, page) {
  const { limit } = config;
  const { url: catalog_url, selector, skip } = config.catalog;

  const goto = goto_with_retry(page, 3, 10 * 1e3);
  await goto(catalog_url);
  const chapter_list = await page.evaluate((item) => {
    return Array.from(document.querySelectorAll(item)).map((e) => e.href);
  }, selector);

  const length = chapter_list.length;
  const ending = limit === -1 ? length : skip + limit > length ? length : skip + limit;
  const total = limit === -1 ? chapter_list.length : limit;
  for (let i = skip; i < ending; i++) {
    const url = chapter_list[i];
    yield { url, total, current: i + 1 };
  }
}

async function* get_chapter_with_heading_gen(config, page) {
  const { heading, next, limit } = config;

  let url = heading;
  let current = 1;
  const total = limit === -1 ? -1 : limit;
  while (true) {
    yield { url, total, current };
    url = await page.evaluate((next) => {
      const trigger = document.querySelector(next);
      if (trigger !== null) {
        return trigger.href;
      }
      return '';
    }, next);
    if (!url) {
      break;
    }
    current++;
  }
}

/**
 * @param {string} url chapter url
 * @param {*} config global config
 * @param {*} page puppeteer Page object
 */
async function extract_content(url, config, page) {
  const goto = goto_with_retry(page, 3, 10 * 1e3);
  await goto(url);

  const { content, title } = config;
  return await page.evaluate(
    (content, title) => {
      const $root = document.querySelector(content);
      if (!$root) {
        throw new Error(`Invalid content selector '${content}'`);
      }
      const ite = document.createNodeIterator($root, NodeFilter.SHOW_TEXT);
      const lines = [];
      while ((n = ite.nextNode())) {
        lines.push(n.textContent.trim()); // remove indent and trailing newline
      }

      const $title = document.querySelector(title);
      if (!$title) {
        throw new Error(`Invalid title selector '${title}'`);
      }
      const chapter_title = $title.innerHTML;
      return [chapter_title, lines];
    },
    content,
    title
  );
}

async function get_chapter_iterator(config, page) {
  const { catalog } = config;
  return catalog && catalog.url
    ? get_chapter_with_catalog_gen(config, page)
    : get_chapter_with_heading_gen(config, page);
}

function validate_config(config) {
  const validator = config.catalog ? validator_with_catalog : validator_with_heading;
  const valid = validator(config);
  if (!valid) {
    throw new Error('Failed to validate config: ' + ajv.errorsText(validator.errors));
  }
}

/**
 * @param {*} config meta data for novel fetching
 * @param {*} out output stream
 * @param {*} onchange will be called while iterating chapters
 */
async function download_novel(config, out, onchange) {
  validate_config(config);

  const { wait, headless } = config;

  let limit = config.limit === -1 ? Infinity : config.limit;
  if (limit === 0) {
    return;
  }

  const page = await get_page(headless);
  const chapter_ite = await get_chapter_iterator(config, page);
  let { value, done } = await chapter_ite.next();
  if (done) {
    return;
  }
  // let last_url = "";
  let count = 1;
  while (!done) {
    try {
      const { url } = value;
      // if (url === last_url) {
      //   spinner.prefixText = yellow("[Potential loop detected]");
      // }
      const [title, lines] = await extract_content(url, config, page);
      onchange(value, title, lines);
      await write_chapter(title, lines, out, empty_filter);
      if (wait !== null && wait > 0) {
        await sleep(wait);
      }
      // last_url = url;
    } catch (e) {
      e.message = `Error while processing #${value.current}(${value.url}): ${e.message}`;
      throw e;
    }
    count++;
    if (count > limit) {
      break;
    }

    const res = await chapter_ite.next();
    value = res.value;
    done = res.done;
  }
  out.close();
}

async function parse_config_file(path) {
  const buf = await fs.readFile(path);
  try {
    return JSON.parse(buf);
  } catch (error) {
    error.message = `Failed to parse config file(${path}): ${error.message})`;
    throw error;
  }
}

async function cmd_download_novel(config_path, dest) {
  let config = null;
  try {
    config = await parse_config_file(config_path);
  } catch (error) {
    console.error(red(error.message));
    process.exit(1);
  }
  const { append } = config;
  const spinner = ora(blueBright('Preparing...')).start();

  let out;
  try {
    out = await fs.open(dest, append ? 'a' : 'w');
  } catch (e) {
    console.error(red('Failed to create output file: ', e.message));
    return;
  }
  try {
    await download_novel(config, out, ({ current, total }, title, lines) => {
      spinner.color = SPINNER_COLORS[current % SPINNER_COLORS.length];
      spinner.text = `[${current}/${total}]Fetching ${title}[ln:${lines.length}]`;
    });
    spinner.succeed(greenBright(`novel has been saved to '${dest}'`));
  } catch (e) {
    spinner.fail(red(e.message));
  }
  await close_browser();
}

const template = require('./config.template.json');

function export_template() {
  return JSON.stringify(template, null, 2);
}

module.exports = {
  download_novel,
  cmd_download_novel,
  export_template,
};
