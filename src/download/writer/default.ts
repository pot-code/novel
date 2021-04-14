import { createHash } from 'crypto';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  writeFileSync,
} from 'fs';
import os from 'os';
import path from 'path';

import { BaseLogger } from 'pino';

import { InternalError } from '../../errors';
import { log } from '../../util/log';
import { ExtractResult, ResultWriter } from '../types';

export class DefaultResultWriter implements ResultWriter {
  private outDir: string;
  private logger: BaseLogger;

  /**
   * @param dataSource data source
   * @param out write out
   */
  constructor(
    private readonly id: string,
    private readonly out: string,
    private readonly limit: number,
  ) {
    this.logger = log.child({ module: DefaultResultWriter.name });
    this.createDir(id);
  }

  writePart(index: number, res: ExtractResult): void {
    const file = path.join(this.outDir, String(index));
    const data = this.combineExtractResult(res);

    try {
      this.logger.debug({ file }, 'write part');
      writeFileSync(file, data);
    } catch (error) {
      this.logger.error({ error: error.message, part: file }, 'failed to write part');
      throw new InternalError(error, 'failed to write part');
    }
  }

  flush(): void {
    const dir = this.outDir;
    const tmp = path.join(dir, 'tmp');
    const out = this.out;

    let list = readdirSync(dir);
    this.logger.debug('re-arrange parts');
    list.sort(function (a: string, b: string) {
      return parseInt(a, 10) - parseInt(b, 10);
    });
    if (list.length > this.limit) {
      list = list.slice(0, this.limit);
    }
    for (const p of list) {
      this.logger.debug({ part: p }, 'merging parts');
      appendFileSync(tmp, readFileSync(path.join(dir, p)).toString());
    }

    this.logger.debug({ old: tmp, new: out }, 'rename output');
    renameSync(tmp, out);

    this.cleanup();
  }

  exists(index: number): boolean {
    const file = path.join(this.outDir, String(index));
    return existsSync(file);
  }

  private combineExtractResult(res: ExtractResult): string {
    const title = res[0];

    let lines = res[1];
    lines = lines.map((line) => `\t${line}`);

    return title + os.EOL + lines.join(os.EOL) + os.EOL + os.EOL;
  }

  private createDir(id: string) {
    const md5 = createHash('md5');
    md5.update(id);
    const name = md5.digest('hex');

    this.outDir = name;
    this.logger.debug({ dir: name }, 'create temporary dir');
    if (existsSync(name)) {
      return;
    }

    try {
      mkdirSync(name);
    } catch (error) {
      this.logger.error({ error: error.message, dir: name }, 'failed to create temporary dir');
      throw new InternalError(error, 'failed to create temporary dir');
    }
  }

  private cleanup(): void {
    const dir = this.outDir;
    if (dir) {
      try {
        this.logger.debug({ dir }, 'remove temporary dir');
        rmdirSync(dir, { recursive: true });
      } catch (error) {
        this.logger.error({ error: error.message, dir }, 'failed to clean dir');
        throw new InternalError(error, 'failed to clean dir');
      }
    }
  }
}
