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

import type {Module} from '../../types';

import CountingSet from '../../../lib/CountingSet';

const {
  sourceMapString,
  sourceMapStringNonBlocking,
} = require('../sourceMapString');

const polyfill: Module<> = {
  path: '/root/pre.js',
  dependencies: new Map(),
  inverseDependencies: new CountingSet(),
  getSource: () => Buffer.from('source pre'),
  output: [
    {
      type: 'js/script',
      data: {
        code: '__d(function() {/* code for polyfill */});',
        lineCount: 1,
        map: [],
      },
    },
  ],
};

const fooModule: Module<> = {
  path: '/root/foo.js',
  dependencies: new Map([
    [
      './bar',
      {
        absolutePath: '/root/bar.js',
        data: {
          data: {asyncType: null, isESMImport: false, locs: [], key: './bar'},
          name: './bar',
        },
      },
    ],
  ]),
  inverseDependencies: new CountingSet(['/root/pre.js']),
  getSource: () => Buffer.from('source foo'),
  output: [
    {
      type: 'js/module',
      data: {
        code: '__d(function() {/* code for foo */});',
        lineCount: 1,
        map: [],
        functionMap: {names: ['<global>'], mappings: 'AAA'},
      },
    },
  ],
};

const barModule: Module<> = {
  path: '/root/bar.js',
  dependencies: new Map(),
  inverseDependencies: new CountingSet(['/root/foo.js']),
  getSource: () => Buffer.from('source bar'),
  output: [
    {
      type: 'js/module',
      data: {
        code: '__d(function() {/* code for bar */});',
        lineCount: 1,
        map: [],
      },
    },
  ],
};

describe.each([sourceMapString, sourceMapStringNonBlocking])(
  '%p',
  sourceMapStringImpl => {
    test('should serialize a very simple bundle', async () => {
      expect(
        JSON.parse(
          await sourceMapStringImpl([polyfill, fooModule, barModule], {
            excludeSource: false,
            processModuleFilter: module => true,
            shouldAddToIgnoreList: module => false,
            getSourceUrl: null,
          }),
        ),
      ).toEqual({
        version: 3,
        sections: [
          {
            offset: {line: 0, column: 0},
            map: {
              version: 3,
              sources: ['/root/pre.js'],
              sourcesContent: ['source pre'],
              names: [],
              mappings: '',
            },
          },
          {
            offset: {line: 1, column: 0},
            map: {
              version: 3,
              sources: ['/root/foo.js'],
              sourcesContent: ['source foo'],
              names: [],
              mappings: '',
              x_facebook_sources: [[{names: ['<global>'], mappings: 'AAA'}]],
            },
          },
          {
            offset: {line: 2, column: 0},
            map: {
              version: 3,
              sources: ['/root/bar.js'],
              sourcesContent: ['source bar'],
              names: [],
              mappings: '',
            },
          },
        ],
      });
    });

    test('modules should appear in their original order', async () => {
      expect(
        JSON.parse(
          await sourceMapStringImpl([polyfill, barModule, fooModule], {
            excludeSource: false,
            processModuleFilter: module => true,
            shouldAddToIgnoreList: module => false,
            getSourceUrl: null,
          }),
        ),
      ).toEqual({
        version: 3,
        sections: [
          {
            offset: {line: 0, column: 0},
            map: {
              version: 3,
              sources: ['/root/pre.js'],
              sourcesContent: ['source pre'],
              names: [],
              mappings: '',
            },
          },
          {
            offset: {line: 1, column: 0},
            map: {
              version: 3,
              sources: ['/root/bar.js'],
              sourcesContent: ['source bar'],
              names: [],
              mappings: '',
            },
          },
          {
            offset: {line: 2, column: 0},
            map: {
              version: 3,
              sources: ['/root/foo.js'],
              sourcesContent: ['source foo'],
              names: [],
              mappings: '',
              x_facebook_sources: [[{names: ['<global>'], mappings: 'AAA'}]],
            },
          },
        ],
      });
    });

    test('should not include the source of an asset', async () => {
      const assetModule: Module<> = {
        path: '/root/asset.jpg',
        dependencies: new Map(),
        inverseDependencies: new CountingSet(),
        getSource: () => {
          throw new Error('should not read the source of an asset');
        },
        output: [
          {
            type: 'js/module/asset',
            data: {
              code: '__d(function() {/* code for bar */});',
              lineCount: 1,
              map: [],
            },
          },
        ],
      };

      expect(
        JSON.parse(
          await sourceMapStringImpl([fooModule, assetModule], {
            excludeSource: false,
            processModuleFilter: module => true,
            shouldAddToIgnoreList: module => false,
            getSourceUrl: null,
          }),
        ),
      ).toEqual({
        version: 3,
        sections: [
          {
            offset: {line: 0, column: 0},
            map: {
              version: 3,
              sources: ['/root/foo.js'],
              sourcesContent: ['source foo'],
              names: [],
              mappings: '',
              x_facebook_sources: [[{names: ['<global>'], mappings: 'AAA'}]],
            },
          },
          {
            offset: {line: 1, column: 0},
            map: {
              version: 3,
              sources: ['/root/asset.jpg'],
              sourcesContent: [''],
              names: [],
              mappings: '',
            },
          },
        ],
      });
    });

    test('should emit x_google_ignoreList based on shouldAddToIgnoreList', async () => {
      expect(
        JSON.parse(
          await sourceMapStringImpl([polyfill, fooModule, barModule], {
            excludeSource: false,
            processModuleFilter: module => true,
            shouldAddToIgnoreList: module => true,
            getSourceUrl: null,
          }),
        ),
      ).toEqual({
        version: 3,
        sections: [
          {
            offset: {line: 0, column: 0},
            map: {
              version: 3,
              sources: ['/root/pre.js'],
              sourcesContent: ['source pre'],
              names: [],
              mappings: '',
              x_google_ignoreList: [0],
            },
          },
          {
            offset: {line: 1, column: 0},
            map: {
              version: 3,
              sources: ['/root/foo.js'],
              sourcesContent: ['source foo'],
              names: [],
              mappings: '',
              x_facebook_sources: [[{names: ['<global>'], mappings: 'AAA'}]],
              x_google_ignoreList: [0],
            },
          },
          {
            offset: {line: 2, column: 0},
            map: {
              version: 3,
              sources: ['/root/bar.js'],
              sourcesContent: ['source bar'],
              names: [],
              mappings: '',
              x_google_ignoreList: [0],
            },
          },
        ],
      });
    });
  },
);

describe.each([sourceMapString, sourceMapStringNonBlocking])(
  'index source map sections (%p)',
  sourceMapStringImpl => {
    const vlqModule: Module<> = {
      path: '/root/vlq.js',
      dependencies: new Map(),
      inverseDependencies: new CountingSet(),
      getSource: () => Buffer.from('source vlq'),
      output: [
        {
          type: 'js/module',
          data: {
            code: '__d(function() {/* code for vlq */});',
            lineCount: 1,
            // Stored compactly as VLQ rather than decoded tuples.
            map: {mappings: 'AAAA', names: []},
            functionMap: {names: ['<global>'], mappings: 'AAA'},
          },
        },
      ],
    };

    const options = {
      excludeSource: false,
      processModuleFilter: (module: Module<>) => true,
      shouldAddToIgnoreList: (module: Module<>) => false,
      getSourceUrl: null,
    };

    test('passes a VLQ-stored map through verbatim as a section', async () => {
      const parsed = JSON.parse(
        await sourceMapStringImpl([fooModule, vlqModule], options),
      );
      expect(parsed.version).toBe(3);
      expect(parsed.sections).toHaveLength(2);
      // VLQ module passes through unchanged.
      expect(parsed.sections[1].offset).toEqual({line: 1, column: 0});
      expect(parsed.sections[1].map.mappings).toBe('AAAA');
      expect(parsed.sections[1].map.sources).toEqual(['/root/vlq.js']);
      expect(parsed.sections[1].map.sourcesContent).toEqual(['source vlq']);
      expect(parsed.sections[1].map.x_facebook_sources).toEqual([
        [{names: ['<global>'], mappings: 'AAA'}],
      ]);
    });

    test('re-encodes a tuple-stored map into its section', async () => {
      const parsed = JSON.parse(
        await sourceMapStringImpl([fooModule, barModule], options),
      );
      expect(parsed.version).toBe(3);
      expect(parsed.sections).toHaveLength(2);
      expect(parsed.sections[1].offset).toEqual({line: 1, column: 0});
      expect(parsed.sections[1].map.sources).toEqual(['/root/bar.js']);
      expect(typeof parsed.sections[1].map.mappings).toBe('string');
    });

    test('omits per-section sourcesContent when excludeSource is set', async () => {
      const parsed = JSON.parse(
        await sourceMapStringImpl([vlqModule], {
          ...options,
          excludeSource: true,
        }),
      );
      expect(parsed.sections).toHaveLength(1);
      expect(parsed.sections[0].map.mappings).toBe('AAAA');
      expect(parsed.sections[0].map.sourcesContent).toBeUndefined();
    });

    test('marks ignored modules with per-section x_google_ignoreList', async () => {
      const parsed = JSON.parse(
        await sourceMapStringImpl([vlqModule], {
          ...options,
          shouldAddToIgnoreList: (module: Module<>) => true,
        }),
      );
      expect(parsed.sections).toHaveLength(1);
      expect(parsed.sections[0].map.x_google_ignoreList).toEqual([0]);
    });
  },
);
