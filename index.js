#!/usr/bin/env node
const argv = require('yargs');
const os = require('os');
const cmd_download = require('./cmd/download');

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
        .option('worker', {
          alias: 'w',
          type: 'number',
          default: os.cpus().length,
          describe:
            'set the number of workers(default to core count), if you set it too high, it will be clamped to core count',
        })
        .option('debug', {
          alias: 'D',
          type: 'boolean',
          default: false,
          describe: 'set headless to false',
        })
        .conflicts('config', 'template')
        .check((args) => {
          if (!args.template && !args.config) {
            throw new Error('config file must be provided');
          }
          if (args.worker < 0) {
            throw new Error('worker number must be greater than or equal to 0');
          }
          if (args.worker.toString().indexOf('.') > -1) {
            throw new Error('worker number must be integer');
          }
          return true;
        }),
    (parsed) => {
      const { config: config_path, out, template, worker: worker_number, debug } = parsed;
      if (template) {
        cmd_download.export_template();
        return;
      }
      cmd_download.run(config_path, out, {
        worker_number,
        debug,
      });
    }
  )
  .demandCommand(1, 'Pass --help to see all available commands and options.').argv;
