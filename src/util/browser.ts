import fs from 'fs';
import os from 'os';
import path from 'path';
import puppeteer, { Browser } from 'puppeteer-core';
import { timestamp } from './common';

export const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/11.1.2 Safari/605.1.15';

const platformExecutable = {
  win32: [
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
  ],
  linux: [],
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ],
};

function getExecutablePath(): string {
  function _predict(p: string): boolean {
    p = path.resolve(p); // normalize the path regarding the platform
    return fs.existsSync(p);
  }

  const platform = os.platform();
  if (platform in platformExecutable) {
    const group = platformExecutable[platform];
    const idx = group.findIndex(_predict);
    if (idx > -1) {
      return group[idx];
    }
  }
  return '';
}

export async function getBrowser(headless: boolean): Promise<Browser> {
  const exePath = getExecutablePath();

  return await puppeteer.launch({
    headless,
    executablePath: exePath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-javascript-harmony-shipping',
    ],
  });
}

export async function attachBrowser(endpoint: string): Promise<Browser> {
  return await puppeteer.connect({
    browserWSEndpoint: endpoint,
  });
}

export async function saveScreenshots(browser: Browser, dir: string): Promise<void> {
  const pages = await browser.pages();
  for (let i = pages.length - 1; i >= 0; i--) {
    const url = pages[i].url();
    if (!url || url.startsWith('about') || url.startsWith('chrome')) {
      continue;
    }
    await pages[i].screenshot({
      path: path.join(dir, `page-${i}-${timestamp()}.jpeg`),
      quality: 50,
    });
  }
}
