import { isString } from 'lodash';
import { Browser, Page } from 'puppeteer-core';

import { USER_AGENT } from '../../util/browser';
import { DownloadInit, ObservableDataSource } from '../types';

export class ListDataSource extends ObservableDataSource<Promise<string>> {
  private page: Promise<Page>;
  private cursor = 0;

  private initialized = false;
  private list: string[] = [];

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
  }

  async init() {
    const page = await this.page;

    await page.goto(this.url, {
      waitUntil: 'domcontentloaded',
    });

    const list: string | string[] = await page.evaluate(function (selector: string) {
      const nodes = document.querySelectorAll(selector);

      if (!nodes || nodes.length === 0) {
        return `no matched element for selector ${selector}`;
      }

      if (nodes[0].tagName !== 'A') {
        return `invalid target element type, expected 'anchor', got '${nodes[0].tagName}'`;
      }

      return Array.from(nodes).map((node) => node['href']);
    }, this.selector);

    if (isString(list)) {
      throw new Error(list);
    }

    this.list = list;
    this.initialized = true;
    this.emit('init', { total: list.length } as DownloadInit);
  }

  async next(): Promise<string> {
    if (!this.initialized) {
      await this.init();
    }

    const list = this.list;
    if (this.cursor >= list.length) {
      return ''; // indicating end
    }
    return list[this.cursor++];
  }
}
