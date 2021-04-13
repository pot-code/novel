import { BaseLogger } from 'pino';
import { InternalError } from '../../errors';

import { getRealIndex, sleep } from '../../util/common';
import { log } from '../../util/log';
import {
  ContentExtractor,
  DownloadInit,
  DownloadProgress,
  ExtractResult,
  ObservableDataSource,
  ObservableDownloader,
  ResultWriter,
} from '../types';

export class SingleThreadDownloader extends ObservableDownloader {
  private logger: BaseLogger;

  /**
   * @param dataSource data source
   * @param out write out
   */
  constructor(
    private readonly dataSource: ObservableDataSource<Promise<string>>,
    private readonly extractor: ContentExtractor<Promise<ExtractResult>>,
    private readonly writer: ResultWriter,
    private readonly url: string,
    private readonly skip: number,
    private readonly limit: number,
    private readonly delay: number,
  ) {
    super();
    dataSource.once('init', (data: DownloadInit) => {
      this.emit('init', { total: Math.min(data.total - skip, this.limit) } as DownloadInit);
    });
    this.logger = log.child({ module: SingleThreadDownloader.name });
  }

  async download(): Promise<void> {
    const dataSource = this.dataSource;
    const writer = this.writer;

    let index = 0;
    try {
      while (true) {
        const url = await dataSource.next();
        this.logger.debug({ url }, 'processing url');
        if (url === '') {
          break;
        }

        if (index < this.skip) {
          index++;
          continue;
        }

        const realIndex = getRealIndex(index, this.skip);
        if (writer.exists(realIndex)) {
          this.logger.info({ index: index }, 'skipping part');
          this.pubProgress(realIndex, 'skip');
        } else {
          const res = await this.extractor.extract(url);

          writer.writePart(realIndex, res);
          this.pubProgress(realIndex, res[0]);
          await sleep(this.delay);
        }

        index++;
        if (index - this.skip >= this.limit) {
          break;
        }
      }
    } catch (error) {
      throw new InternalError(error, 'failed to download');
    }

    if (index === 0) {
      return;
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
}
