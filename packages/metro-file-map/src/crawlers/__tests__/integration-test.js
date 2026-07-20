/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow strict-local
 * @oncall react_native
 */

import TreeFS from '../../lib/TreeFS';
import nodeCrawl from '../node';
import watchmanCrawl from '../watchman';
import invariant from 'invariant';
import {execSync} from 'node:child_process';
import os from 'node:os';
import {join} from 'node:path';

jest.useRealTimers();

// At runtime we use a more sophisticated + robust Watchman capability check,
// but this simple heuristic is fast to check, synchronous (we can't
// asynchronously skip tests: https://github.com/facebook/jest/issues/8604),
// and will tend to exercise our Watchman tests whenever possible.
const isWatchmanOnPath = () => {
  try {
    execSync(
      os.platform() === 'win32' ? 'where.exe /Q watchman' : 'which watchman',
    );
    return true;
  } catch {
    return false;
  }
};

type Crawler = typeof nodeCrawl | typeof watchmanCrawl;

const CRAWLERS: {[key: string]: ?Crawler} = {
  'node-recursive': opts => {
    return nodeCrawl(opts);
  },
  watchman: isWatchmanOnPath() ? watchmanCrawl : null,
};

const FIXTURES_DIR = join(__dirname, '..', '__fixtures__');

// Crawlers may return the target for symlinks *if* they can do so efficiently,
// (Watchman with symlink_target), but otherwise they should return 1 and
// defer to the caller. This matcher helps with nested expectations.
declare var expect: {
  /** The object that you want to make assertions against */
  (value: unknown, description?: string): JestExpectType,
  extend(matchers: {[name: string]: JestMatcher, ...}): void,
  assertions(expectedAssertions: number): void,
  any(value: unknown): JestAsymmetricEqualityType,
  oneOf: (unknown, unknown) => boolean,
  ...
};

function oneOf(this: $FlowFixMe, actual: unknown, ...expectOneOf: unknown[]) {
  const pass = expectOneOf.includes(actual);
  return {
    pass,
    message: () =>
      `expected ${this.utils.printReceived(actual)}${
        pass ? ' not' : ''
      } to be in ${this.utils.printExpected(expectOneOf)}`,
  };
}
/* $FlowFixMe[incompatible-type] Natural Inference rollout. See
 * https://fburl.com/gdoc/y8dn025u */
expect.extend({oneOf});

const CASES = [
  [
    true,
    new Map([
      ['foo.js', [expect.any(Number), 245, 0, null, 0, null]],
      [
        join('directory', 'bar.js'),
        [expect.any(Number), 245, 0, null, 0, null],
      ],
      [
        'link-to-directory',
        [expect.any(Number), 9, 0, null, expect.oneOf(1, 'directory'), null],
      ],
      [
        'link-to-foo.js',
        [expect.any(Number), 6, 0, null, expect.oneOf(1, 'foo.js'), null],
      ],
    ]),
  ],
  [
    false,
    new Map([
      [
        join('directory', 'bar.js'),
        [expect.any(Number), 245, 0, null, 0, null],
      ],
      ['foo.js', [expect.any(Number), 245, 0, null, 0, null]],
    ]),
  ],
];

describe.each(Object.keys(CRAWLERS))(
  'Crawler integration tests (%s)',
  crawlerName => {
    const crawl = CRAWLERS[crawlerName];
    const maybeTest = crawl ? test : test.skip;

    maybeTest.each(CASES)(
      'Finds the expected files (includeSymlinks: %s)',
      async (includeSymlinks, expectedChangedFiles) => {
        invariant(crawl, 'crawl should not be null within maybeTest');
        const result = await crawl({
          console: global.console,
          previousState: {
            fileSystem: new TreeFS({
              rootDir: FIXTURES_DIR,
              files: new Map([['removed.js', [123, 234, 0, null, 0, null]]]),
              processFile: () => {
                throw new Error('Not implemented');
              },
            }),
            clocks: new Map(),
          },
          includeSymlinks,
          extensions: ['js'],
          ignore: path => path.includes('ignored'),
          roots: [FIXTURES_DIR],
          rootDir: FIXTURES_DIR,
          abortSignal: null,
          computeSha1: false,
          onStatus: () => {},
        });

        // Map comparison is unordered, which is what we want
        expect(result).toMatchObject({
          changedFiles: expectedChangedFiles,
          removedFiles: new Set(['removed.js']),
        });
        if (crawlerName === 'watchman') {
          expect(result.clocks).toBeInstanceOf(Map);
        }
      },
    );
  },
);
