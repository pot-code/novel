import { EventEmitter } from 'events';
import { isObject } from 'lodash';
import path from 'path';
import { BaseLogger } from 'pino';
import { Worker } from 'worker_threads';

import { getRealIndex } from '../../util/common';
import { log } from '../../util/log';
import {
  DownloadInit,
  DownloadProgress,
  DownloadTask,
  ObservableDataSource,
  ObservableDownloader,
  ResultWriter,
  WorkerData,
  WorkerResponse,
} from '../types';

class WorkerManager extends EventEmitter {
  private workers: Worker[] = [];
  private ready: Worker[] = [];

  constructor() {
    super();
  }

  addWorker(w: Worker) {
    w.on('message', (data) => {
      if (isObject(data)) {
        this.emit('data', data);
      }
      this.ready.push(w);
      this.emit('ready');
    });
    w.on('error', (err) => {
      this.emit('error', err);
      this.ready.push(w);
      this.emit('ready');
    });
    this.workers.push(w);
  }

  async getWorker(): Promise<Worker> {
    if (this.ready.length > 0) {
      return this.ready.pop();
    }
    return new Promise((res) => {
      this.once('ready', () => {
        res(this.ready.pop());
      });
    });
  }

  private async terminate() {
    for (const w of this.workers) {
      await w.terminate();
    }
  }

  async close(): Promise<void> {
    return new Promise(async (res) => {
      if (this.ready.length === this.workers.length) {
        await this.terminate();
        res();
      } else {
        this.on('ready', async () => {
          if (this.ready.length === this.workers.length) {
            await this.terminate();
            res();
          }
        });
      }
    });
  }
}

// omit:
// - progress
// - fail
// - init
export class MultiThreadDownloader extends ObservableDownloader {
  private logger: BaseLogger;
  private manager: WorkerManager;
  private failed = 0;

  constructor(
    private readonly worker: number,
    private readonly dataSource: ObservableDataSource<Promise<string>>,
    private readonly writer: ResultWriter,
    private readonly browserEndpoint: string,
    private readonly url: string,
    private readonly skip: number,
    private readonly limit: number,
    private readonly delay: number,
    private readonly timeout: number,
    private readonly content: string,
    private readonly title: string,
  ) {
    super();
    dataSource.once('init', (data: DownloadInit) => {
      this.emit('init', { total: Math.min(data.total - skip, this.limit) } as DownloadInit);
    });
    this.manager = new WorkerManager();
    this.logger = log.child({ module: MultiThreadDownloader.name });
  }

  onWorkerResponse = (data: WorkerResponse) => {
    const realIndex = data.index; // because the index is set as real before, the worker will keep it intact
    if (!data.payload) {
      this.failed++;
      this.logger.error({ error: data.error, index: realIndex }, 'failed task');
      this.emit('fail', realIndex);
      return;
    }

    try {
      this.writer.writePart(realIndex, data.payload);
      this.emit('progress', {
        index: realIndex,
        title: data.payload[0],
      } as DownloadProgress);
    } catch (error) {
      this.logger.error(
        {
          index: realIndex,
          error: error.message,
          stack: error.stack,
        },
        'failed to write result',
      );
    }
  };

  async download(): Promise<void> {
    const manager = this.manager;
    const dataSource = this.dataSource;
    const writer = this.writer;

    let loop = true;

    this.initWorkers();

    manager.on('data', this.onWorkerResponse);
    manager.on('error', (error) => {
      loop = false;
      this.logger.error({ stack: error.stack, message: error.message }, 'worker error');
    });

    let index = 0;
    try {
      while (loop) {
        const url = await dataSource.next();
        // indicate ending
        if (url === '') {
          this.logger.debug('read all urls');
          break;
        }

        if (index < this.skip) {
          index++;
          continue;
        }

        const realIndex = getRealIndex(index, this.skip);
        this.logger.debug({ url }, 'processing url');
        if (writer.exists(realIndex)) {
          this.logger.info({ index: index }, 'skipping part');
          this.emit('progress', {
            index: realIndex,
            title: 'skip',
          } as DownloadProgress);
        } else {
          const worker = await manager.getWorker();
          worker.postMessage({
            index: realIndex,
            url: url,
          } as DownloadTask);
        }

        index++;
        if (index - this.skip >= this.limit) {
          break;
        }
      }
    } catch (error) {
      this.logger.error({ error: error.message }, 'failed to download');
      throw error;
    } finally {
      await manager.close();
    }

    if (this.failed > 0) {
      throw new Error(`${this.failed} tasks failed`);
    }
    try {
      writer.flush();
    } catch (error) {
      this.logger.error({ error: error.message }, 'failed to write results');
      throw error;
    }
  }

  private initWorkers() {
    for (let i = this.worker; i > 0; i--) {
      this.manager.addWorker(
        new Worker(path.join(__dirname, 'worker.js'), {
          workerData: {
            endpoint: this.browserEndpoint,
            content: this.content,
            title: this.title,
            delay: this.delay,
            timeout: this.timeout,
          } as WorkerData,
        }),
      );
    }
  }
}
