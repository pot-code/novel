import { isString } from 'lodash';
import { BaseLogger } from 'pino';
import { Browser, Page } from 'puppeteer-core';

import { USER_AGENT } from '../../util/browser';
import { log } from '../../util/log';
import { ExtractResult } from '../types';

export class DefaultContentExtractor {
  private page: Promise<Page>;
  private logger: BaseLogger;
  /**
   * @param browser browser instance
   * @param title title selector
   * @param content content selector
   */
  constructor(
    private readonly browser: Browser,
    private readonly title: string,
    private readonly content: string,
    private readonly timeout: number,
  ) {
    this.page = browser.newPage().then(async (page) => {
      await page.setUserAgent(USER_AGENT);
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        if (
          req.resourceType() == 'stylesheet' ||
          req.resourceType() == 'font' ||
          req.resourceType() == 'image'
        ) {
          req.abort();
        } else {
          req.continue();
        }
      });
      return page;
    });
    this.logger = log.child({ module: DefaultContentExtractor.name });
  }

  /**
   *
   * @param url url contains content
   * @returns extract result
   */
  async extract(url: string): Promise<ExtractResult> {
    const page = await this.page;

    this.logger.debug({ url }, 'navigating');
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: this.timeout,
    });
    const ret: any[] | string = await page.evaluate(
      (contentSelector, titleSelector) => {
        const $root = document.querySelector(contentSelector);
        if (!$root) {
          return `Invalid content selector '${contentSelector}'`;
        }
        const ite = document.createNodeIterator($root, NodeFilter.SHOW_TEXT);
        const lines = [];
        for (let n = ite.nextNode(); n !== null; n = ite.nextNode()) {
          lines.push(n.textContent.trim()); // remove indent and trailing newline
        }

        const $title = document.querySelector(titleSelector);
        if (!$title) {
          return `Invalid title selector '${titleSelector}'`;
        }
        const title = $title.innerHTML;
        return [title, lines];
      },
      this.content,
      this.title,
    );

    if (isString(ret)) {
      throw new Error(ret);
    }

    this.logger.debug({ title: ret[0], lines: ret[1].length }, 'extract result');
    return ret as ExtractResult;
  }
}
