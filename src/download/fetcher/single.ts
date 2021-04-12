import { BaseLogger } from 'pino';

import { sleep } from '../../util/common';
import { log } from '../../util/log';
import { DefaultContentExtractor } from '../extract';
import { DataSource, DownloadProgress, ObservableDownloader, ResultWriter } from '../types';

export class SingleThreadDownloader extends ObservableDownloader {
  private logger: BaseLogger;

  /**
   * @param dataSource data source
   * @param out write out
   */
  constructor(
    private readonly dataSource: DataSource<Promise<string>>,
    private readonly extractor: DefaultContentExtractor,
    private readonly writer: ResultWriter,
    private readonly url: string,
    private readonly delay: number,
  ) {
    super();
    this.logger = log.child({ module: SingleThreadDownloader.name });
  }

  async download(): Promise<void> {
    const dataSource = this.dataSource;
    const writer = this.writer;

    let count = 0;
    try {
      while (true) {
        const url = await dataSource.next();
        this.logger.debug({ url }, 'processing url');
        if (url === '') {
          break;
        }

        if (writer.exists(count)) {
          this.logger.info({ index: count }, 'skipping part');
          this.emit('progress', {
            index: count,
            title: 'skip',
          } as DownloadProgress);
          count++;
          continue;
        }

        const res = await this.extractor.extract(url);
        writer.writePart(count, res);
        this.emit('progress', {
          index: count,
          title: res[0],
        } as DownloadProgress);
        await sleep(this.delay);
        count++;
      }
    } catch (error) {
      this.logger.error({ error: error.message }, 'failed to download');
      throw error;
    }

    if (count === 0) {
      return;
    }

    try {
      writer.flush();
    } catch (error) {
      this.logger.error({ error: error.message }, 'failed to combine results');
      throw error;
    }
  }
}
