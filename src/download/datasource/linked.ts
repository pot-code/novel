import { isString } from 'lodash';
import { BaseLogger } from 'pino';
import { Browser, Page } from 'puppeteer-core';

import { USER_AGENT } from '../../util/browser';
import { log } from '../../util/log';
import { ObservableDataSource } from '../types';

export class LinkedDataSource extends ObservableDataSource<Promise<string>> {
  private page: Promise<Page>;
  private nextUrl: string;
  private proceed = 0;
  private logger: BaseLogger;
  /**
   *
   * @param browser browser instance
   * @param url entry url
   * @param selector next url selector
   */
  constructor(
    private readonly browser: Browser,
    private url: string,
    private readonly selector: string,
  ) {
    super();
    this.page = browser.newPage().then(async (page) => {
      await page.setUserAgent(USER_AGENT);
      return page;
    });
    this.nextUrl = this.url;
    this.logger = log.child({ module: LinkedDataSource.name });
  }

  async next(): Promise<string> {
    if (!this.nextUrl) {
      return '';
    }

    const page = await this.page;

    this.logger.debug({ url: this.nextUrl }, 'navigating');
    await page.goto(this.nextUrl, {
      waitUntil: 'domcontentloaded',
    });

    const nextUrl: string | number = await page.evaluate(function (selector: string) {
      const $next = document.querySelector(selector);

      if (!$next) {
        return ''; // selector invalid or read ending
      }

      if ($next.tagName !== 'A') {
        return 1; // element invalid
      }

      return $next['href'];
    }, this.selector);

    this.logger.debug({ url: nextUrl }, 'next url');
    if (isString(nextUrl)) {
      const ret = this.nextUrl;
      if (nextUrl !== '') {
        this.proceed++;
      } else if (this.proceed === 0) {
        throw new Error(`no matched element for selector '${this.selector}'`);
      }
      this.nextUrl = nextUrl;
      return ret;
    }

    if (nextUrl === 1) {
      throw new Error("invalid target element type, expected 'anchor'");
    }
  }
}
