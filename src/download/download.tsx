import { existsSync } from 'fs';
import { Instance, render } from 'ink';
import inquirer from 'inquirer';
import { Browser } from 'puppeteer-core';
import React from 'react';
import { DIAGNOSE_PATH } from '../constants';

import { getBrowser, saveScreenshots } from '../util/browser';
import { log } from '../util/log';
import { DownloadConfig, loadConfig } from './config';
import { LinkedDataSource } from './datasource/linked';
import { ListDataSource } from './datasource/list';
import { Grid, Spinner } from './display';
import { DefaultContentExtractor } from './extract';
import { MultiThreadDownloader } from './fetcher/multi';
import { SingleThreadDownloader } from './fetcher/single';
import { ObservableDataSource, ObservableDownloader } from './types';
import { DefaultResultWriter } from './writer';

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
      message: `'${output}' already exists, overwrite?`,
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
    logger.error({ error: error.message }, 'failed to load config');
    throw error;
  }

  let browser: Browser;
  try {
    browser = await getBrowser(headless);
  } catch (error) {
    logger.error({ error: error.message }, 'open browser');
    throw error;
  }

  async function handleTerm() {
    await browser.close();
    process.exit(1);
  }
  process.on('SIGINT', handleTerm);
  process.on('SIGTERM', handleTerm);

  const writer = new DefaultResultWriter(config.url, output);

  let dataSource: ObservableDataSource<Promise<string>>;
  if (config.list_selector) {
    dataSource = new ListDataSource(browser, config.url, config.list_selector);
  } else {
    dataSource = new LinkedDataSource(browser, config.url, config.next_selector);
  }

  let fetcher: ObservableDownloader;
  let ui: Instance;
  if (workerNumber > 1) {
    fetcher = new MultiThreadDownloader(
      workerNumber,
      dataSource,
      writer,
      browser.wsEndpoint(),
      config.url,
      config.wait,
      timeout,
      config.content,
      config.title,
    );
    ui = render(<Grid subject={fetcher} />);
  } else {
    const extractor = new DefaultContentExtractor(browser, config.title, config.content, timeout);
    fetcher = new SingleThreadDownloader(dataSource, extractor, writer, config.url, config.wait);
    ui = render(<Spinner subject={fetcher} />);
  }

  try {
    await fetcher.download();
  } catch (error) {
    ui.clear();
    logger.info({ path: DIAGNOSE_PATH }, 'writing screenshots');
    try {
      await saveScreenshots(browser, DIAGNOSE_PATH);
    } catch (se) {
      logger.error({ path: DIAGNOSE_PATH, error: se.message }, 'failed to save screenshots');
    }
    throw error;
  } finally {
    await browser.close();
  }
}
