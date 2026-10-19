import type { BrowserName, CliConfig } from '@crosssync/shared';
import { BROWSERS } from '@crosssync/shared';

import { createBrowserReader, type BrowserReader, type BrowserReaderOptions } from './chromium';

export * from './chromium';

/** Builds a reader for every browser enabled in the CLI config. */
export function createConfiguredBrowserReaders(
  config: CliConfig,
  options: BrowserReaderOptions = {},
): BrowserReader[] {
  const readers: BrowserReader[] = [];
  for (const browser of BROWSERS) {
    const browserConfig = config.browsers[browser];
    if (!browserConfig.enabled) {
      continue;
    }
    readers.push(
      createBrowserReader(browser, {
        ...options,
        dataDir: browserConfig.dataDir ?? options.dataDir,
      }),
    );
  }
  return readers;
}

/** Every supported browser, useful for reporting. */
export function supportedBrowsers(): readonly BrowserName[] {
  return BROWSERS;
}
