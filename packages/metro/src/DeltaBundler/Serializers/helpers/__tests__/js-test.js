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

import type {Dependency} from '../../../types';

import CountingSet from '../../../../lib/CountingSet';
import {inlineModuleIdReferences, wrapModule} from '../js';
import {wrap as raw} from 'jest-snapshot-serializer-raw';
import createModuleIdFactory from 'metro-config/private/defaults/createModuleIdFactory';
import nullthrows from 'nullthrows';

let myModule;

// $FlowFixMe[incompatible-variance]
expect.addSnapshotSerializer(require('jest-snapshot-serializer-raw'));

beforeEach(() => {
  myModule = {
    path: '/root/foo.js',
    dependencies: new Map<string, Dependency>([
      [
        'bar',
        {
          absolutePath: '/bar.js',
          data: {
            data: {asyncType: null, isESMImport: false, locs: [], key: 'bar'},
            name: 'bar',
          },
        },
      ],
      [
        'baz',
        {
          absolutePath: '/baz.js',
          data: {
            data: {asyncType: null, isESMImport: false, locs: [], key: 'baz'},
            name: 'baz',
          },
        },
      ],
    ]),
    getSource: () => Buffer.from(''),
    // $FlowFixMe[underconstrained-implicit-instantiation]
    inverseDependencies: new CountingSet(),
    output: [
      {
        data: {
          code: '__d(function() { console.log("foo") });',
          lineCount: 1,
          map: [],
        },

        type: 'js/module',
      },
    ],
  };
});

describe('wrapModule()', () => {
  test('Should wrap a module in nondev mode', () => {
    expect(
      raw(
        wrapModule(myModule, {
          createModuleId: createModuleIdFactory(),
          dev: false,
          includeAsyncPaths: false,
          projectRoot: '/root',
          serverRoot: '/root',
          sourceUrl: null,
        }),
      ),
    ).toMatchInlineSnapshot(`__d(function() { console.log("foo") },0,[1,2]);`);
  });

  test('Should wrap a module in dev mode', () => {
    expect(
      raw(
        wrapModule(myModule, {
          createModuleId: createModuleIdFactory(),
          dev: true,
          includeAsyncPaths: false,
          projectRoot: '/root',
          serverRoot: '/root',
          sourceUrl: null,
        }),
      ),
    ).toMatchInlineSnapshot(
      `__d(function() { console.log("foo") },0,[1,2],"foo.js");`,
    );
  });

  test('should not wrap a script', () => {
    myModule.output[0].type = 'js/script';

    expect(
      raw(
        wrapModule(myModule, {
          createModuleId: createModuleIdFactory(),
          dev: true,
          includeAsyncPaths: false,
          projectRoot: '/root',
          serverRoot: '/root',
          sourceUrl: null,
        }),
      ),
    ).toMatchInlineSnapshot(`__d(function() { console.log("foo") });`);
  });

  test('should use custom createModuleId param', () => {
    // Just use a createModuleId that returns the same path.
    expect(
      raw(
        wrapModule(myModule, {
          createModuleId: (path: string) => path,
          dev: false,
          includeAsyncPaths: false,
          projectRoot: '/root',
          serverRoot: '/root',
          sourceUrl: null,
        }),
      ),
    ).toMatchInlineSnapshot(
      `__d(function() { console.log("foo") },"/root/foo.js",["/bar.js","/baz.js"]);`,
    );
  });

  test('includes the paths of async dependencies when requested', () => {
    const dep = nullthrows(myModule.dependencies.get('bar'));
    myModule.dependencies.set('bar', {
      ...dep,
      data: {...dep.data, data: {...dep.data.data, asyncType: 'async'}},
    });
    expect(
      raw(
        wrapModule(myModule, {
          createModuleId: createModuleIdFactory(),
          dev: false,
          includeAsyncPaths: true,
          projectRoot: '/root',
          serverRoot: '/root',
          sourceUrl: 'http://localhost/Main.bundle?param1=true&param2=1234',
        }),
      ),
    ).toMatchInlineSnapshot(
      `__d(function() { console.log("foo") },0,{"0":1,"1":2,"paths":{"1":"/../bar.bundle?param1=true&param2=1234&modulesOnly=true&runModule=false"}});`,
    );
  });

  test('async dependency paths respect serverRoot', () => {
    const dep = nullthrows(myModule.dependencies.get('bar'));
    myModule.dependencies.set('bar', {
      ...dep,
      data: {...dep.data, data: {...dep.data.data, asyncType: 'async'}},
    });
    expect(
      raw(
        wrapModule(myModule, {
          createModuleId: createModuleIdFactory(),
          dev: false,
          includeAsyncPaths: true,
          projectRoot: '/root',
          serverRoot: '/',
          sourceUrl: 'http://localhost/Main.bundle?param1=true&param2=1234',
        }),
      ),
    ).toMatchInlineSnapshot(
      `__d(function() { console.log("foo") },0,{"0":1,"1":2,"paths":{"1":"/bar.bundle?param1=true&param2=1234&modulesOnly=true&runModule=false"}});`,
    );
  });

  test('async bundle paths override modulesOnly and runModule', () => {
    const dep = nullthrows(myModule.dependencies.get('bar'));
    myModule.dependencies.set('bar', {
      ...dep,
      data: {...dep.data, data: {...dep.data.data, asyncType: 'async'}},
    });
    expect(
      raw(
        wrapModule(myModule, {
          createModuleId: createModuleIdFactory(),
          dev: false,
          includeAsyncPaths: true,
          projectRoot: '/root',
          serverRoot: '/root',
          sourceUrl:
            'http://localhost/Main.bundle?modulesOnly=false&runModule=true',
        }),
      ),
    ).toMatchInlineSnapshot(
      `__d(function() { console.log("foo") },0,{"0":1,"1":2,"paths":{"1":"/../bar.bundle?modulesOnly=true&runModule=false"}});`,
    );
  });
});

describe('wrapModule() with inlined module ids', () => {
  const NAME = 'DEPENDENCY_MAP';
  const ref = (i: number) => `${NAME}[${i}]`;
  const baseInlineOptions = {
    dev: false,
    includeAsyncPaths: false,
    projectRoot: '/root',
    serverRoot: '/root',
    sourceUrl: null,
    dependencyMapReservedName: NAME,
    unstable_inlineDependencyMap: true,
  };

  beforeEach(() => {
    // foo=0 (self), bar=1, baz=2 with a fresh sequential id factory.
    myModule.output[0].data.code = `__d(function(g,r,i,a,m,e,${NAME}){r(${ref(
      0,
    )});r(${ref(1)})});`;
  });

  test('inlines sync ids and drops the dependency-map array', () => {
    expect(
      wrapModule(myModule, {
        ...baseInlineOptions,
        createModuleId: createModuleIdFactory(),
      }),
    ).toBe(
      `__d(function(g,r,i,a,m,e,${NAME}){r(${'1'.padEnd(
        ref(0).length,
      )});r(${'2'.padEnd(ref(1).length)})},0);`,
    );
  });

  test('keeps a placeholder slot before the verbose name in dev', () => {
    expect(
      wrapModule(myModule, {
        ...baseInlineOptions,
        dev: true,
        createModuleId: createModuleIdFactory(),
      }),
    ).toBe(
      `__d(function(g,r,i,a,m,e,${NAME}){r(${'1'.padEnd(
        ref(0).length,
      )});r(${'2'.padEnd(ref(1).length)})},0,null,"foo.js");`,
    );
  });

  test('passes a paths object (not the id array) for async dependencies', () => {
    const dep = nullthrows(myModule.dependencies.get('bar'));
    myModule.dependencies.set('bar', {
      ...dep,
      data: {...dep.data, data: {...dep.data.data, asyncType: 'async'}},
    });
    expect(
      wrapModule(myModule, {
        ...baseInlineOptions,
        includeAsyncPaths: true,
        sourceUrl: 'http://localhost/Main.bundle?param1=true',
        createModuleId: createModuleIdFactory(),
      }),
    ).toBe(
      `__d(function(g,r,i,a,m,e,${NAME}){r(${'1'.padEnd(
        ref(0).length,
      )});r(${'2'.padEnd(ref(1).length)})},0,` +
        `{"paths":{"1":"/../bar.bundle?param1=true&modulesOnly=true&runModule=false"}});`,
    );
  });

  test('does not inline when the flag is off, even with a reserved name', () => {
    expect(
      wrapModule(myModule, {
        ...baseInlineOptions,
        unstable_inlineDependencyMap: false,
        createModuleId: createModuleIdFactory(),
      }),
    ).toBe(
      `__d(function(g,r,i,a,m,e,${NAME}){r(${ref(0)});r(${ref(1)})},0,[1,2]);`,
    );
  });
});

describe('inlineModuleIdReferences()', () => {
  const NAME = 'DEP_MAP_RESERVED_NAME';
  const ref = (i: number) => `${NAME}[${i}]`;

  test('returns code unchanged when there are no dependencies', () => {
    const code = ref(0);
    expect(inlineModuleIdReferences(code, NAME, [])).toBe(code);
  });

  test('replaces dependency-map references with resolved ids', () => {
    const code = `require(${ref(0)}); require(${ref(1)});`;
    const inlined = inlineModuleIdReferences(code, NAME, [7, 42]);
    expect(inlined).toBe(
      `require(${'7'.padEnd(ref(0).length)}); ` +
        `require(${'42'.padEnd(ref(1).length)});`,
    );
    expect(inlined.length).toBe(code.length);
  });

  test('right-pads ids to preserve byte offsets / source-map columns', () => {
    const code = `x=${ref(0)};y=1;`;
    const inlined = inlineModuleIdReferences(code, NAME, [3]);
    expect(inlined.length).toBe(code.length);
    expect(inlined).toBe(`x=${'3'.padEnd(ref(0).length)};y=1;`);
    // Everything after the reference keeps its original column.
    expect(inlined.indexOf('y=1;')).toBe(code.indexOf('y=1;'));
  });

  test('tolerates embedded tabs and spaces inside the reference', () => {
    const code = `${NAME}\t[ 1 ]`;
    const inlined = inlineModuleIdReferences(code, NAME, [0, 5]);
    expect(inlined).toBe('5'.padEnd(code.length));
    expect(inlined.length).toBe(code.length);
  });

  test('throws when a resolved id is wider than the available space', () => {
    // Short reserved name so the resolved id cannot fit in the reference width.
    expect(() => inlineModuleIdReferences('D[0]', 'D', [12345])).toThrow(
      "Module ID doesn't fit in available space; add 1 more characters to " +
        "'dependencyMapReservedName'.",
    );
  });

  test('throws when the reserved name is absent but deps exist', () => {
    expect(() =>
      inlineModuleIdReferences('require(someOtherName[0]);', NAME, [1]),
    ).toThrow(
      'Module has dependencies but does not use the preconfigured dependency ' +
        "map name 'DEP_MAP_RESERVED_NAME'",
    );
  });

  test('ignores a missing reserved name when told to', () => {
    const code = 'require(someOtherName[0]);';
    expect(
      inlineModuleIdReferences(code, NAME, [1], {
        ignoreMissingDependencyMapReference: true,
      }),
    ).toBe(code);
  });
});
