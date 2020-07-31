#!/usr/bin/env node
const argv = require('yargs');
const { cmd_download_novel, export_template } = require('./cmd/download');

argv
  .scriptName('novel')
  .usage('Usage: $0 <command> [options]')
  .version()
  .alias('help', 'h')
  .alias('version', 'v')
  .command(
    'download',
    'Download novel with given config',
    (yargs) =>
      yargs
        .option('config', {
          alias: 'c',
          type: 'string',
          describe: 'Config file path',
        })
        .option('out', {
          alias: 'o',
          type: 'string',
          describe: 'Save location(default to $(pwd)/output.txt)',
          default: 'output.txt',
        })
        .option('template', {
          alias: 't',
          type: 'boolean',
          describe: 'Export config template(default to stdout)',
        })
        .conflicts('config', 'template')
        .check((args) => {
          if (!args.template && !args.config) {
            throw new Error('config file must be provided');
          }
          return true;
        }),
    (parsed) => {
      const { config, out, template } = parsed;
      if (template) {
        export_template();
        return;
      }
      cmd_download_novel(config, out);
    }
  )
  .demandCommand(1, 'Pass --help to see all available commands and options.').argv;
