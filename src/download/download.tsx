import { existsSync, mkdirSync, rmSync } from 'fs';
import os from 'os';

import { Instance, render } from 'ink';
import inquirer from 'inquirer';
import { Browser } from 'puppeteer-core';
import React from 'react';

import { DownloadConfig, loadConfig } from './config';
import { LinkedDataSource, ArrayDataSource } from './datasource';
import { Grid, Spinner } from './display';
import { DefaultContentExtractor } from './extract';
import { MultiThreadDownloader, SingleThreadDownloader } from './fetcher';
import { Downloader, ObservableDataSource, ObservableDownloader } from './types';
import { DefaultResultWriter } from './writer';

import { getLogDst, log } from '../util/log';
import { getBrowser, saveScreenshots } from '../util/browser';
import { DIAGNOSE_PATH } from '../constants';
import { CommandError, InternalError } from '../errors';

export async function download(
  configPath: string,
  workerNumber: number,
  output: string,
  headless: boolean,
  timeout: number,
) {
  const logger = log.child({ module: 'download' });

  if (existsSync(output)) {
    const ans = await inquirer.prompt({
      type: 'confirm',
      name: 'overwrite',
      message: `'${output}' already exists, overwrite`,
    });
    if (!ans.overwrite) {
      logger.info(`[skipped]'${output}' already exists`);
      return;
    }
  }

  let config: DownloadConfig;
  try {
    config = loadConfig(configPath);
  } catch (error) {
    throw new CommandError(`failed to load config: ${error.message}`);
  }

  if (config.limit === 0) {
    process.stdout.write("nothing to fetch, 'limit' is 0\n");
    return;
  }

  let browser: Browser;
  try {
    browser = await getBrowser(headless);
  } catch (error) {
    logger.error({ stack: error.stack }, error.message);
    throw new InternalError(error, 'failed to open browser');
  }

  function handleInterrupt() {
    rmSync(getLogDst(), { force: true });
    browser.close().then(() => {
      process.exit(1);
    });
  }
  process.on('SIGINT', handleInterrupt);
  process.on('SIGTERM', handleInterrupt);

  const fetcher = createDownloader(browser, config, workerNumber, timeout, output);
  let ui: Instance;
  if (workerNumber > 1 && os.platform() != 'win32') {
    ui = render(<Grid subject={fetcher} />);
  } else {
    ui = render(<Spinner subject={fetcher} />);
  }

  try {
    await fetcher.download();
  } catch (error) {
    logger.info({ path: DIAGNOSE_PATH }, 'writing screenshots');
    if (!existsSync(DIAGNOSE_PATH)) {
      mkdirSync(DIAGNOSE_PATH);
    }
    try {
      await saveScreenshots(browser, DIAGNOSE_PATH);
    } catch (se) {
      logger.error({ path: DIAGNOSE_PATH, error: se.message }, 'failed to save screenshots');
    }
    throw error;
  } finally {
    ui.unmount();
    ui.cleanup();
    await browser.close();
  }
}

function createDownloader(
  browser: Browser,
  config: DownloadConfig,
  workerNumber: number,
  timeout: number,
  output: string,
): Downloader {
  const writer = new DefaultResultWriter(config.url, output, config.limit);

  let dataSource: ObservableDataSource<Promise<string>>;
  if (config.list_selector) {
    dataSource = new ArrayDataSource(browser, config.url, config.list_selector);
  } else {
    dataSource = new LinkedDataSource(browser, config.url, config.next_selector);
  }

  let fetcher: ObservableDownloader;
  if (workerNumber > 1) {
    fetcher = new MultiThreadDownloader(
      workerNumber,
      dataSource,
      writer,
      browser.wsEndpoint(),
      config.url,
      config.skip,
      config.limit,
      config.wait,
      timeout,
      config.content,
      config.title,
    );
  } else {
    const extractor = new DefaultContentExtractor(browser, config.title, config.content, timeout);
    fetcher = new SingleThreadDownloader(
      dataSource,
      extractor,
      writer,
      config.url,
      config.skip,
      config.limit,
      config.wait,
    );
  }
  return fetcher;
}
