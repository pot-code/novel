import { isString } from 'lodash';
import { BaseLogger } from 'pino';
import { Browser, Page } from 'puppeteer-core';

import { USER_AGENT } from '../../util/browser';
import { ContentExtractor, ExtractResult } from '../types';

export class DefaultContentExtractor implements ContentExtractor<Promise<ExtractResult>> {
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
  }

  /**
   * @param url page url
   */
  async extract(url: string): Promise<ExtractResult> {
    const page = await this.page;

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

    return ret as ExtractResult;
  }
}
