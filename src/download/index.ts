import Joi from 'joi';
import os from 'os';
import fs from 'fs';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs/yargs';

import { download } from './download';
import template from './template.json';
import { getLogDst, log, setLevel } from '../util/log';
import { DIAGNOSE_PATH } from '../constants';

const argSchema = Joi.object({
  worker: Joi.number().integer().min(0),
  timeout: Joi.number().integer().min(1000),
}).unknown(true);

yargs(hideBin(process.argv))
  // .usage(`Usage: $0 <command> [options]`)
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
          describe: `Save location(default to ${process.cwd()}/output.txt)`,
          default: 'output.txt',
        })
        .option('template', {
          alias: 'T',
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
        .option('timeout', {
          alias: 't',
          type: 'number',
          default: 30000, // ms
          describe: 'set the timeout for page navigating',
        })
        .option('headless', {
          alias: 'H',
          type: 'boolean',
          default: true,
          describe: 'set headless mode',
        })
        .option('debug', {
          alias: 'd',
          type: 'boolean',
          default: false,
          describe: 'set diagnose logging level',
        })
        .conflicts('config', 'template')
        .check((args) => {
          if (!args.template && !args.config) {
            throw new Error('config file must be provided');
          }

          const { error } = argSchema.validate(args);
          if (error) {
            throw new Error(error.message);
          }
          return true;
        }),
    async (parsed) => {
      const {
        config: configPath,
        debug,
        out,
        template: printTemplate,
        worker,
        headless,
        timeout,
      } = parsed;

      if (printTemplate) {
        process.stdout.write(JSON.stringify(template, null, 2));
        process.stdout.write('\n');
        return;
      }

      if (debug) {
        setLevel('debug');
      }

      if (!fs.existsSync(DIAGNOSE_PATH)) {
        fs.mkdirSync(DIAGNOSE_PATH);
      }

      try {
        await download(configPath, worker, out, headless, timeout);
        fs.rmdirSync(DIAGNOSE_PATH, {
          recursive: true,
        });
        fs.rmSync(getLogDst());
      } catch (error) {
        log.error({ stack: error.stack }, error.message);
        process.stderr.write(`${error.message}, check ${getLogDst()} for more details`);
        process.stderr.write('\n');
      }
    },
  )
  .demandCommand(1, 'Pass --help to see all available commands and options.').argv;