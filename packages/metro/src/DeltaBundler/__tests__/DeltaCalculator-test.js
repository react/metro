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

import type {Graph as GraphType, Result} from '../Graph';
import type {
  Dependency,
  Module,
  Options,
  TransformResultDependency,
} from '../types';

import CountingSet from '../../lib/CountingSet';
import {createEmitChange, createPathNormalizer} from './test-utils';

jest.mock('../../Bundler');

describe.each(['posix', 'win32'])('DeltaCalculator (%s)', osPlatform => {
  let entryModule: Module<$FlowFixMe>;
  let fooModule: Module<$FlowFixMe>;
  let barModule: Module<$FlowFixMe>;
  let bazModule: Module<$FlowFixMe>;
  let quxModule: Module<$FlowFixMe>;

  let deltaCalculator;
  let fileWatcher;
  let traverseDependencies;
  let initialTraverseDependencies;
  let emitChange;
  const p = createPathNormalizer(osPlatform);

  const options: Options<> = {
    unstable_allowRequireContext: false,
    unstable_enablePackageExports: true,
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
    if (osPlatform === 'win32') {
      jest.doMock('node:path', () => jest.requireActual('node:path/win32'));
    } else {
      jest.doMock('node:path', () => jest.requireActual('node:path'));
    }

    const {EventEmitter} = require('node:events');
    const {Graph} = require('../Graph');

    traverseDependencies = jest.spyOn(Graph.prototype, 'traverseDependencies');
    initialTraverseDependencies = jest.spyOn(
      Graph.prototype,
      'initialTraverseDependencies',
    );

    fileWatcher = new EventEmitter();
    initialTraverseDependencies.mockImplementationOnce(async function <T>(
      this: Graph<T>,
      options: Options<T>,
    ): Promise<Result<T>> {
      entryModule = {
        dependencies: new Map([
          [
            'foo',
            {
              absolutePath: p('/foo'),
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
          [
            'bar',
            {
              absolutePath: p('/bar'),
              data: {
                name: 'bar',
                data: {
                  key: 'bar',
                  asyncType: null,
                  isESMImport: false,
                  locs: [],
                },
              },
            },
          ],
          [
            'baz',
            {
              absolutePath: p('/baz'),
              data: {
                name: 'baz',
                data: {
                  key: 'baz',
                  asyncType: null,
                  isESMImport: false,
                  locs: [],
                },
              },
            },
          ],
        ]),
        inverseDependencies: new CountingSet(),
        output: [],
        path: p('/bundle'),
        getSource: () => Buffer.of(),
      };
      fooModule = {
        dependencies: new Map([
          [
            'qux',
            {
              absolutePath: p('/qux'),
              data: {
                name: 'qux',
                data: {
                  key: 'qux',
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
        path: p('/foo'),
        getSource: () => Buffer.of(),
      };
      barModule = {
        dependencies: new Map<string, Dependency>(),
        inverseDependencies: new CountingSet([p('/bundle')]),
        output: [],
        path: p('/bar'),
        getSource: () => Buffer.of(),
      };
      bazModule = {
        dependencies: new Map<string, Dependency>(),
        inverseDependencies: new CountingSet([p('/bundle')]),
        output: [],
        path: p('/baz'),
        getSource: () => Buffer.of(),
      };
      quxModule = {
        dependencies: new Map<string, Dependency>(),
        inverseDependencies: new CountingSet([p('/foo')]),
        output: [],
        path: p('/qux'),
        getSource: () => Buffer.of(),
      };

      this.dependencies.set(p('/bundle'), entryModule);
      this.dependencies.set(p('/foo'), fooModule);
      this.dependencies.set(p('/bar'), barModule);
      this.dependencies.set(p('/baz'), bazModule);
      this.dependencies.set(p('/qux'), quxModule);

      return {
        added: new Map([
          [p('/bundle'), entryModule],
          [p('/foo'), fooModule],
          [p('/bar'), barModule],
          [p('/baz'), bazModule],
          [p('/qux'), quxModule],
        ]),
        modified: new Map(),
        deleted: new Set(),
      };
    });

    const DeltaCalculator = require('../DeltaCalculator').default;

    // $FlowFixMe[underconstrained-implicit-instantiation]
    deltaCalculator = new DeltaCalculator(
      new Set([p('/bundle')]),
      fileWatcher,
      options,
    );

    emitChange = createEmitChange(
      fileWatcher,
      p('/'),
      osPlatform === 'win32' ? '\\' : '/',
    );
  });

  afterEach(() => {
    deltaCalculator.end();

    traverseDependencies.mockReset();
    initialTraverseDependencies.mockReset();
    jest.resetModules();
  });

  test('should start listening for file changes after being initialized', async () => {
    expect(fileWatcher.listeners('change')).toHaveLength(1);
  });

  test('should stop listening for file changes after being destroyed', () => {
    deltaCalculator.end();

    expect(fileWatcher.listeners('change')).toHaveLength(0);
  });

  test('should include the entry file when calculating the initial bundle', async () => {
    const result = await deltaCalculator.getDelta({
      reset: false,
      shallow: false,
    });

    expect(result).toEqual({
      added: new Map([
        [p('/bundle'), entryModule],
        [p('/foo'), fooModule],
        [p('/bar'), barModule],
        [p('/baz'), bazModule],
        [p('/qux'), quxModule],
      ]),
      modified: new Map(),
      deleted: new Set(),
      reset: true,
    });

    jest.runAllTicks();
  });

  test('should return an empty delta when there are no changes', async () => {
    await deltaCalculator.getDelta({reset: false, shallow: false});

    expect(
      await deltaCalculator.getDelta({reset: false, shallow: false}),
    ).toEqual({
      added: new Map(),
      modified: new Map(),
      deleted: new Set(),
      reset: false,
    });

    expect(traverseDependencies.mock.calls.length).toBe(0);
  });

  test('should return a full delta when passing reset=true', async () => {
    await deltaCalculator.getDelta({reset: false, shallow: false});

    const result = await deltaCalculator.getDelta({
      reset: true,
      shallow: false,
    });

    expect(result).toEqual({
      added: new Map([
        [p('/bundle'), entryModule],
        [p('/foo'), fooModule],
        [p('/bar'), barModule],
        [p('/baz'), bazModule],
        [p('/qux'), quxModule],
      ]),
      modified: new Map(),
      deleted: new Set(),
      reset: true,
    });
  });

  test('should calculate a delta after a file addition', async () => {
    await deltaCalculator.getDelta({reset: false, shallow: false});

    emitChange({addedFiles: ['foo']});

    traverseDependencies.mockResolvedValueOnce({
      added: new Map([[p('/foo'), fooModule]]),
      modified: new Map(),
      deleted: new Set(),
    });

    const result = await deltaCalculator.getDelta({
      reset: false,
      shallow: false,
    });

    expect(result).toEqual({
      added: new Map(),
      modified: new Map(),
      deleted: new Set(),
      reset: false,
    });

    // Not called because there were no modified files.
    expect(traverseDependencies).not.toBeCalled();
  });

  test('should calculate a delta after a simple modification', async () => {
    await deltaCalculator.getDelta({reset: false, shallow: false});

    emitChange({modifiedFiles: ['foo']});

    traverseDependencies.mockReturnValue(
      Promise.resolve({
        added: new Map(),
        modified: new Map([[p('/foo'), fooModule]]),
        deleted: new Set(),
      }),
    );

    const result = await deltaCalculator.getDelta({
      reset: false,
      shallow: false,
    });

    expect(result).toEqual({
      added: new Map(),
      modified: new Map([[p('/foo'), fooModule]]),
      deleted: new Set(),
      reset: false,
    });

    expect(traverseDependencies.mock.calls.length).toBe(1);
  });

  test('should calculate a delta after removing a dependency', async () => {
    // Get initial delta
    await deltaCalculator.getDelta({reset: false, shallow: false});

    emitChange({modifiedFiles: ['foo']});

    traverseDependencies.mockReturnValue(
      Promise.resolve({
        added: new Map(),
        modified: new Map([[p('/foo'), fooModule]]),
        deleted: new Set([p('/baz')]),
      }),
    );

    const result = await deltaCalculator.getDelta({
      reset: false,
      shallow: false,
    });

    expect(result).toEqual({
      added: new Map(),
      modified: new Map([[p('/foo'), fooModule]]),
      deleted: new Set([p('/baz')]),
      reset: false,
    });

    expect(traverseDependencies.mock.calls.length).toBe(1);
  });

  test('should calculate a delta after adding/removing dependencies', async () => {
    // Get initial delta
    await deltaCalculator.getDelta({reset: false, shallow: false});

    emitChange({modifiedFiles: ['foo']});

    const quxModule: Module<$FlowFixMe> = {
      dependencies: new Map<string, Dependency>(),
      inverseDependencies: new CountingSet(),
      output: [],
      path: p('/qux'),
      getSource: () => Buffer.of(),
    };

    traverseDependencies.mockImplementation(async function <T>(
      this: GraphType<T>,
      paths: ReadonlyArray<string>,
      options: Options<T>,
    ): Promise<Result<T>> {
      this.dependencies.set(p('/qux'), quxModule);

      return {
        added: new Map(),
        modified: new Map([
          [p('/foo'), fooModule],
          [p('/qux'), quxModule],
        ]),
        deleted: new Set([p('/bar'), p('/baz')]),
      };
    });

    const result = await deltaCalculator.getDelta({
      reset: false,
      shallow: false,
    });
    expect(result).toEqual({
      added: new Map([]),
      modified: new Map([
        [p('/foo'), fooModule],
        [p('/qux'), quxModule],
      ]),
      deleted: new Set([p('/bar'), p('/baz')]),
      reset: false,
    });
  });

  test('should emit an event when there is a relevant file change', done => {
    deltaCalculator
      .getDelta({reset: false, shallow: false})
      .then(() => {
        deltaCalculator.on('change', () => done());
        emitChange({modifiedFiles: ['foo']});
      })
      .catch(done);
  });

  test('should emit an event when a file is added', async () => {
    const onChangeFile = jest.fn();
    await deltaCalculator.getDelta({reset: false, shallow: false});

    deltaCalculator.on('change', onChangeFile);

    emitChange({addedFiles: ['foo']});

    jest.runAllTimers();

    expect(onChangeFile).toHaveBeenCalled();
  });

  test('should not emit an event when there is a file deleted', async () => {
    const onChangeFile = jest.fn();
    await deltaCalculator.getDelta({reset: false, shallow: false});

    deltaCalculator.on('delete', onChangeFile);

    emitChange({removedFiles: ['foo']});

    jest.runAllTimers();

    expect(onChangeFile).not.toHaveBeenCalled();
  });

  test('should retry to build the last delta after getting an error', async () => {
    await deltaCalculator.getDelta({reset: false, shallow: false});

    emitChange({modifiedFiles: ['foo']});

    traverseDependencies.mockRejectedValue(new Error());

    await expect(
      deltaCalculator.getDelta({reset: false, shallow: false}),
    ).rejects.toBeInstanceOf(Error);

    // This second time it should still throw an error.
    await expect(
      deltaCalculator.getDelta({reset: false, shallow: false}),
    ).rejects.toBeInstanceOf(Error);
  });

  test('should never try to traverse a file after deleting it', async () => {
    await deltaCalculator.getDelta({reset: false, shallow: false});

    // First modify the file
    emitChange({modifiedFiles: ['foo']});

    // Then delete that same file
    emitChange({removedFiles: ['foo']});

    traverseDependencies.mockReturnValue(
      Promise.resolve({
        added: new Map(),
        modified: new Map([[p('/bundle'), entryModule]]),
        deleted: new Set([p('/foo')]),
      }),
    );

    expect(
      await deltaCalculator.getDelta({reset: false, shallow: false}),
    ).toEqual({
      added: new Map(),
      modified: new Map([[p('/bundle'), entryModule]]),
      deleted: new Set([p('/foo')]),
      reset: false,
    });

    expect(traverseDependencies).toHaveBeenCalledTimes(1);
    expect(traverseDependencies.mock.calls[0][0]).toEqual([p('/bundle')]);
  });

  test('does not traverse a file after deleting it and one of its dependencies', async () => {
    await deltaCalculator.getDelta({reset: false, shallow: false});

    // Delete a file
    emitChange({removedFiles: ['foo']});

    // Delete a dependency of the deleted file
    emitChange({removedFiles: ['qux']});

    traverseDependencies.mockReturnValue(
      Promise.resolve({
        added: new Map(),
        modified: new Map([[p('/bundle'), entryModule]]),
        deleted: new Set([p('/foo')]),
      }),
    );

    await deltaCalculator.getDelta({reset: false, shallow: false});

    // Only the /bundle module should have been traversed (since it's an
    // inverse dependency of /foo).
    expect(traverseDependencies).toHaveBeenCalledTimes(1);
    expect(traverseDependencies.mock.calls[0][0]).toEqual([p('/bundle')]);
  });

  test('should not do unnecessary work when adding a file after deleting it', async () => {
    await deltaCalculator.getDelta({reset: false, shallow: false});

    // First delete a file
    emitChange({removedFiles: ['foo']});

    // Then add it again
    emitChange({modifiedFiles: ['foo']});

    traverseDependencies.mockReturnValue(
      Promise.resolve({
        added: new Map(),
        modified: new Map([[p('/foo'), entryModule]]),
        deleted: new Set(),
      }),
    );

    await deltaCalculator.getDelta({reset: false, shallow: false});

    expect(traverseDependencies).toHaveBeenCalledTimes(1);
    expect(traverseDependencies.mock.calls[0][0]).toEqual([p('/foo')]);
  });

  test.each(['add', 'delete'])(
    "should re-traverse everything after a symlink '%s'",
    async eventType => {
      await deltaCalculator.getDelta({reset: false, shallow: false});

      const changeEmitted = new Promise(resolve =>
        deltaCalculator.once('change', resolve),
      );

      if (eventType === 'add') {
        emitChange({addedFiles: [['link', {isSymlink: true}]]});
      } else {
        emitChange({removedFiles: [['link', {isSymlink: true}]]});
      }

      // Any symlink change should trigger a 'change' event
      await changeEmitted;

      const traverseResult: Result<{}> = {
        added: new Map(),
        modified: new Map(),
        deleted: new Set(),
      };
      traverseDependencies.mockResolvedValueOnce(traverseResult);

      const result = await deltaCalculator.getDelta({
        reset: false,
        shallow: false,
      });

      // Revisit the whole graph since any resolution could have become invalid.
      expect(traverseDependencies).toHaveBeenCalledWith(
        ['/bundle', '/foo', '/bar', '/baz', '/qux'].map(p),
        expect.objectContaining({shallow: false}),
      );

      expect(result).toEqual({...traverseResult, reset: false});

      // Does not attempt to traverse again on a subsequent delta request.
      traverseDependencies.mockClear();
      await deltaCalculator.getDelta({
        reset: false,
        shallow: false,
      });
      expect(traverseDependencies).not.toHaveBeenCalled();
    },
  );

  test('should re-traverse everything after a package.json change (when unstable_enablePackageExports is true)', async () => {
    await deltaCalculator.getDelta({reset: false, shallow: false});

    const changeEmitted = new Promise(resolve =>
      deltaCalculator.once('change', resolve),
    );

    emitChange({modifiedFiles: ['node_modules/foo/package.json']});

    // Any package.json change should trigger a 'change' event
    await changeEmitted;

    const traverseResult: Result<{}> = {
      added: new Map(),
      modified: new Map(),
      deleted: new Set(),
    };
    traverseDependencies.mockResolvedValueOnce(traverseResult);

    const result = await deltaCalculator.getDelta({
      reset: false,
      shallow: false,
    });

    // Revisit the whole graph
    // TODO(T142404809): Replace requiresReset approach with better-scoped
    // invalidation of inverse dependencies
    expect(traverseDependencies).toHaveBeenCalledWith(
      ['/bundle', '/foo', '/bar', '/baz', '/qux'].map(p),
      expect.objectContaining({shallow: false}),
    );

    expect(result).toEqual({...traverseResult, reset: false});

    // Does not attempt to traverse again on a subsequent delta request.
    traverseDependencies.mockClear();
    await deltaCalculator.getDelta({
      reset: false,
      shallow: false,
    });
    expect(traverseDependencies).not.toHaveBeenCalled();
  });

  test('should emit a stable changeId for a change event', async () => {
    await deltaCalculator.getDelta({reset: false, shallow: false});

    const changeIds: Array<string> = [];
    deltaCalculator.on('change', ({changeId}: {changeId?: string}) => {
      if (changeId != null) {
        changeIds.push(changeId);
      }
    });

    // Emit a change event with multiple file changes
    emitChange({modifiedFiles: ['foo', 'bar']});

    expect(changeIds).toHaveLength(1);
    expect(typeof changeIds[0]).toBe('string');
    expect(changeIds[0].length).toBeGreaterThan(0);
  });

  test('should emit different changeIds for separate change events', async () => {
    await deltaCalculator.getDelta({reset: false, shallow: false});

    const changeIds: Array<string> = [];
    deltaCalculator.on('change', ({changeId}: {changeId?: string}) => {
      if (changeId != null) {
        changeIds.push(changeId);
      }
    });

    emitChange({modifiedFiles: ['foo']});
    emitChange({modifiedFiles: ['bar']});

    expect(changeIds).toHaveLength(2);
    expect(changeIds[0]).not.toEqual(changeIds[1]);
  });

  test('should not mutate an existing graph when calling end()', async () => {
    await deltaCalculator.getDelta({reset: false, shallow: false});
    const graph = deltaCalculator.getGraph();

    const numDependencies = graph.dependencies.size;

    deltaCalculator.end();

    expect(graph.dependencies.size).toEqual(numDependencies);
  });
});
