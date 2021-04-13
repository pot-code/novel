import fs from 'fs';
import Joi from 'joi';
import os from 'os';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs/yargs';

import { CommandError } from '../errors';
import { getLogDst, log, setLevel } from '../util/log';
import { download } from './download';
import template from './template.json';

const argSchema = Joi.object({
  worker: Joi.number().integer().min(0),
  timeout: Joi.number().integer().min(800),
}).unknown(true);

yargs(hideBin(process.argv))
  .version()
  .alias('help', 'h')
  .alias('version', 'v')
  .command(
    'download',
    'download novel with the given config',
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
          describe: `save location.(default to ${process.cwd()}/output.txt)`,
          default: 'output.txt',
        })
        .option('template', {
          alias: 'T',
          type: 'boolean',
          describe: 'export config template.(default to stdout)',
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

      try {
        await download(configPath, worker, out, headless, timeout);
        if (debug) {
          process.stderr.write(`debug log has been written to ${getLogDst()}\n`);
        } else {
          fs.rmSync(getLogDst(), { force: true });
        }
      } catch (error) {
        if (error instanceof CommandError) {
          process.stderr.write(error.message);
        } else {
          process.stderr.write(`${error.message}, check ${getLogDst()} for more details`);
        }
        log.error({ stack: error.stack }, error.message);
        process.stderr.write('\n');
      }
    },
  )
  .demandCommand(1, 'Pass --help to see all available commands and options.').argv;
