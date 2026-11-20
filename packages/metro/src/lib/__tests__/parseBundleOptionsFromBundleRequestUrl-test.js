/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 * @oncall react_native
 */

import parseBundleOptionsFromBundleRequestUrl from '../parseBundleOptionsFromBundleRequestUrl';

describe('parseBundleOptionsFromBundleRequestUrl', () => {
  test.each([['map'], ['bundle']])('detects %s requests', type => {
    expect(
      parseBundleOptionsFromBundleRequestUrl(
        `http://localhost/my/bundle.${type}`,
        new Set([]),
      ),
    ).toMatchObject({bundleType: type});
  });

  test('retrieves the platform from the query parameters', () => {
    expect(
      parseBundleOptionsFromBundleRequestUrl(
        'http://localhost/my/bundle.bundle?platform=ios',
        new Set([]),
      ),
    ).toMatchObject({platform: 'ios'});
  });

  test('retrieves the platform from the pathname', () => {
    expect(
      parseBundleOptionsFromBundleRequestUrl(
        'http://localhost/my/bundle.test.bundle',
        new Set(['test']),
      ),
    ).toMatchObject({platform: 'test'});
  });

  test('relative urls fail to be parsed', () => {
    expect(() =>
      parseBundleOptionsFromBundleRequestUrl('my/bundle.bundle', new Set([])),
    ).toThrowError(
      'Expecting the request url to have a valid protocol, e.g. "http://", "https://", or "//"',
    );
  });

  test('rejects a virtual module URL', () => {
    expect(() =>
      parseBundleOptionsFromBundleRequestUrl(
        'http://localhost/App.bundle?platform=ios&virtual=true',
        new Set(['ios']),
      ),
    ).toThrowError('Virtual modules cannot be requested by URL yet.');
  });

  test.each(['absolute', 'relative'])(
    '%s protocol urls- infers the source url and source map url from the pathname',
    type => {
      const protocol = type === 'absolute' ? 'http:' : '';
      expect(
        parseBundleOptionsFromBundleRequestUrl(
          `${protocol}//localhost/my/bundle.bundle`,
          new Set([]),
        ),
      ).toMatchObject({
        sourceMapUrl: `${protocol}//localhost/my/bundle.map`,
        sourceUrl: `${protocol}//localhost/my/bundle.bundle`,
      });
    },
  );

  test('forces the HTTP protocol for iOS and Android platforms', () => {
    expect(
      parseBundleOptionsFromBundleRequestUrl(
        'http://localhost/my/bundle.bundle?platform=ios',
        new Set(['ios']),
      ),
    ).toMatchObject({
      sourceMapUrl: 'http://localhost/my/bundle.map?platform=ios',
    });

    expect(
      parseBundleOptionsFromBundleRequestUrl(
        'http://localhost/my/bundle.bundle?platform=android',
        new Set(['android']),
      ),
    ).toMatchObject({
      sourceMapUrl: 'http://localhost/my/bundle.map?platform=android',
    });
  });

  test.each(['absolute', 'relative'])(
    '%s urls with ascii characters are encoded correctly',
    type => {
      const protocol = type === 'absolute' ? 'http:' : '';
      expect(
        parseBundleOptionsFromBundleRequestUrl(
          `${protocol}//localhost/my/%2530/%D0%B1%D1%83%D0%BD%D0%B4%D0%BB.%C3%98%E0%B2%9A%F0%9F%98%81AA.bundle`,
          new Set([]),
        ),
      ).toMatchObject({
        sourceMapUrl: `${protocol}//localhost/my/%2530/%D0%B1%D1%83%D0%BD%D0%B4%D0%BB.%C3%98%E0%B2%9A%F0%9F%98%81AA.map`,
        sourceUrl: `${protocol}//localhost/my/%2530/%D0%B1%D1%83%D0%BD%D0%B4%D0%BB.%C3%98%E0%B2%9A%F0%9F%98%81AA.bundle`,
        entryFile: './my/%30/бундл.Øಚ😁AA',
      });
    },
  );

  describe.each([
    ['dev', true],
    ['minify', false],
    ['excludeSource', false],
    ['inlineSourceMap', false],
    ['runModule', true],
  ])('boolean option `%s`', (optionName, defaultValue) => {
    test(`defaults to \`${String(defaultValue)}\``, () => {
      expect(
        parseBundleOptionsFromBundleRequestUrl(
          'http://localhost/my/bundle.bundle',
          new Set([]),
        ),
      ).toMatchObject({[optionName]: defaultValue});
    });

    test('is retrieved from the url', () => {
      expect(
        parseBundleOptionsFromBundleRequestUrl(
          `http://localhost/my/bundle.bundle?${optionName}=true`,
          new Set([]),
        ),
      ).toMatchObject({[optionName]: true});

      expect(
        parseBundleOptionsFromBundleRequestUrl(
          `http://localhost/my/bundle.bundle?${optionName}=false`,
          new Set([]),
        ),
      ).toMatchObject({[optionName]: false});
    });
  });
});
