import { Browser } from 'puppeteer-core';
import { parentPort, workerData } from 'worker_threads';

import { attachBrowser } from '../../util/browser';
import { sleep } from '../../util/common';
import { log } from '../../util/log';
import { DefaultContentExtractor } from '../extract';
import { WorkerData, WorkerResponse, DownloadTask } from '../types';

const logger = log.child({ module: 'worker', pid: process.pid });

async function main(config: WorkerData) {
  let browser: Browser;
  try {
    browser = await attachBrowser(config.endpoint);
    log.debug({ endpoint: config.endpoint }, 'browser attached');
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'failed to attach to browser');
    throw error;
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
      logger.error({ error: error.message, stack: error.stack }, 'failed to extract content');
      parentPort.postMessage({
        index: data.index,
        payload: null,
      } as WorkerResponse);
    } finally {
      await sleep(config.delay);
    }
  });
}

main(workerData);
