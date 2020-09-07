const Ajv = require("ajv");
const ajv = new Ajv();

const BASE_REQUIRED = [
  "title",
  "content",
  "limit",
  "wait",
  // "dest",
  // "append",
  // "headless",
];
const BASE_PROP = {
  content: {
    type: "string",
  },
  title: {
    type: "string",
  },
  limit: {
    type: "integer",
    minimum: -1,
  },
  split: {
    type: "boolean",
  },
  wait: {
    type: "integer",
    minimum: 0,
  },
  // dest: {
  //   type: "string",
  // },
  append: {
    type: "boolean",
  },
  headless: {
    type: "boolean",
  },
};

const validator_with_heading = ajv.compile({
  required: [...BASE_REQUIRED, "heading", "next"],
  properties: {
    heading: {
      type: "string",
    },
    next: {
      type: "string",
    },
    ...BASE_PROP,
  },
});
const validator_with_catalog = ajv.compile({
  required: [...BASE_REQUIRED, "catalog"],
  properties: {
    catalog: {
      type: "object",
      required: ["url", "selector", "skip"],
      properties: {
        url: {
          type: "string",
          minLength: 1,
        },
        selector: {
          type: "string",
          minLength: 1,
        },
        skip: {
          type: "integer",
          minimum: 0,
        },
      },
    },
    ...BASE_PROP,
  },
});

module.exports = {
  ajv,
  validator_with_catalog,
  validator_with_heading,
};
