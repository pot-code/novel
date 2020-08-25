const ora = require('ora');
const fs = require('fs').promises;
const { F_OK } = require('fs').constants;
const { blueBright, greenBright, red } = require('chalk');
const os = require('os');
const { Worker } = require('worker_threads');
const { join, resolve } = require('path');
const inquirer = require('inquirer');

const { empty_filter } = require('./filter');
const {
  close_browser,
  get_page,
  get_browser,
  goto_with_retry,
  extract_content,
  sleep,
  write_chapter,
  timestamp,
} = require('../../lib');
const { ajv, validator_with_catalog, validator_with_heading } = require('./validate');
const { DATA, navigate, set_done, ERROR } = require('./action');

const SPINNER_COLORS = ['blue', 'cyan', 'gray', 'green', 'magenta', 'red', 'white', 'yellow'];

const WorkerStatus = {
  IDLE: 0x01,
  RUNNING: 0x02,
  ERR: 0x04,
};

class WorkerWrapper {
  constructor(worker) {
    this.worker = worker;
    this.status = WorkerStatus.IDLE;
    this.error = null;
  }
  set_error(error) {
    this.status = WorkerStatus.ERR;
    this.error = error;
  }
}

async function* get_chapter_with_catalog_gen(config, page) {
  const { limit } = config;
  const { url: catalog_url, selector, skip } = config.catalog;

  const goto = goto_with_retry(page, 3, 10 * 1e3);
  await goto(catalog_url);
  let chapter_list = await page.evaluate((item) => {
    return Array.from(document.querySelectorAll(item)).map((e) => e.href);
  }, selector);
  chapter_list = chapter_list.slice(skip);

  const length = chapter_list.length;
  const total = limit === Infinity ? length : limit > length ? length : limit;
  // const total = limit === Infinity ? chapter_list.length : limit;
  yield { url: '', total, current: 0 };
  for (let i = 0; i < total; i++) {
    const url = chapter_list[i];
    yield { url, total, current: i };
  }
}

async function* get_chapter_with_heading_gen(config, page) {
  const { heading, next, limit } = config;

  let url = heading;
  let current = 0;
  const total = limit === Infinity ? -1 : limit;
  yield { url: '', total, current };
  while (true) {
    yield { url, total, current };
    url = await page.evaluate((next) => {
      const trigger = document.querySelector(next);
      if (trigger !== null) {
        return trigger.href;
      }
      return '';
    }, next);
    current++;
    if (!url || current > limit) {
      break;
    }
  }
}

function has_catalog(config) {
  const { catalog } = config;
  return !!catalog && !!catalog.url;
}

async function get_chapter_iterator(config, page) {
  return has_catalog(config) ? get_chapter_with_catalog_gen(config, page) : get_chapter_with_heading_gen(config, page);
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
  const { wait, headless } = config;
  const browser = await get_browser(headless);
  const page = await get_page(browser);
  const chapter_ite = await get_chapter_iterator(config, page);
  await chapter_ite.next(); // skip initial value
  while (true) {
    let { value, done } = await chapter_ite.next();
    if (done) {
      break;
    }
    const { url, current } = value;
    try {
      const [title, lines] = await extract_content(url, config, page);
      if (onchange) {
        onchange(value, title, lines);
      }
      await write_chapter(title, lines, out, empty_filter);
      if (wait !== null && wait > 0) {
        await sleep(wait);
      }
    } catch (e) {
      const screenshot_path = resolve(`shot_${timestamp()}.jpeg`);
      await page.screenshot({
        path: screenshot_path,
      });
      e.message = `Error while processing '${url}': ${e.message}
    screenshot has been saved to '${screenshot_path}'`;
      throw e;
    }
  }
  out.close();
}

/**
 * @param {*} config meta data for novel fetching
 * @param {*} out output stream
 * @param {*} onchange will be called while iterating chapters
 */
async function concurrent_download_novel(config, out, worker_number, onchange) {
  const { headless } = config;
  const browser = await get_browser(headless);
  const page = await get_page(browser);
  const endpoint = browser.wsEndpoint();
  const chapter_ite = await get_chapter_iterator(config, page);

  // check immediate done
  let { value, done } = await chapter_ite.next();
  if (done) {
    return;
  }

  const total = value.total; // total number of chapters
  if (total === 0) {
    return;
  }
  const contents = new Array(total);
  const workers = new Array(worker_number);
  const worker_init_data = Object.assign(
    {
      endpoint,
    },
    config
  );
  for (let i = 0; i < worker_number; i++) {
    const worker = new Worker(join(__dirname, './worker.js'), {
      workerData: worker_init_data,
    });
    const wrapper = new WorkerWrapper(worker);
    worker.on('message', async (action) => {
      const { type, payload } = action;
      if (type === DATA) {
        const index = payload.meta.current;
        contents[index] = payload;
        wrapper.status = WorkerStatus.IDLE;
      } else if (type === ERROR) {
        wrapper.set_error(payload);
      } else {
        wrapper.set_error(new Error(`Error while processing worker data: unsupported action type '${type}'`));
      }
    });
    worker.once('error', (err) => {
      wrapper.set_error(err);
    });
    workers[i] = wrapper;
  }

  async function stop_workers() {
    for (let wrapper of workers) {
      await wrapper.worker.terminate();
    }
  }

  let cursor = 0;
  while (cursor < total) {
    await sleep(300);
    for (let worker_wrapper of workers) {
      if (worker_wrapper.status === WorkerStatus.IDLE) {
        const { value, done } = await chapter_ite.next();
        if (done) {
          worker_wrapper.worker.postMessage(set_done());
          continue;
        }
        worker_wrapper.status = WorkerStatus.RUNNING;
        worker_wrapper.worker.postMessage(navigate(value));
      } else if (worker_wrapper.status === WorkerStatus.ERR) {
        await stop_workers();
        throw worker_wrapper.error;
      }
    }
    while (cursor < total && contents[cursor] !== undefined) {
      const { meta, title, lines } = contents[cursor];
      if (onchange) {
        onchange(meta, title, lines, -1);
      }
      await write_chapter(title, lines, out, empty_filter);
      contents[cursor] = null; // leave it to GC
      cursor++;
    }
  }
  await stop_workers();
}

async function read_config(path) {
  const buf = await fs.readFile(path);
  let config = null;
  try {
    config = JSON.parse(buf.toString());
    validate_config(config);
  } catch (error) {
    error.message = `Failed to parse config file(${path}): ${error.message}`;
    throw error;
  }

  let limit = config.limit === -1 ? Infinity : config.limit;
  config.limit = limit;
  return config;
}

async function create_output(dest) {
  let append = false;
  // check existence
  try {
    await fs.access(dest, F_OK);
    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'op',
        message: `'${dest}' already exists, what to do now`,
        choices: ['overwrite', 'append', 'abort'],
      },
    ]);
    if (answers['op'] === 'append') {
      append = true;
    } else if (answers['op'] === 'abort') {
      process.exit(0);
    }
  } catch (e) {
    // output file not exists
  }
  return await fs.open(dest, append ? 'a' : 'w');
}

async function cmd_download_novel(config_path, dest, worker_number, debug) {
  let config = null;
  try {
    config = await read_config(config_path);
  } catch (error) {
    console.error(red(error.message));
    process.exit(1);
  }

  // if debug is on, expose the underlaying browser(headless: false)
  config['headless'] = !debug;
  if (config.limit === 0) {
    console.log(greenBright('Nothing to fetch(limit is 0)'));
    return;
  }

  let out;
  try {
    out = await create_output(dest);
  } catch (e) {
    console.error(red('Failed to create output file: ', e.message));
    return;
  }

  if (worker_number === 0 || !has_catalog(config)) {
    const spinner = ora(blueBright('Preparing...')).start();
    try {
      await download_novel(config, out, ({ current, total }, title, lines) => {
        spinner.color = SPINNER_COLORS[current % SPINNER_COLORS.length];
        spinner.text = `[${current + 1}/${total}]Fetching ${title}[ln:${lines.length}]`;
      });
      spinner.succeed(greenBright(`novel has been saved to '${dest}'`));
    } catch (e) {
      spinner.fail(red(e.message));
    }
  } else {
    const cpu_count = os.cpus().length;
    worker_number = worker_number > cpu_count ? cpu_count : worker_number;

    const spinner = ora(blueBright('Preparing...')).start();
    try {
      await concurrent_download_novel(config, out, worker_number, ({ current, total }, title, lines, thread_id) => {
        spinner.color = SPINNER_COLORS[current % SPINNER_COLORS.length];
        spinner.text = `[${current + 1}/${total}]Fetching ${title}[ln:${lines.length}]`;
      });
      spinner.succeed(greenBright(`novel has been saved to '${dest}'`));
    } catch (e) {
      spinner.fail(red(e.message));
    }
  }
  await close_browser();
}

function export_template() {
  const template = require('./config.template.json');
  const str = JSON.stringify(template, null, 2);

  process.stdout.write(str + '\n', (err) => {
    if (err) {
      console.error(red(`Failed to export tempalte: ${err.message}`));
    }
  });
}

module.exports = {
  download_novel,
  cmd_download_novel,
  export_template,
};
