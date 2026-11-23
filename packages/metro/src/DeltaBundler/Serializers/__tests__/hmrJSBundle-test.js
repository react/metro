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

'use strict';

import type {Module, ReadOnlyGraph, TransformInputOptions} from '../../types';

import CountingSet from '../../../lib/CountingSet';
import parseBundleOptionsFromBundleRequestUrl from '../../../lib/parseBundleOptionsFromBundleRequestUrl';
import hmrJSBundle from '../hmrJSBundle';
import * as jscSafeUrl from 'jsc-safe-url';

const fooModule: Module<> = {
  path: '/root/foo',
  dependencies: new Map([
    [
      './bar',
      {
        absolutePath: '/root/bar',
        data: {
          data: {asyncType: null, isESMImport: false, locs: [], key: './bar'},
          name: './bar',
        },
      },
    ],
  ]),
  inverseDependencies: new CountingSet(),
  output: [
    {
      type: 'js/module',
      data: {
        code: '__d(function() {/* code for foo */});',
        map: [],
        lineCount: 1,
      },
    },
  ],
  getSource: () => Buffer.from('foo-source'),
};

const barModule: Module<> = {
  path: '/root/bar',
  dependencies: new Map(),
  inverseDependencies: new CountingSet(['/root/foo']),
  output: [
    {
      type: 'js/module',
      data: {
        code: '__d(function() {/* code for bar */});',
        map: [],
        lineCount: 1,
      },
    },
  ],
  getSource: () => Buffer.from('bar-source'),
};

const nonAsciiModule: Module<> = {
  path: '/root/%30.бундл.Øಚ😁AA/src/?/foo=bar/#.js',
  dependencies: new Map(),
  inverseDependencies: new CountingSet(),
  output: [
    {
      type: 'js/module',
      data: {
        code: '__d(function() {/* code for ascii file with non ascii characters: %30.бундл.Øಚ😁AA */});',
        map: [],
        lineCount: 1,
      },
    },
  ],
  getSource: () => Buffer.from('bar-source'),
};

const transformOptions: TransformInputOptions = {
  customTransformOptions: {},
  dev: true,
  minify: true,
  platform: 'web',
  type: 'module',
  unstable_transformProfile: 'default',
};

const graph: ReadOnlyGraph<> = {
  entryPoints: new Set(['root/foo']),
  dependencies: new Map([
    ['root/foo', fooModule],
    ['root/bar', barModule],
  ]),
  transformOptions,
};

const options = {
  clientUrl: new URL('http://localhost/root/foo/bundle.js'),
  createModuleId: (s: string) =>
    s.includes('foo') ? (s.includes('bar') ? 2 : 1) : 0,
  includeAsyncPaths: false,
  projectRoot: '/root',
  serverRoot: '/root',
};

test('should generate a simple hot reload bundle from a change', () => {
  expect(
    hmrJSBundle(
      {
        added: new Map([['root/foo', fooModule]]),
        modified: new Map([['root/bar', barModule]]),
        deleted: new Set(),
        reset: false,
      },
      graph,
      options,
    ),
  ).toMatchInlineSnapshot(`
Object {
  "added": Array [
    Object {
      "module": Array [
        1,
        "__d(function() {/* code for foo */},1,[0],\\"foo\\",{});
//# sourceMappingURL=http://localhost/foo.map?platform=web
//# sourceURL=http://localhost/foo.bundle//&platform=web
",
      ],
      "sourceMappingURL": "http://localhost/foo.map?platform=web",
      "sourceURL": "http://localhost/foo.bundle//&platform=web",
    },
  ],
  "deleted": Array [],
  "modified": Array [
    Object {
      "module": Array [
        0,
        "__d(function() {/* code for bar */},0,null,\\"bar\\",{});
//# sourceMappingURL=http://localhost/bar.map?platform=web
//# sourceURL=http://localhost/bar.bundle//&platform=web
",
      ],
      "sourceMappingURL": "http://localhost/bar.map?platform=web",
      "sourceURL": "http://localhost/bar.bundle//&platform=web",
    },
  ],
}
`);
});

test('should turn non ascii filesystem characters into proper encoded urls for source url and source map url', () => {
  expect(
    hmrJSBundle(
      {
        added: new Map(),
        modified: new Map([
          ['root/%30.бундл.Øಚ😁AA/src/?/foo=bar/#.js', nonAsciiModule],
        ]),
        deleted: new Set(),
        reset: false,
      },
      graph,
      options,
    ),
  ).toMatchInlineSnapshot(`
Object {
  "added": Array [],
  "deleted": Array [],
  "modified": Array [
    Object {
      "module": Array [
        2,
        "__d(function() {/* code for ascii file with non ascii characters: %30.бундл.Øಚ😁AA */},2,null,\\"%30.бундл.Øಚ😁AA/src/?/foo=bar/#.js\\",{});
//# sourceMappingURL=http://localhost/%2530.%D0%B1%D1%83%D0%BD%D0%B4%D0%BB.%C3%98%E0%B2%9A%F0%9F%98%81AA/src/%3F/foo%3Dbar/%23.js.map?platform=web
//# sourceURL=http://localhost/%2530.%D0%B1%D1%83%D0%BD%D0%B4%D0%BB.%C3%98%E0%B2%9A%F0%9F%98%81AA/src/%3F/foo%3Dbar/%23.js.bundle//&platform=web
",
      ],
      "sourceMappingURL": "http://localhost/%2530.%D0%B1%D1%83%D0%BD%D0%B4%D0%BB.%C3%98%E0%B2%9A%F0%9F%98%81AA/src/%3F/foo%3Dbar/%23.js.map?platform=web",
      "sourceURL": "http://localhost/%2530.%D0%B1%D1%83%D0%BD%D0%B4%D0%BB.%C3%98%E0%B2%9A%F0%9F%98%81AA/src/%3F/foo%3Dbar/%23.js.bundle//&platform=web",
    },
  ],
}
`);
});

test('gives a virtual module anchored at a real file URLs distinct from that file', () => {
  const virtualFooModule: Module<> = {
    ...fooModule,
    path: 'virtual:/root/foo',
    dependencies: new Map(),
  };
  const {added} = hmrJSBundle(
    {
      added: new Map([
        ['root/foo', fooModule],
        ['virtual:/root/foo', virtualFooModule],
      ]),
      modified: new Map(),
      deleted: new Set(),
      reset: false,
    },
    graph,
    options,
  );
  expect(
    added.map(({sourceURL, sourceMappingURL}) => [sourceURL, sourceMappingURL]),
  ).toEqual([
    [
      'http://localhost/foo.bundle//&platform=web',
      'http://localhost/foo.map?platform=web',
    ],
    [
      'http://localhost/foo.bundle//&platform=web&virtual=true',
      'http://localhost/foo.map?platform=web&virtual=true',
    ],
  ]);
});

test('module URLs resolve back to the exact file and platform', () => {
  const cjsModule: Module<> = {
    ...barModule,
    path: '/root/dual.ios.cjs',
    inverseDependencies: new CountingSet(),
  };
  const {added} = hmrJSBundle(
    {
      added: new Map([['/root/dual.ios.cjs', cjsModule]]),
      modified: new Map(),
      deleted: new Set(),
      reset: false,
    },
    {
      entryPoints: new Set(['/root/dual.ios.cjs']),
      dependencies: new Map([['/root/dual.ios.cjs', cjsModule]]),
      transformOptions: {...transformOptions, platform: 'ios'},
    },
    {...options, clientUrl: new URL('http://localhost/index.ios.bundle')},
  );
  // The server must find `dual.ios.cjs`, not a sibling such as `dual.js`
  // found through `sourceExts`, and build it for the same platform.
  for (const url of [added[0].sourceURL, added[0].sourceMappingURL]) {
    expect(
      parseBundleOptionsFromBundleRequestUrl(
        jscSafeUrl.toNormalUrl(url),
        new Set(['ios']),
      ),
    ).toMatchObject({entryFile: './dual.ios.cjs', platform: 'ios'});
  }
});

test('async paths in updated modules carry the platform of the bundle', () => {
  const lazyModule: Module<> = {
    ...fooModule,
    path: '/root/lazy.ios.js',
    dependencies: new Map([
      [
        './chunk',
        {
          absolutePath: '/root/chunk.ios.js',
          data: {
            data: {
              asyncType: 'async',
              isESMImport: false,
              locs: [],
              key: './chunk',
            },
            name: './chunk',
          },
        },
      ],
    ]),
  };
  const {added} = hmrJSBundle(
    {
      added: new Map([['/root/lazy.ios.js', lazyModule]]),
      modified: new Map(),
      deleted: new Set(),
      reset: false,
    },
    {
      entryPoints: new Set(['/root/lazy.ios.js']),
      dependencies: new Map([['/root/lazy.ios.js', lazyModule]]),
      transformOptions: {...transformOptions, platform: 'ios'},
    },
    {
      ...options,
      clientUrl: new URL('http://localhost/index.ios.bundle?lazy=true'),
      includeAsyncPaths: true,
    },
  );
  expect(added[0].module[1]).toContain(
    '"paths":{"0":"/chunk.ios.js.bundle?lazy=true&platform=ios&modulesOnly=true&runModule=false"}',
  );
});
