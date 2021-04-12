import { EventEmitter } from 'events';

// title, lines
export type ExtractResult = [string, string[]];

export type DownloadProgress = {
  title: string;
  index: number;
};

export type DownloadInit = {
  total: number;
};

export interface Downloader extends EventEmitter {
  download(): Promise<void>;
}

export interface DataSource<T> {
  next(): T;
}

export abstract class ObservableDownloader extends EventEmitter implements Downloader {
  abstract download(): Promise<void>;
}

export abstract class ObservableDataSource<T> extends EventEmitter implements DataSource<T> {
  abstract next(): T;
}

export interface ResultWriter {
  writePart(index: number, res: ExtractResult): void;
  flush(): void;
  exists(index: number): boolean;
}

export type WorkerData = {
  endpoint: string;
  content: string;
  title: string;
  delay: number;
  timeout: number;
};

export type DownloadTask = {
  index: number;
  url: string;
};

export type WorkerResponse = {
  index: number;
  payload: ExtractResult;
};
