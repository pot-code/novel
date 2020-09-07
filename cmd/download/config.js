const Ajv = require('ajv');
const fs = require('fs').promises;

const ajv = new Ajv();

const BASE_REQUIRED = [
  'title',
  'content',
  'limit',
  'wait',
  // "dest",
  // "append",
  // "headless",
];
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
  // split: {
  //   type: 'boolean',
  // },
  wait: {
    type: 'integer',
    minimum: 0,
  },
  // dest: {
  //   type: "string",
  // },
  append: {
    type: 'boolean',
  },
  headless: {
    type: 'boolean',
  },
};

const validator_with_heading = ajv.compile({
  required: [...BASE_REQUIRED, 'heading', 'next'],
  properties: {
    heading: {
      type: 'string',
    },
    next: {
      type: 'string',
    },
    ...BASE_PROP,
  },
});
const validator_with_catalog = ajv.compile({
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
  const validator = config.catalog ? validator_with_catalog : validator_with_heading;
  const valid = validator(config);
  if (!valid) {
    throw new Error(ajv.errorsText(validator.errors));
  }
}

function combine_args(config, args) {
  const { debug } = args;
  return Object.assign(
    {
      // if debug is on, expose the underlaying browser(headless: false)
      headless: !debug,
    },
    config
  );
}

async function load_config(path) {
  const buf = await fs.readFile(path);
  let config = JSON.parse(buf.toString());
  let limit = config.limit === -1 ? Infinity : config.limit;
  config.limit = limit;
  return config;
}

module.exports = {
  validate_config,
  combine_args,
  load_config,
};
