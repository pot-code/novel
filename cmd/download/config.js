const Ajv = require('ajv');
const os = require('os');
const fs = require('fs');

const { find_chrome_executable } = require('../../lib');

const ajv = new Ajv();

const BASE_REQUIRED = ['title', 'content', 'limit', 'wait'];
const BASE_PROP = {
  content: {
    type: 'string',
  },
  title: {
    type: 'string',
  },
  limit: {
    type: 'integer',
    minimum: -1,
  },
  wait: {
    type: 'integer',
    minimum: 0,
  },
};

const manual_validator = ajv.compile({
  required: [...BASE_REQUIRED, 'manual'],
  properties: {
    manual: {
      type: 'object',
      required: ['url', 'next'],
      properties: {
        url: {
          type: 'string',
          minLength: 1,
        },
        next: {
          type: 'string',
          minLength: 1,
        },
      },
    },
    ...BASE_PROP,
  },
});

const catalog_validator = ajv.compile({
  required: [...BASE_REQUIRED, 'catalog'],
  properties: {
    catalog: {
      type: 'object',
      required: ['url', 'selector', 'skip'],
      properties: {
        url: {
          type: 'string',
          minLength: 1,
        },
        selector: {
          type: 'string',
          minLength: 1,
        },
        skip: {
          type: 'integer',
          minimum: 0,
        },
      },
    },
    ...BASE_PROP,
  },
});

function validate_config(config) {
  const validator = config.catalog ? catalog_validator : manual_validator;
  const valid = validator(config);
  if (!valid) {
    throw new Error(ajv.errorsText(validator.errors));
  }
}

function combine_args(config, args) {
  let { debug, worker_number, path } = args;

  const cpu_count = os.cpus().length;
  worker_number = worker_number > cpu_count ? cpu_count : worker_number;

  let chrome_executable = path;
  if (chrome_executable === '' || chrome_executable === undefined) {
    chrome_executable = find_chrome_executable();
  }

  return Object.assign(
    {
      // if debug is on, reveal the underlaying browser(headless: false)
      headless: !debug,
      worker_number,
      chrome_executable,
    },
    config
  );
}

function load_config(path) {
  const buf = fs.readFileSync(path);
  let config = JSON.parse(buf.toString());
  let limit = config.limit === -1 ? Infinity : config.limit;
  config.limit = limit;
  return config;
}

function has_catalog(config) {
  const { catalog } = config;
  return !!catalog && !!catalog.url;
}

function has_manual(config) {
  const { manual } = config;
  return !!manual && !!manual.url;
}

module.exports = {
  validate_config,
  combine_args,
  load_config,
  has_catalog,
  has_manual,
};
