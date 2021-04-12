import { EventEmitter } from 'events';
import { isObject } from 'lodash';
import path from 'path';
import { BaseLogger } from 'pino';
import { Worker } from 'worker_threads';

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
    private readonly delay: number,
    private readonly timeout: number,
    private readonly content: string,
    private readonly title: string,
  ) {
    super();
    dataSource.once('init', (data: DownloadInit) => {
      this.emit('init', data);
    });
    this.manager = new WorkerManager();
    this.logger = log.child({ module: MultiThreadDownloader.name });
  }

  onWorkerResponse = (data: WorkerResponse) => {
    if (!data.payload) {
      this.failed++;
      this.emit('fail', data.index);
      return;
    }

    try {
      this.writer.writePart(data.index, data.payload);
      this.emit('progress', {
        index: data.index,
        title: data.payload[0],
      } as DownloadProgress);
    } catch (error) {
      this.logger.error(
        {
          index: data.index,
          data: data,
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
    manager.on('error', () => {
      loop = false;
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

        this.logger.debug({ url }, 'processing url');
        if (writer.exists(index)) {
          this.logger.info({ index: index }, 'skipping part');
          this.emit('progress', {
            index: index,
            title: 'skip',
          } as DownloadProgress);
        } else {
          const worker = await manager.getWorker();
          worker.postMessage({
            index: index,
            url: url,
          } as DownloadTask);
        }
        index++;
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
    writer.flush();
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
