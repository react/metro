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

import type {Module, TransformInputOptions} from '../../types';

import CountingSet from '../../../lib/CountingSet';
import baseJSBundleWithLazyModuleDefinition from '../baseJSBundleWithLazyModuleDefinition';

const polyfill: Module<> = {
  path: '/polyfill',
  dependencies: new Map(),
  inverseDependencies: new CountingSet(),
  output: [
    {
      type: 'js/script',
      data: {code: '__d(function() {/* code for polyfill */});', lineCount: 1},
    },
  ],
  getSource: () => Buffer.from('polyfill-source'),
};

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

const transformOptions: TransformInputOptions = {
  customTransformOptions: {},
  dev: true,
  minify: true,
  platform: 'web',
  type: 'module',
  unstable_transformProfile: 'default',
};

function serialize() {
  return baseJSBundleWithLazyModuleDefinition(
    '/root/foo',
    [polyfill],
    {
      dependencies: new Map([
        ['/root/foo', fooModule],
        ['/root/bar', barModule],
      ]),
      entryPoints: new Set(['/root/foo']),
      transformOptions,
    },
    {
      asyncRequireModulePath: '',
      createModuleId: (filePath: string) => (filePath === '/root/foo' ? 0 : 1),
      dev: true,
      getRunModuleStatement: (moduleId: number | string) =>
        `require(${JSON.stringify(moduleId)});`,
      globalPrefix: '',
      includeAsyncPaths: false,
      inlineSourceMap: false,
      modulesOnly: false,
      processModuleFilter: () => true,
      projectRoot: '/root',
      reservedString: '_$$_METRO_',
      runBeforeMainModule: [],
      runModule: true,
      serverRoot: '/root',
      shouldAddToIgnoreList: () => false,
      sourceMapUrl: 'http://localhost/bundle.map',
      sourceUrl: null,
      getSourceUrl: null,
    },
  );
}

test('wraps real modules in a segment switch and emits polyfills eagerly', () => {
  const {code} = serialize();

  // Polyfill is emitted eagerly at the top.
  expect(code).toContain('__d(function() {/* code for polyfill */});');

  // Real modules are registered lazily via a single segment definer.
  expect(code).toContain('__registerSegment(0, function defSeg0(moduleId) {');
  expect(code).toContain('var ___d = __d;');
  expect(code).toContain('switch (moduleId) {');
  expect(code).toContain('case 0:');
  expect(code).toContain('case 1:');
  expect(code).toContain('___d(function() {/* code for foo */}');
  expect(code).toContain('return;');
  expect(code).toContain(
    'default: new Error("No module found for ID " + moduleId);',
  );

  // Run-module call comes after registration.
  expect(code).toContain('require(0);');
});

test('polyfills lead, modules are inside the switch, run-module trails', () => {
  const {code} = serialize();
  const polyfillAt = code.indexOf('code for polyfill');
  const segmentAt = code.indexOf('__registerSegment');
  const fooAt = code.indexOf('code for foo');
  const runAt = code.indexOf('require(0);');

  expect(polyfillAt).toBeGreaterThanOrEqual(0);
  expect(segmentAt).toBeGreaterThan(polyfillAt);
  // foo's __d is inside the switch (after __registerSegment), not eager.
  expect(fooAt).toBeGreaterThan(segmentAt);
  expect(runAt).toBeGreaterThan(segmentAt);
});

test('produces a valid indexed source map', () => {
  const {map} = serialize();
  const parsed = JSON.parse(map);
  expect(parsed.version).toBe(3);
  // BundleBuilder emits a sectioned (indexed) map.
  expect(Array.isArray(parsed.sections)).toBe(true);
  expect(parsed.sections.length).toBeGreaterThan(0);
  for (const section of parsed.sections) {
    expect(section.offset).toEqual(
      expect.objectContaining({
        line: expect.any(Number),
        column: expect.any(Number),
      }),
    );
  }
});

test('modulesOnly omits the eager polyfills but keeps the segment', () => {
  const {code} = baseJSBundleWithLazyModuleDefinition(
    '/root/foo',
    [polyfill],
    {
      dependencies: new Map([['/root/foo', fooModule]]),
      entryPoints: new Set(['/root/foo']),
      transformOptions,
    },
    {
      asyncRequireModulePath: '',
      createModuleId: () => 0,
      dev: true,
      getRunModuleStatement: (moduleId: number | string) =>
        `require(${JSON.stringify(moduleId)});`,
      globalPrefix: '',
      includeAsyncPaths: false,
      inlineSourceMap: false,
      modulesOnly: true,
      processModuleFilter: () => true,
      projectRoot: '/root',
      reservedString: '_$$_METRO_',
      runBeforeMainModule: [],
      runModule: true,
      serverRoot: '/root',
      shouldAddToIgnoreList: () => false,
      sourceMapUrl: null,
      sourceUrl: null,
      getSourceUrl: null,
    },
  );

  expect(code).not.toContain('code for polyfill');
  expect(code).toContain('__registerSegment(0, function defSeg0(moduleId) {');
  expect(code).toContain('var ___d = __d;');
  expect(code).toContain('case 0:');
});
