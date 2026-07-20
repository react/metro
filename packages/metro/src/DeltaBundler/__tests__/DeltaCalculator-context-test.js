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

import type {Result} from '../Graph';
import type {Options, TransformResultDependency} from '../types';

import CountingSet from '../../lib/CountingSet';
import DeltaCalculator from '../DeltaCalculator';
import {Graph} from '../Graph';
import {createEmitChange, createPathNormalizer} from './test-utils';
import path from 'node:path';

const {EventEmitter} = require('node:events');

const traverseDependencies = jest.spyOn(
  Graph.prototype,
  'traverseDependencies',
);
const initialTraverseDependencies = jest.spyOn(
  Graph.prototype,
  'initialTraverseDependencies',
);
const markModifiedContextModules = jest.spyOn(
  Graph.prototype,
  'markModifiedContextModules',
);

describe('DeltaCalculator + require.context', () => {
  let deltaCalculator;
  let fileWatcher;
  let emitChange;
  const p = createPathNormalizer();

  const options: Options<> = {
    unstable_allowRequireContext: true,
    unstable_enablePackageExports: false,
    unstable_incrementalResolution: false,
    lazy: false,
    onProgress: null,
    resolve: (from: string, to: TransformResultDependency) => {
      throw new Error('Never called');
    },
    shallow: false,
    transform: (modulePath: string) => {
      throw new Error('Never called');
    },
    transformOptions: {
      // NOTE: These options are ignored because we mock out the transformer (via traverseDependencies).
      dev: false,
      minify: false,
      platform: null,
      type: 'module',
      unstable_transformProfile: 'default',
    },
  };

  beforeEach(async () => {
    fileWatcher = new EventEmitter();
    emitChange = createEmitChange(fileWatcher, p('/'), path.sep);

    markModifiedContextModules.mockImplementation(function <T>(
      this: Graph<T>,
      filePath,
      modifiedContexts,
    ) {
      if (filePath.startsWith(p('/ctx/'))) {
        modifiedContexts.add(p('/ctx?ctx=xxx'));
      }
    });

    /*
      ┌─────────┐  require.context('./ctx', ...)   ┌──────────────┐     ┌──────────┐
      │ /bundle │ ───────────────────────────────▶ │ /ctx?ctx=xxx │ ──▶ │ /ctx/foo │
      └─────────┘                                  └──────────────┘     └──────────┘
     */

    initialTraverseDependencies.mockImplementationOnce(async function <T>(
      this: Graph<T>,
      options: Options<T>,
    ): Promise<Result<T>> {
      this.dependencies.set(p('/bundle'), {
        dependencies: new Map([
          [
            'ctx',
            {
              absolutePath: p('/ctx?ctx=xxx'),
              data: {
                name: 'ctx',
                data: {
                  key: 'ctx?ctx=xxx',
                  asyncType: null,
                  isESMImport: false,
                  locs: [],
                },
              },
            },
          ],
        ]),
        inverseDependencies: new CountingSet([]),
        output: [],
        path: p('/bundle'),
        getSource: () => Buffer.of(),
      });
      this.dependencies.set(p('/ctx?ctx=xxx'), {
        dependencies: new Map([
          [
            'foo',
            {
              absolutePath: p('/ctx/foo'),
              data: {
                name: 'foo',
                data: {
                  key: 'foo',
                  asyncType: null,
                  isESMImport: false,
                  locs: [],
                },
              },
            },
          ],
        ]),
        inverseDependencies: new CountingSet([p('/bundle')]),
        output: [],
        path: p('/ctx?ctx=xxx'),
        getSource: () => Buffer.of(),
      });
      this.dependencies.set(p('/ctx/foo'), {
        dependencies: new Map(),
        inverseDependencies: new CountingSet([p('/ctx?ctx=xxx')]),
        output: [],
        path: p('/ctx/foo'),
        getSource: () => Buffer.of(),
      });

      return {
        added: new Map(this.dependencies),
        modified: new Map(),
        deleted: new Set(),
      };
    });

    // We don't assert on the actual deltas, so use an empty mock.
    traverseDependencies.mockReturnValue(
      Promise.resolve({
        added: new Map(),
        modified: new Map(),
        deleted: new Set(),
      }),
    );

    // $FlowFixMe[underconstrained-implicit-instantiation]
    deltaCalculator = new DeltaCalculator(
      new Set([p('/bundle')]),
      fileWatcher,
      options,
    );
  });

  afterEach(() => {
    deltaCalculator.end();

    traverseDependencies.mockReset();
    initialTraverseDependencies.mockReset();
  });

  test('removing a file from a context marks the context as modified', async () => {
    // Initial build
    await deltaCalculator.getDelta({reset: false, shallow: false});

    emitChange({removedFiles: ['ctx/foo']});

    // Incremental build
    await deltaCalculator.getDelta({
      reset: false,
      shallow: false,
    });

    expect(traverseDependencies).toBeCalledWith(
      [p('/ctx?ctx=xxx')],
      expect.anything(),
    );

    // We rely on inverse dependencies to update a context module.
    expect(markModifiedContextModules).not.toBeCalled();

    expect(traverseDependencies).toBeCalledTimes(1);
  });

  test('adding a file to a context marks the context as modified', async () => {
    // Initial build
    await deltaCalculator.getDelta({reset: false, shallow: false});

    emitChange({addedFiles: ['ctx/foo2']});

    // Incremental build
    await deltaCalculator.getDelta({
      reset: false,
      shallow: false,
    });

    expect(traverseDependencies).toBeCalledWith(
      [p('/ctx?ctx=xxx')],
      expect.anything(),
    );

    expect(traverseDependencies).toBeCalledTimes(1);
  });

  test('modifying an existing file in a context does not mark the context as modified', async () => {
    // Initial build
    await deltaCalculator.getDelta({reset: false, shallow: false});

    emitChange({modifiedFiles: ['ctx/foo']});

    // Incremental build
    await deltaCalculator.getDelta({
      reset: false,
      shallow: false,
    });

    expect(traverseDependencies).toBeCalledWith(
      [p('/ctx/foo')],
      expect.anything(),
    );

    expect(traverseDependencies).toBeCalledTimes(1);
  });

  test('modifying a potential match of a context, without adding it, does not trigger a rebuild', async () => {
    // Initial build
    await deltaCalculator.getDelta({reset: false, shallow: false});

    emitChange({modifiedFiles: ['ctx/foo2']});

    // Incremental build
    await deltaCalculator.getDelta({
      reset: false,
      shallow: false,
    });

    expect(traverseDependencies).not.toBeCalled();
  });

  test('adding a file to a context, and immediately modifying it, marks the context as modified', async () => {
    // Initial build
    await deltaCalculator.getDelta({reset: false, shallow: false});

    emitChange({addedFiles: ['ctx/foo2']});

    emitChange({modifiedFiles: ['ctx/foo2']});

    // Incremental build
    await deltaCalculator.getDelta({
      reset: false,
      shallow: false,
    });

    expect(traverseDependencies).toBeCalledWith(
      [p('/ctx?ctx=xxx')],
      expect.anything(),
    );

    expect(traverseDependencies).toBeCalledTimes(1);
  });

  test('adding a file to a context, and immediately removing it, does not trigger a rebuild', async () => {
    // Initial build
    await deltaCalculator.getDelta({reset: false, shallow: false});

    emitChange({addedFiles: ['ctx/foo2']});

    emitChange({removedFiles: ['ctx/foo2']});

    // Incremental build
    await deltaCalculator.getDelta({
      reset: false,
      shallow: false,
    });

    expect(traverseDependencies).not.toBeCalled();
  });

  test('removing a file from a context, and immediately adding it back, only rebuilds the file itself', async () => {
    // Initial build
    await deltaCalculator.getDelta({reset: false, shallow: false});

    emitChange({removedFiles: ['ctx/foo']});

    emitChange({addedFiles: ['ctx/foo']});

    // Incremental build
    await deltaCalculator.getDelta({
      reset: false,
      shallow: false,
    });

    expect(traverseDependencies).toBeCalledWith(
      [p('/ctx/foo')],
      expect.anything(),
    );
  });

  test('modifying an existing file in a context, and immediately removing it, marks the context as modified', async () => {
    // Initial build
    await deltaCalculator.getDelta({reset: false, shallow: false});

    emitChange({modifiedFiles: ['ctx/foo']});

    emitChange({removedFiles: ['ctx/foo']});

    // Incremental build
    await deltaCalculator.getDelta({
      reset: false,
      shallow: false,
    });

    expect(traverseDependencies).toBeCalledWith(
      [p('/ctx?ctx=xxx')],
      expect.anything(),
    );

    expect(traverseDependencies).toBeCalledTimes(1);
  });
});
