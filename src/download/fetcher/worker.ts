import { Browser } from 'puppeteer-core';
import { parentPort, workerData } from 'worker_threads';

import { attachBrowser } from '../../util/browser';
import { sleep } from '../../util/common';
import { DefaultContentExtractor } from '../extract';
import { WorkerData, WorkerResponse, DownloadTask } from '../types';

async function main(config: WorkerData) {
  let browser: Browser;
  try {
    browser = await attachBrowser(config.endpoint);
  } catch (error) {
    throw new Error(`failed to attach to browser: ${error.message}`);
  }

  const extractor = new DefaultContentExtractor(
    browser,
    config.title,
    config.content,
    config.timeout,
  );

  parentPort.postMessage('ready');
  parentPort.on('message', async (data: DownloadTask) => {
    try {
      const res = await extractor.extract(data.url);
      parentPort.postMessage({
        index: data.index,
        payload: res,
      } as WorkerResponse);
    } catch (error) {
      parentPort.postMessage({
        index: data.index,
        payload: null,
        error: `failed to extract content: ${error.message}`,
      } as WorkerResponse);
    } finally {
      await sleep(config.delay);
    }
  });
}

main(workerData);
