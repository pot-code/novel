import { EventEmitter } from 'events';
import path from 'path';
import { Worker } from 'worker_threads';

import { isObject } from 'lodash';
import { BaseLogger } from 'pino';

import { InternalError } from '../../errors';
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
    const index = data.index; // because the index is set as real before, the worker will keep it intact
    if (!data.payload) {
      this.failed++;
      this.logger.error({ error: data.error, index: index }, 'worker error');
      this.emit('fail', index);
      return;
    }

    try {
      this.writer.writePart(index, data.payload);
      this.pubProgress(index, data.payload[0]);
    } catch (error) {
      this.logger.error(
        {
          index: index,
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

    let index = this.skip > 0 ? -this.skip : 0;
    try {
      while (loop) {
        const url = await dataSource.next();
        // indicate ending
        if (url === '') {
          this.logger.debug('read all urls');
          break;
        }

        if (index < 0) {
          index++;
          continue;
        }

        if (writer.exists(index)) {
          this.logger.info({ index: index }, 'skipping part');
          this.pubProgress(index, 'skip');
        } else {
          const worker = await manager.getWorker();
          worker.postMessage({
            index: index,
            url: url,
          } as DownloadTask);
        }

        index++;
        if (index >= this.limit) {
          break;
        }
      }
    } catch (error) {
      throw new InternalError(error, 'failed to download');
    } finally {
      await manager.close();
    }

    if (this.failed > 0) {
      throw new Error(`${this.failed} tasks failed`);
    }
    try {
      writer.flush();
    } catch (error) {
      throw new InternalError(error, 'failed to write results');
    }
  }

  private pubProgress(index: number, title: string) {
    this.emit('progress', {
      index: index,
      title: title,
    } as DownloadProgress);
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
