#!/usr/bin/env node
const argv = require('yargs');
const { cmd_download_novel, export_template } = require('./cmd/download');

argv
  .usage('novel <command> [options]')
  .version('1.0.1')
  .command(
    'download',
    'download novel with given config',
    (yargs) =>
      yargs
        .option('config', {
          alias: 'c',
          type: 'string',
          describe: 'config file path',
        })
        .option('out', {
          alias: 'o',
          type: 'string',
          describe: 'save destination(default to cwd/output.txt)',
          default: 'output.txt',
        })
        .option('template', {
          alias: 't',
          type: 'boolean',
          describe: 'export empty template(default to stdout)',
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
        process.stdout.write(export_template() + '\n');
        return;
      }
      cmd_download_novel(config, out);
    }
  )
  .demandCommand(1, 'Use "novel <command> --help" for more information about a given command.').argv;
