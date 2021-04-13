import { rmSync, existsSync } from 'fs';
import { getLogDst } from '../../../util/log';
import {
  ContentExtractor,
  DownloadProgress,
  ExtractResult,
  ObservableDataSource,
  ResultWriter,
} from '../../types';
import { SingleThreadDownloader } from '../single';

class MockDataSource extends ObservableDataSource<Promise<string>> {
  async next(): Promise<string> {
    return '...';
  }
}

class MockExtractor implements ContentExtractor<Promise<ExtractResult>> {
  constructor(private readonly error: boolean) {}
  async extract(url: string): Promise<ExtractResult> {
    if (this.error) {
      throw new Error('error');
    }
    return ['title', ['', '']];
  }
}

class MockWriter implements ResultWriter {
  constructor(private readonly _exists: boolean) {}
  writePart(index: number, res: ExtractResult): void {}
  flush(): void {}
  exists(index: number): boolean {
    return this._exists;
  }
}

afterEach(() => {
  const dst = getLogDst();
  if (existsSync(dst)) {
    rmSync(getLogDst());
  }
});

describe('single thread downloading', function () {
  it('progress', function () {
    const dn = new SingleThreadDownloader(
      new MockDataSource(),
      new MockExtractor(false),
      new MockWriter(false),
      '',
      0,
      0,
      0,
    );
    dn.on('progress', (res: DownloadProgress) => {
      expect(res).toEqual({ index: 0, title: 'title' } as DownloadProgress);
    });
    return dn.download();
  });
  it('error', function () {
    const dn = new SingleThreadDownloader(
      new MockDataSource(),
      new MockExtractor(true),
      new MockWriter(false),
      '',
      0,
      0,
      0,
    );
    return expect(dn.download()).rejects.toThrowError();
  });
  it('exists', function () {
    const dn = new SingleThreadDownloader(
      new MockDataSource(),
      new MockExtractor(true),
      new MockWriter(true),
      '',
      0,
      0,
      0,
    );
    dn.on('progress', (res: DownloadProgress) => {
      expect(res).toEqual({ index: 0, title: 'skip' } as DownloadProgress);
    });
    return dn.download();
  });
});
