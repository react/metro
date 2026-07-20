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

/*
 * Diagrams in this file are created with the help of
 * https://dot-to-ascii.ggerganov.com/ with rankdir=lr and "Boxart" mode, e.g:
 *
 * digraph {
 *   rankdir = lr
 *   "/bundle" -> "/foo"
 *   "/foo" -> "/bar"
 *   "/foo" -> "/baz"
 *   "/baz" -> "/foo"
 *   "/baz" -> "/async" [style=dotted,label="async"]
 * }
 *
 * - Represent the delta visually: use thicker lines for added modules/edges,
 *   cross out deleted modules/edges (this needs to be done manually)
 * - Put a comment above each initialTraverseDependencies or
 *   traverseDependencies call with the state of the graph which that call will
 *   observe.
 * - Ideally, keep the same graph layout from comment to comment (e.g. first
 *   render out the most complete version of the graph and manually remove
 *   boxes/lines as needed).
 */

import type {RequireContext} from '../../lib/contextModule';
import type {RequireContextParams} from '../../ModuleGraph/worker/collectDependencies';
import type {Result} from '../Graph';
import type {
  Dependency,
  MixedOutput,
  Module,
  Options,
  ReadOnlyDependencies,
  ReadOnlyGraph,
  ResolvedDependency,
  TransformFn,
  TransformResultDependency,
  TransformResultWithSource,
} from '../types';

import {deriveAbsolutePathFromContext} from '../../lib/contextModule';
import CountingSet from '../../lib/CountingSet';
import {Graph} from '../Graph';
import nullthrows from 'nullthrows';

const {objectContaining} = expect;

type DependencyDataInput = Partial<TransformResultDependency['data']>;

let mockedDependencies: Set<string> = new Set();
let mockedDependencyTree: Map<
  string,
  Array<
    Readonly<{
      name: string,
      path: string,
      data: DependencyDataInput,
    }>,
  >,
> = new Map();

/* `files` emulates the changed paths typically aggregated by DeltaCalcutor.
 * Paths will be added to this set by any addition, deletion or modification,
 * respecting getModifiedModulesForDeletedPath. Each such operation will
 * increment the count - we'll intepret count as a file revision number, with
 * a changed count reflected in a change to the transform output key.
 */
const files = new CountingSet<string>();

/* The default mock transformer in these tests may be overridden for specific
 * module paths by setting an entry in this map.
 */
let transformOverrides: Map<string, TransformFn<MixedOutput>>;

let graph: TestGraph;
let options: Options<>;

let entryModule;
let moduleFoo;
let moduleBar;
let moduleBaz;

let mockTransform;

const getMockDependency = (path: string) => {
  const deps = mockedDependencyTree.get(path);
  if (!deps) {
    throw new Error(`No mock dependency named: ${path}`);
  }
  return deps;
};

const Actions = {
  modifyFile(path: string) {
    if (mockedDependencies.has(path)) {
      files.add(path);
    }
  },

  moveFile(from: string, to: string, graph: Graph<>) {
    Actions.createFile(to);
    Actions.deleteFile(from, graph);
  },

  deleteFile(path: string, graph: Graph<>) {
    mockedDependencies.delete(path);
    for (const modifiedPath of graph.getModifiedModulesForDeletedPath(path)) {
      Actions.modifyFile(modifiedPath);
    }
  },

  createFile(path: string): string {
    mockedDependencies.add(path);
    mockedDependencyTree.set(path, []);

    return path;
  },

  addDependency(
    path: string,
    dependencyPath: string,
    options: {
      position?: ?number,
      name?: string,
      data?: DependencyDataInput,
    } = {},
  ): string {
    const key = Actions.addInferredDependency(path, dependencyPath, options);
    files.add(path);
    return key;
  },

  addInferredDependency(
    path: string,
    dependencyPath: string,
    {
      position,
      name,
      data,
    }: {
      position?: ?number,
      name?: string,
      data?: DependencyDataInput,
    } = {},
  ): string {
    if (!mockedDependencies.has(path)) {
      Actions.createFile(path);
    }
    const deps = getMockDependency(path);
    const depName = name ?? dependencyPath.replace('/', '');
    const key = require('node:crypto')
      .createHash('sha1')
      .update([depName, data?.asyncType ?? '(null)'].join('\0'))
      .digest('base64');
    const dep = {
      name: depName,
      path: dependencyPath,
      data: {key, ...(data ?? {})},
    };
    if (
      deps.findIndex(existingDep => existingDep.data.key === dep.data.key) !==
      -1
    ) {
      throw new Error('Found existing mock dep with key: ' + dep.data.key);
    }
    if (position == null) {
      deps.push(dep);
    } else {
      deps.splice(position, 0, dep);
    }

    mockedDependencyTree.set(path, deps);
    mockedDependencies.add(dependencyPath);
    return key;
  },

  removeDependency(path: string, dependencyPath: string) {
    Actions.removeInferredDependency(path, dependencyPath);
    files.add(path);
  },

  removeDependencyByKey(path: string, key: string) {
    Actions.removeInferredDependencyByKey(path, key);
    files.add(path);
  },

  removeInferredDependency(path: string, dependencyPath: string) {
    const deps = nullthrows(mockedDependencyTree.get(path));

    const index = deps.findIndex(({path}) => path === dependencyPath);
    if (index !== -1) {
      deps.splice(index, 1);
      mockedDependencyTree.set(path, deps);
    }
  },

  removeInferredDependencyByKey(path: string, key: string) {
    const deps = nullthrows(mockedDependencyTree.get(path));
    const index = deps.findIndex(({data}) => data.key === key);
    if (index !== -1) {
      deps.splice(index, 1);
      mockedDependencyTree.set(path, deps);
    }
  },
};

function deferred(
  value: Readonly<{
    dependencies: ReadonlyArray<TransformResultDependency>,
    getSource: () => Buffer,
    output: ReadonlyArray<MixedOutput>,
    unstable_transformResultKey?: ?string,
  }>,
) {
  let resolve;
  const promise = new Promise(res => (resolve = res));

  return {promise, resolve: () => resolve(value)};
}

/* $FlowFixMe[missing-local-annot] The type annotation(s) required by Flow's
 * LTI update could not be added via codemod */
function getPaths({added, modified, deleted}) {
  const addedPaths = [...added.values()].map(module => module.path);
  const modifiedPaths = [...modified.values()].map(module => module.path);

  return {
    added: new Set(addedPaths),
    modified: new Set(modifiedPaths),
    deleted,
  };
}

// Compute a delta between the keys of modules1 and modules2, in the same
// format returned by getPaths. Modified paths are passed in as modifiedPaths
// because our mocks don't actually model file contents.
function computeDelta(
  modules1: Set<string>,
  modules2: ReadOnlyDependencies<>,
  modifiedPaths: Set<string>,
) {
  const added = new Set<string>();
  const modified = new Set<string>();
  const deleted = new Set<string>();

  for (const id of modules1.keys()) {
    if (!modules2.has(id)) {
      deleted.add(id);
    } else if (modifiedPaths.has(id)) {
      modified.add(id);
    }
  }

  for (const id of modules2.keys()) {
    if (!modules1.has(id)) {
      added.add(id);
    }
  }

  return {
    added,
    modified,
    deleted,
  };
}

function computeInverseDependencies(
  graph: ReadOnlyGraph<>,
  options: Options<>,
) {
  const allInverseDependencies = new Map<string, Set<string>>();
  for (const path of graph.dependencies.keys()) {
    allInverseDependencies.set(path, new Set());
  }
  for (const module of graph.dependencies.values()) {
    for (const dependency of module.dependencies.values()) {
      if (
        dependency.absolutePath == null ||
        (options.lazy && dependency.data.data.asyncType != null)
      ) {
        // Async deps aren't tracked in inverseDependencies
        continue;
      }
      const inverseDependencies =
        allInverseDependencies.get(dependency.absolutePath) ?? new Set();
      allInverseDependencies.set(dependency.absolutePath, inverseDependencies);

      inverseDependencies.add(module.path);
    }
  }
  return allInverseDependencies;
}

class TestGraph extends Graph<> {
  async traverseDependencies(
    paths: ReadonlyArray<string>,
    options: Options<>,
  ): Promise<Result<MixedOutput>> {
    // Get a snapshot of the graph before the traversal.
    const dependenciesBefore = new Set(this.dependencies.keys());
    const modifiedPaths = new Set(files);

    // Mutate the graph and calculate a delta.
    const delta = await super.traverseDependencies(paths, options);

    // Validate the delta against the current state of the graph.
    const expectedDelta = computeDelta(
      dependenciesBefore,
      this.dependencies,
      modifiedPaths,
    );
    expect(getPaths(delta)).toEqual(expectedDelta);

    // Ensure the inverseDependencies and dependencies sets are in sync.
    const expectedInverseDependencies = computeInverseDependencies(
      this,
      options,
    );
    const actualInverseDependencies = new Map<string, Set<string>>();
    for (const [path, module] of this.dependencies) {
      actualInverseDependencies.set(path, new Set(module.inverseDependencies));
    }
    expect(actualInverseDependencies).toEqual(expectedInverseDependencies);

    return delta;
  }
}

// $FlowFixMe[missing-local-annot]
function getMatchingContextModules<T>(graph: Graph<T>, filePath: string) {
  const contextPaths = new Set<string>();
  graph.markModifiedContextModules(filePath, contextPaths);
  return contextPaths;
}

beforeEach(async () => {
  mockedDependencies = new Set();
  mockedDependencyTree = new Map();
  transformOverrides = new Map();

  mockTransform = jest
    .fn<
      [string, ?RequireContext],
      Promise<TransformResultWithSource<MixedOutput>>,
    >()
    .mockImplementation(async (path: string, context: ?RequireContext) => {
      const override = transformOverrides.get(path);
      if (override != null) {
        return override(path, context);
      }
      const unstable_transformResultKey =
        path +
        (context
          ? // For context modules, the real transformer will hash the
            // generated template, which varies according to its dependencies.
            // Approximate that by concatenating dependency paths.
            (mockedDependencyTree.get(path) ?? [])
              .map(d => d.path)
              .sort()
              .join('|')
          : ` (revision ${files.count(path)})`);
      return {
        dependencies: (mockedDependencyTree.get(path) || []).map(dep => ({
          name: dep.name,
          data: {
            asyncType: null,
            isESMImport: false,
            // $FlowFixMe[missing-empty-array-annot]
            locs: [],
            // $FlowFixMe[incompatible-type]
            key: dep.data.key,
            ...dep.data,
          },
        })),
        getSource: () =>
          Buffer.from('// source' + (context ? ' (context)' : '')),
        output: [
          {
            data: {
              code: '// code' + (context ? ' (context)' : ''),
              lineCount: 1,
              map: [],
            },
            type: 'js/module',
          },
        ],
        unstable_transformResultKey,
      };
    });

  options = {
    unstable_allowRequireContext: false,
    unstable_enablePackageExports: false,
    unstable_incrementalResolution: false,
    lazy: false,
    onProgress: null,
    resolve: (from: string, to: TransformResultDependency) => {
      const deps = getMockDependency(from);
      const {path} = deps.filter(dep => dep.name === to.name)[0];

      if (!mockedDependencies.has(path)) {
        throw new Error(`Dependency not found: ${from} -> ${path}`);
      }
      return {type: 'sourceFile', filePath: path};
    },
    transform: mockTransform,
    transformOptions: {
      // NOTE: These options are ignored because we mock out the transformer.
      dev: false,
      minify: false,
      platform: null,
      type: 'module',
      unstable_transformProfile: 'default',
    },
    shallow: false,
  };

  /*
  Generate the initial dependency graph:
  ┌─────────┐     ┌──────┐     ┌──────┐
  │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │
  └─────────┘     └──────┘     └──────┘
                    │
                    │
                    ▼
                  ┌──────┐
                  │ /baz │
                  └──────┘
  */
  entryModule = Actions.createFile('/bundle');
  moduleFoo = Actions.createFile('/foo');
  moduleBar = Actions.createFile('/bar');
  moduleBaz = Actions.createFile('/baz');

  Actions.addDependency('/bundle', '/foo');
  Actions.addDependency('/foo', '/bar');
  Actions.addDependency('/foo', '/baz');

  files.clear();

  graph = new TestGraph({
    entryPoints: new Set(['/bundle']),
    transformOptions: options.transformOptions,
  });
});

test('should do the initial traversal correctly', async () => {
  const result = await graph.initialTraverseDependencies(options);

  expect(getPaths(result)).toEqual({
    added: new Set(['/bundle', '/foo', '/bar', '/baz']),
    modified: new Set(),
    deleted: new Set(),
  });

  expect(graph).toMatchSnapshot();
});

test('should populate all the inverse dependencies', async () => {
  // create a second inverse dependency on /bar.
  Actions.addDependency('/bundle', '/bar');

  await graph.initialTraverseDependencies(options);

  expect(
    nullthrows(graph.dependencies.get('/bar')).inverseDependencies,
  ).toEqual(new CountingSet(['/foo', '/bundle']));
});

test('should return an empty result when there are no changes', async () => {
  await graph.initialTraverseDependencies(options);

  expect(
    getPaths(await graph.traverseDependencies(['/bundle'], options)),
  ).toEqual({
    added: new Set(),
    modified: new Set([]),
    deleted: new Set(),
  });
});

test('should return a removed dependency', async () => {
  await graph.initialTraverseDependencies(options);

  Actions.removeDependency('/foo', '/bar');

  expect(
    getPaths(await graph.traverseDependencies([...files], options)),
  ).toEqual({
    added: new Set(),
    modified: new Set(['/foo']),
    deleted: new Set(['/bar']),
  });
});

test('should return added/removed dependencies', async () => {
  await graph.initialTraverseDependencies(options);

  Actions.addDependency('/foo', '/qux');
  Actions.removeDependency('/foo', '/bar');
  Actions.removeDependency('/foo', '/baz');

  expect(
    getPaths(await graph.traverseDependencies([...files], options)),
  ).toEqual({
    added: new Set(['/qux']),
    modified: new Set(['/foo']),
    deleted: new Set(['/bar', '/baz']),
  });
});

test('should retry to traverse the dependencies as it was after getting an error', async () => {
  await graph.initialTraverseDependencies(options);

  Actions.deleteFile(moduleBar, graph);

  await expect(
    graph.traverseDependencies(['/foo'], options),
  ).rejects.toBeInstanceOf(Error);

  // Second time that the traversal of dependencies we still have to throw an
  // error (no matter if no file has been changed).
  await expect(
    graph.traverseDependencies(['/foo'], options),
  ).rejects.toBeInstanceOf(Error);
});

test('should retry traversing dependencies after a transform error', async () => {
  class BadError extends Error {}

  const localOptions = {
    ...options,
    transform(path: string, context: ?RequireContext) {
      if (path === '/bad') {
        throw new BadError();
      }
      // $FlowFixMe[object-this-reference]: transform should not be bound to anything
      return options.transform.call(this, path, context);
    },
  };

  await graph.initialTraverseDependencies(localOptions);

  Actions.createFile('/bad');
  Actions.addDependency('/foo', '/bad');

  await expect(
    graph.traverseDependencies(['/foo'], localOptions),
  ).rejects.toBeInstanceOf(BadError);

  // Repeated attempt should give the same error.
  await expect(
    graph.traverseDependencies(['/foo'], localOptions),
  ).rejects.toBeInstanceOf(BadError);

  // Finally, pass normal `options` that don't reject the '/bad' module:
  expect(
    getPaths(await graph.traverseDependencies([...files], options)),
  ).toEqual({
    added: new Set(['/bad']),
    modified: new Set(['/foo']),
    deleted: new Set(),
  });
});

test('should not traverse past the initial module if `shallow` is passed', async () => {
  const result = await graph.initialTraverseDependencies({
    ...options,
    shallow: true,
  });

  expect(getPaths(result)).toEqual({
    added: new Set(['/bundle']),
    modified: new Set(),
    deleted: new Set(),
  });

  expect(graph).toMatchSnapshot();
});

describe('Progress updates', () => {
  test('calls back for each finished module', async () => {
    const onProgress = jest.fn();

    await graph.initialTraverseDependencies({...options, onProgress});

    // We get a progress change twice per dependency
    // (when we discover it and when we process it).
    expect(onProgress.mock.calls.length).toBe(mockedDependencies.size * 2);
  });

  test('increases the number of discover/finished modules in steps of one', async () => {
    const onProgress = jest.fn();

    await graph.initialTraverseDependencies({...options, onProgress});

    const lastCall = {
      num: 0,
      total: 0,
    };
    for (const call of onProgress.mock.calls) {
      expect(call[0]).toBeGreaterThanOrEqual(lastCall.num);
      expect(call[1]).toBeGreaterThanOrEqual(lastCall.total);

      expect(call[0] + call[1]).toEqual(lastCall.num + lastCall.total + 1);
      lastCall.num = call[0];
      lastCall.total = call[1];
    }
  });

  test('increases the number of discover/finished modules in steps of one when there are multiple entrypoints', async () => {
    const onProgress = jest.fn();

    // Add a new entry point to the graph.
    Actions.createFile('/bundle-2');
    Actions.addDependency('/bundle-2', '/qux');
    Actions.addDependency('/bundle-2', '/foo');
    graph = new TestGraph({
      entryPoints: new Set(['/bundle', '/bundle-2']),
      transformOptions: options.transformOptions,
    });

    await graph.initialTraverseDependencies({...options, onProgress});

    const lastCall = {
      num: 0,
      total: 0,
    };
    for (const call of onProgress.mock.calls) {
      expect(call[0]).toBeGreaterThanOrEqual(lastCall.num);
      expect(call[1]).toBeGreaterThanOrEqual(lastCall.total);

      expect(call[0] + call[1]).toEqual(lastCall.num + lastCall.total + 1);
      lastCall.num = call[0];
      lastCall.total = call[1];
    }
  });
});

describe('edge cases', () => {
  test('should handle cyclic dependencies', async () => {
    Actions.addDependency('/baz', '/foo');
    files.clear();

    expect(getPaths(await graph.initialTraverseDependencies(options))).toEqual({
      added: new Set(['/bundle', '/foo', '/bar', '/baz']),
      modified: new Set(),
      deleted: new Set(),
    });

    expect(
      nullthrows(graph.dependencies.get('/foo')).inverseDependencies,
    ).toEqual(new CountingSet(['/baz', '/bundle']));
  });

  test('should handle renames correctly', async () => {
    await graph.initialTraverseDependencies(options);

    Actions.removeDependency('/foo', '/baz');
    Actions.moveFile('/baz', '/qux', graph);
    Actions.addDependency('/foo', '/qux');

    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
    ).toEqual({
      added: new Set(['/qux']),
      modified: new Set(['/foo']),
      deleted: new Set(['/baz']),
    });
  });

  test('should not try to remove wrong dependencies when renaming files', async () => {
    await graph.initialTraverseDependencies(options);

    // Rename /foo to /foo-renamed, but keeping all its dependencies.
    Actions.addDependency('/bundle', '/foo-renamed');
    Actions.removeDependency('/bundle', '/foo');

    Actions.moveFile('/foo', '/foo-renamed', graph);
    Actions.addDependency('/foo-renamed', '/bar');
    Actions.addDependency('/foo-renamed', '/baz');

    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
    ).toEqual({
      added: new Set(['/foo-renamed']),
      modified: new Set(['/bundle']),
      deleted: new Set(['/foo']),
    });

    expect(graph.dependencies.get('/foo')).toBe(undefined);
  });

  test('should handle file extension changes correctly', async () => {
    await graph.initialTraverseDependencies(options);

    Actions.removeDependency('/foo', '/baz');
    Actions.addDependency('/foo', '/baz.js', {name: 'baz'});

    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
    ).toEqual({
      added: new Set(['/baz.js']),
      modified: new Set(['/foo']),
      deleted: new Set(['/baz']),
    });
  });

  test('modify a file and delete it afterwards', async () => {
    await graph.initialTraverseDependencies(options);

    Actions.modifyFile('/baz');
    Actions.removeDependency('/foo', '/baz');

    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
    ).toEqual({
      added: new Set(),
      modified: new Set(['/foo']),
      deleted: new Set(['/baz']),
    });

    expect(graph.dependencies.get('/baz')).toBe(undefined);
  });

  test('remove a dependency and modify it afterwards', async () => {
    await graph.initialTraverseDependencies(options);

    Actions.removeDependency('/bundle', '/foo');
    Actions.modifyFile('/foo');

    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
    ).toEqual({
      added: new Set(),
      modified: new Set(['/bundle']),
      deleted: new Set(['/foo', '/bar', '/baz']),
    });

    expect(graph.dependencies.get('/foo')).toBe(undefined);
    expect(graph.dependencies.get('/bar')).toBe(undefined);
    expect(graph.dependencies.get('/baz')).toBe(undefined);
  });

  test('remove a dependency, modify it, and re-add it elsewhere', async () => {
    await graph.initialTraverseDependencies(options);

    Actions.removeDependency('/foo', '/bar');
    Actions.modifyFile('/bar');
    Actions.addDependency('/baz', '/bar');

    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
    ).toEqual({
      added: new Set(),
      modified: new Set(['/foo', '/bar', '/baz']),
      deleted: new Set(),
    });
  });

  test('Add a dependency, modify it, and remove it', async () => {
    await graph.initialTraverseDependencies(options);

    Actions.createFile('/quux');
    Actions.addDependency('/bar', '/quux');
    Actions.modifyFile('/quux');
    Actions.removeDependency('/foo', '/bar');

    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
    ).toEqual({
      added: new Set(),
      modified: new Set(['/foo']),
      deleted: new Set(['/bar']),
    });
  });

  test('removes a cyclic dependency but should not remove any dependency', async () => {
    Actions.createFile('/bar1');
    Actions.addDependency('/bar', '/bar1');
    Actions.addDependency('/bar1', '/foo');
    Actions.addDependency('/bundle', '/bar');
    files.clear();

    await graph.initialTraverseDependencies(options);

    Actions.removeDependency('/bundle', '/foo');

    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
    ).toEqual({
      added: new Set(),
      modified: new Set(['/bundle']),
      deleted: new Set([]),
    });
  });

  test('removes cyclic leaf dependencies interchangeably', async () => {
    Actions.createFile('/core');
    Actions.createFile('/a');
    Actions.createFile('/b');
    Actions.addDependency('/core', '/a');
    Actions.addDependency('/core', '/b');
    Actions.addDependency('/a', '/baz');
    Actions.addDependency('/bundle', '/core');
    Actions.addDependency('/foo', '/core');
    files.clear();

    await graph.initialTraverseDependencies(options);

    Actions.removeDependency('/bundle', '/core');

    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
    ).toEqual({
      added: new Set(),
      modified: new Set(['/bundle']),
      deleted: new Set([]),
    });

    Actions.addDependency('/bundle', '/core');

    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
    ).toEqual({
      added: new Set(),
      modified: new Set(['/bundle']),
      deleted: new Set([]),
    });

    Actions.removeDependency('/bundle', '/foo');

    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
    ).toEqual({
      added: new Set(),
      modified: new Set(['/bundle']),
      deleted: new Set(['/foo', '/bar']),
    });
  });

  test('removes a cyclic dependency with inverse dependency from other sub-graph', async () => {
    Actions.createFile('/toFoo');
    Actions.addDependency('/toFoo', '/baz');
    Actions.addDependency('/bundle', '/toFoo');
    files.clear();

    await graph.initialTraverseDependencies(options);

    Actions.removeDependency('/bundle', '/foo');

    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
    ).toEqual({
      added: new Set(),
      modified: new Set(['/bundle']),
      deleted: new Set(['/foo', '/bar']),
    });
  });

  test('removes a cyclic dependency', async () => {
    Actions.addDependency('/baz', '/foo');
    files.clear();

    await graph.initialTraverseDependencies(options);

    Actions.removeDependency('/bundle', '/foo');

    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
    ).toEqual({
      added: new Set(),
      modified: new Set(['/bundle']),
      deleted: new Set(['/foo', '/bar', '/baz']),
    });
  });

  test('removes a cycle with a weak dependency', async () => {
    Actions.addDependency('/baz', '/foo');
    Actions.addDependency('/baz', '/weak', {data: {asyncType: 'weak'}});
    files.clear();

    /*
    Initial state contains a /foo-/baz cycle with a weak leaf.

                      ┌────────────┐
                      ▼            │
    ┌─────────┐     ┌──────┐     ┌──────┐  weak    ┌───────┐
    │ /bundle │ ──▶ │ /foo │ ──▶ │ /baz │ ·······▶ │ /weak │
    └─────────┘     └──────┘     └──────┘          └───────┘
                      │
                      │
                      ▼
                    ┌──────┐
                    │ /bar │
                    └──────┘
    */
    await graph.initialTraverseDependencies(options);

    /*
    Remove /bundle -> /foo to cause the cycle to be collected.

                        ┌────────────┐
                        ▼            │
    ┌─────────┐   /  ┌──────┐     ┌──────┐  weak    ┌───────┐
    │ /bundle │ ─/─▶ │ /foo │ ──▶ │ /baz │ ·······▶ │ /weak │
    └─────────┘ /    └──────┘     └──────┘          └───────┘
                        │
                        │
                        ▼
                      ┌──────┐
                      │ /bar │
                      └──────┘
    */
    Actions.removeDependency('/bundle', '/foo');

    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
    ).toEqual({
      added: new Set(),
      modified: new Set(['/bundle']),
      deleted: new Set(['/foo', '/bar', '/baz']),
    });
  });

  test.each([true, false])(
    'removes a cycle with an async dependency when lazy: %s',
    async lazy => {
      Actions.addDependency('/baz', '/foo');
      Actions.addDependency('/baz', '/async', {data: {asyncType: 'async'}});
      files.clear();

      /*
      Initial state contains a /foo-/baz cycle with an async leaf.

                        ┌────────────┐
                        ▼            │
      ┌─────────┐     ┌──────┐     ┌──────┐  async   ┌────────┐
      │ /bundle │ ──▶ │ /foo │ ──▶ │ /baz │ ·······▶ │ /async │
      └─────────┘     └──────┘     └──────┘          └────────┘
                        │
                        │
                        ▼
                      ┌──────┐
                      │ /bar │
                      └──────┘
      */

      const localOptions = {...options, lazy};
      await graph.initialTraverseDependencies(localOptions);

      /*
      Remove /bundle -> /foo to cause the cycle to be collected.

                          ┌────────────┐
                          ▼            │
      ┌─────────┐   /  ┌──────┐     ┌──────┐  async   ┌────────┐
      │ /bundle │ ─/─▶ │ /foo │ ──▶ │ /baz │ ·······▶ │ /async │
      └─────────┘ /    └──────┘     └──────┘          └────────┘
                          │
                          │
                          ▼
                        ┌──────┐
                        │ /bar │
                        └──────┘
      */
      Actions.removeDependency('/bundle', '/foo');

      expect(
        getPaths(await graph.traverseDependencies([...files], localOptions)),
      ).toEqual({
        added: new Set(),
        modified: new Set(['/bundle']),
        // The /async node was never in the graph in lazy mode.
        deleted: new Set(['/foo', '/bar', '/baz', ...(lazy ? [] : ['/async'])]),
      });
    },
  );

  test('removes a cyclic dependency which is both inverse dependency and direct dependency', async () => {
    Actions.addDependency('/foo', '/bundle');

    files.clear();

    await graph.initialTraverseDependencies(options);

    Actions.removeDependency('/bundle', '/foo');

    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
    ).toEqual({
      added: new Set(),
      modified: new Set(['/bundle']),
      deleted: new Set(['/foo', '/bar', '/baz']),
    });
  });

  test('removes a dependency with transient cyclic dependency', async () => {
    Actions.createFile('/baz1');
    Actions.addDependency('/baz', '/baz1');
    Actions.addDependency('/baz1', '/foo');

    files.clear();

    await graph.initialTraverseDependencies(options);

    Actions.removeDependency('/bundle', '/foo');

    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
    ).toEqual({
      added: new Set(),
      modified: new Set(['/bundle']),
      deleted: new Set(['/foo', '/bar', '/baz', '/baz1']),
    });
  });

  test('removes a sub graph that has internal cyclic dependency', async () => {
    Actions.createFile('/bar2');
    Actions.addDependency('/bar', '/bar2');
    Actions.addDependency('/bar2', '/bar');
    Actions.addDependency('/foo', '/bundle');

    files.clear();

    await graph.initialTraverseDependencies(options);

    Actions.removeDependency('/bundle', '/foo');

    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
    ).toEqual({
      added: new Set(),
      modified: new Set(['/bundle']),
      deleted: new Set(['/foo', '/bar', '/baz', '/bar2']),
    });
  });

  test('move a file to a different folder', async () => {
    await graph.initialTraverseDependencies(options);

    Actions.addDependency('/foo', '/baz-moved');
    Actions.removeDependency('/foo', '/baz');

    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
    ).toEqual({
      added: new Set(['/baz-moved']),
      modified: new Set(['/foo']),
      deleted: new Set(['/baz']),
    });

    expect(graph.dependencies.get('/baz')).toBe(undefined);
  });

  test('maintain the order of module dependencies', async () => {
    await graph.initialTraverseDependencies(options);

    Actions.addDependency('/foo', '/qux', {position: 0});

    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
    ).toEqual({
      added: new Set(['/qux']),
      modified: new Set(['/foo']),
      deleted: new Set(),
    });

    expect([
      ...nullthrows(graph.dependencies.get(moduleFoo)).dependencies,
    ]).toEqual([
      [
        expect.any(String),
        {
          absolutePath: '/qux',
          data: {
            data: objectContaining({asyncType: null, locs: []}),
            name: 'qux',
          },
        },
      ],
      [
        expect.any(String),
        {
          absolutePath: '/bar',
          data: {
            data: objectContaining({asyncType: null, locs: []}),
            name: 'bar',
          },
        },
      ],
      [
        expect.any(String),
        {
          absolutePath: '/baz',
          data: {
            data: objectContaining({asyncType: null, locs: []}),
            name: 'baz',
          },
        },
      ],
    ]);
  });

  describe('adding a new module while one of its ancestors is being deleted', () => {
    /**
     * In all of these tests, we make various mutations to the following graph:
     *
     * ┌─────────┐     ┌──────┐     ┌──────┐
     * │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │
     * └─────────┘     └──────┘     └──────┘
     *                   │
     *                   │
     *                   ▼
     *                 ┌──────┐
     *                 │ /baz │
     *                 └──────┘
     *
     * The order and chunking of mutations should not affect the correctness of the graph
     * (but has been known to cause bugs, hence these regression tests).
     *
     * Terminology:
     *   * A "live" edge is one that makes it to the final state of graph.
     *   * A "dead" edge is one that is pruned from the final graph.
     */
    test('all in one delta, adding the live edge first', async () => {
      await graph.initialTraverseDependencies(options);

      /*
      ┌─────────┐     ┌──────┐     ┌──────┐
      │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │
      └─────────┘     └──────┘     └──────┘
                        │
                        │
                        ▼
      ┏━━━━━━━━━┓     ┌──────┐
      ┃  /quux  ┃     │ /baz │
      ┗━━━━━━━━━┛     └──────┘
      */
      Actions.createFile('/quux');

      /*
      ┌─────────┐     ┌──────┐     ┌──────┐
      │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │
      └─────────┘     └──────┘     └──────┘
        ┃	              │
        ┃               │
        ▼               ▼
      ┌─────────┐     ┌──────┐
      │  /quux  │     │ /baz │
      └─────────┘     └──────┘
      */
      Actions.addDependency('/bundle', '/quux');

      /*
      ┏━━━━━━━━━━━━━━━━━━━━┓
      ┃                    ┃
      ┃  ┌─────────┐     ┌──────┐     ┌──────┐
      ┃  │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │
      ┃  └─────────┘     └──────┘     └──────┘
      ┃    │               │
      ┃    │               │
      ┃    ▼               ▼
      ┃  ┌─────────┐     ┌──────┐
      ┗▶ │  /quux  │     │ /baz │
         └─────────┘     └──────┘
      */
      Actions.addDependency('/foo', '/quux');

      /*
      ┌────────────────────┐
      │                    │
      │  ┌─────────┐   / ┌──────┐     ┌──────┐
      │  │ /bundle │ ┈/▷ │ /foo │ ──▶ │ /bar │
      │  └─────────┘ /   └──────┘     └──────┘
      │    │               │
      │    │               │
      │    ▼               ▼
      │  ┌─────────┐     ┌──────┐
      └▶ │  /quux  │     │ /baz │
         └─────────┘     └──────┘
      */
      Actions.removeDependency('/bundle', '/foo');

      /*
      Compute the delta for the current graph:
      ┌─────────┐     ┌───────┐
      │ /bundle │ ──▶ │ /quux │
      └─────────┘     └───────┘
      (modified)       (added)
      */
      expect(
        getPaths(await graph.traverseDependencies([...files], options)),
      ).toEqual({
        added: new Set(['/quux']),
        deleted: new Set(['/foo', '/bar', '/baz']),
        modified: new Set(['/bundle']),
      });
    });

    test('all in one delta, adding the live edge after the dead edge', async () => {
      await graph.initialTraverseDependencies(options);

      /*
      ┌─────────┐     ┌──────┐     ┌──────┐
      │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │
      └─────────┘     └──────┘     └──────┘
                        │
                        │
                        ▼
      ┏━━━━━━━━━┓     ┌──────┐
      ┃  /quux  ┃     │ /baz │
      ┗━━━━━━━━━┛     └──────┘
      */
      Actions.createFile('/quux');

      /*
      ┏━━━━━━━━━━━━━━━━━━━━┓
      ┃                    ┃
      ┃  ┌─────────┐     ┌──────┐     ┌──────┐
      ┃  │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │
      ┃  └─────────┘     └──────┘     └──────┘
      ┃                    │
      ┃                    │
      ┃                    ▼
      ┃  ┌─────────┐     ┌──────┐
      ┗▶ │  /quux  │     │ /baz │
         └─────────┘     └──────┘
      */
      Actions.addDependency('/foo', '/quux');

      /*
      ┌────────────────────┐
      │                    │
      │  ┌─────────┐     ┌──────┐     ┌──────┐
      │  │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │
      │  └─────────┘     └──────┘     └──────┘
      │    ┃               │
      │    ┃               │
      │    ▼               ▼
      │  ┌─────────┐     ┌──────┐
      └▶ │  /quux  │     │ /baz │
         └─────────┘     └──────┘
      */
      Actions.addDependency('/bundle', '/quux');

      /*
      ┌────────────────────┐
      │                    │
      │  ┌─────────┐   / ┌──────┐     ┌──────┐
      │  │ /bundle │ ┈/▷ │ /foo │ ──▶ │ /bar │
      │  └─────────┘ /   └──────┘     └──────┘
      │    │               │
      │    │               │
      │    ▼               ▼
      │  ┌─────────┐     ┌──────┐
      └▶ │  /quux  │     │ /baz │
         └─────────┘     └──────┘
      */
      Actions.removeDependency('/bundle', '/foo');

      /*
      Compute the delta for the current graph:
      ┌─────────┐     ┌───────┐
      │ /bundle │ ──▶ │ /quux │
      └─────────┘     └───────┘
      (modified)       (added)
      */
      expect(
        getPaths(await graph.traverseDependencies([...files], options)),
      ).toEqual({
        added: new Set(['/quux']),
        deleted: new Set(['/foo', '/bar', '/baz']),
        modified: new Set(['/bundle']),
      });
    });

    test('add the dead edge, compute a delta, then add the live edge', async () => {
      await graph.initialTraverseDependencies(options);

      /*
      ┌─────────┐     ┌──────┐     ┌──────┐
      │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │
      └─────────┘     └──────┘     └──────┘
                        │
                        │
                        ▼
      ┏━━━━━━━━━┓     ┌──────┐
      ┃  /quux  ┃     │ /baz │
      ┗━━━━━━━━━┛     └──────┘
      */
      Actions.createFile('/quux');

      /*
      ┏━━━━━━━━━━━━━━━━━━━━┓
      ┃                    ┃
      ┃  ┌─────────┐     ┌──────┐     ┌──────┐
      ┃  │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │
      ┃  └─────────┘     └──────┘     └──────┘
      ┃                    │
      ┃                    │
      ┃                    ▼
      ┃  ┌─────────┐     ┌──────┐
      ┗▶ │  /quux  │     │ /baz │
         └─────────┘     └──────┘
      */
      Actions.addDependency('/foo', '/quux');

      /*
      Compute the delta for the current graph:
      ┌────────────────────┐
      │                    │
      │  ┌─────────┐     ┌──────┐       ┌──────┐
      │  │ /bundle │ ──▶ │ /foo │ ────▶ │ /bar │
      │  └─────────┘     └──────┘       └──────┘
      │                    │ (modified)
      │                    │
      │                    ▼
      │  ┌─────────┐     ┌──────┐
      └▶ │  /quux  │     │ /baz │
         └─────────┘     └──────┘
           (added)
      */
      expect(
        getPaths(await graph.traverseDependencies([...files], options)),
      ).toEqual({
        added: new Set(['/quux']),
        deleted: new Set([]),
        modified: new Set(['/foo']),
      });
      files.clear();

      /*
      ┌────────────────────┐
      │                    │
      │  ┌─────────┐     ┌──────┐     ┌──────┐
      │  │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │
      │  └─────────┘     └──────┘     └──────┘
      │    ┃               │
      │    ┃               │
      │    ▼               ▼
      │  ┌─────────┐     ┌──────┐
      └▶ │  /quux  │     │ /baz │
         └─────────┘     └──────┘
      */
      Actions.addDependency('/bundle', '/quux');

      /*
      ┌────────────────────┐
      │                    │
      │  ┌─────────┐   / ┌──────┐     ┌──────┐
      │  │ /bundle │ ┈/▷ │ /foo │ ──▶ │ /bar │
      │  └─────────┘ /   └──────┘     └──────┘
      │    │               │
      │    │               │
      │    ▼               ▼
      │  ┌─────────┐     ┌──────┐
      └▶ │  /quux  │     │ /baz │
         └─────────┘     └──────┘
      */
      Actions.removeDependency('/bundle', '/foo');

      /*
      Compute another delta for the current graph:
      ┌─────────┐     ┌───────┐
      │ /bundle │ ──▶ │ /quux │
      └─────────┘     └───────┘
      (modified)
      */
      expect(
        getPaths(await graph.traverseDependencies([...files], options)),
      ).toEqual({
        added: new Set([]),
        deleted: new Set(['/foo', '/bar', '/baz']),
        modified: new Set(['/bundle']),
      });
    });

    test('create the module, compute a delta, then add the dead edge and the live edge', async () => {
      await graph.initialTraverseDependencies(options);

      /*
      ┌─────────┐     ┌──────┐     ┌──────┐
      │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │
      └─────────┘     └──────┘     └──────┘
                        │
                        │
                        ▼
      ┏━━━━━━━━━┓     ┌──────┐
      ┃  /quux  ┃     │ /baz │
      ┗━━━━━━━━━┛     └──────┘
      */
      Actions.createFile('/quux');

      /*
      Compute the delta for the current graph:
      ┌─────────┐     ┌──────┐     ┌──────┐
      │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │
      └─────────┘     └──────┘     └──────┘
                        │
                        │
                        ▼
                      ┌──────┐
                      │ /baz │
                      └──────┘
      */
      expect(
        getPaths(await graph.traverseDependencies([...files], options)),
      ).toEqual({
        added: new Set([]),
        deleted: new Set([]),
        modified: new Set([]),
      });
      files.clear();

      /*
      ┏━━━━━━━━━━━━━━━━━━━━┓
      ┃                    ┃
      ┃  ┌─────────┐     ┌──────┐     ┌──────┐
      ┃  │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │
      ┃  └─────────┘     └──────┘     └──────┘
      ┃                    │
      ┃                    │
      ┃                    ▼
      ┃  ┌─────────┐     ┌──────┐
      ┗▶ │  /quux  │     │ /baz │
         └─────────┘     └──────┘
      */
      Actions.addDependency('/foo', '/quux');

      /*
      Compute the delta for the current graph:
      ┌────────────────────┐
      │                    │
      │  ┌─────────┐     ┌──────┐       ┌──────┐
      │  │ /bundle │ ──▶ │ /foo │ ────▶ │ /bar │
      │  └─────────┘     └──────┘       └──────┘
      │                    │ (modified)
      │                    │
      │                    ▼
      │  ┌─────────┐     ┌──────┐
      └▶ │  /quux  │     │ /baz │
         └─────────┘     └──────┘
           (added)
      */
      expect(
        getPaths(await graph.traverseDependencies([...files], options)),
      ).toEqual({
        added: new Set(['/quux']),
        deleted: new Set([]),
        modified: new Set(['/foo']),
      });
      files.clear();

      /*
      ┌────────────────────┐
      │                    │
      │  ┌─────────┐     ┌──────┐     ┌──────┐
      │  │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │
      │  └─────────┘     └──────┘     └──────┘
      │    ┃               │
      │    ┃               │
      │    ▼               ▼
      │  ┌─────────┐     ┌──────┐
      └▶ │  /quux  │     │ /baz │
         └─────────┘     └──────┘
      */
      Actions.addDependency('/bundle', '/quux');

      /*
      ┌────────────────────┐
      │                    │
      │  ┌─────────┐   / ┌──────┐     ┌──────┐
      │  │ /bundle │ ┈/▷ │ /foo │ ──▶ │ /bar │
      │  └─────────┘ /   └──────┘     └──────┘
      │    │               │
      │    │               │
      │    ▼               ▼
      │  ┌─────────┐     ┌──────┐
      └▶ │  /quux  │     │ /baz │
         └─────────┘     └──────┘
      */
      Actions.removeDependency('/bundle', '/foo');

      /*
      Compute another delta for the current graph:
      ┌─────────┐     ┌───────┐
      │ /bundle │ ──▶ │ /quux │
      └─────────┘     └───────┘
      (modified)
      */
      expect(
        getPaths(await graph.traverseDependencies([...files], options)),
      ).toEqual({
        added: new Set([]),
        deleted: new Set(['/foo', '/bar', '/baz']),
        modified: new Set(['/bundle']),
      });
    });

    test('more than two state transitions in one delta calculation', async () => {
      await graph.initialTraverseDependencies(options);

      /*
      ┌─────────┐     ┌──────┐     ┌──────┐     ┏━━━━━━━┓
      │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │     ┃ /quux ┃
      └─────────┘     └──────┘     └──────┘     ┗━━━━━━━┛
                        │
                        │
                        ▼
                      ┌──────┐
                      │ /baz │
                      └──────┘
      */
      Actions.createFile('/quux');

      /*
      Compute the delta for the current graph:
      ┌─────────┐     ┌──────┐     ┌──────┐
      │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │
      └─────────┘     └──────┘     └──────┘
                        │
                        │
                        ▼
                      ┌──────┐
                      │ /baz │
                      └──────┘
      */
      expect(
        getPaths(await graph.traverseDependencies([...files], options)),
      ).toEqual({
        added: new Set([]),
        deleted: new Set([]),
        modified: new Set([]),
      });
      files.clear();

      /*
      ┌─────────┐     ┌──────┐     ┌──────┐     ┌───────┐
      │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │ ━━▶ │ /quux │
      └─────────┘     └──────┘     └──────┘     └───────┘
                        │
                        │
                        ▼
                      ┌──────┐
                      │ /baz │
                      └──────┘
      /bar is modified and reachable, so /quux will be marked as added
      ( = first transition).
      */
      Actions.addDependency('/bar', '/quux');

      /*
      ┌─────────┐     ┌──────┐   / ┌──────┐     ┌───────┐
      │ /bundle │ ──▶ │ /foo │ ┈/▷ │ /bar │ ──▶ │ /quux │
      └─────────┘     └──────┘ /   └──────┘     └───────┘
                        │
                        │
                        ▼
                      ┌──────┐
                      │ /baz │
                      └──────┘
      /foo is modified and reachable, so we will see that /bar is unreachable
      and unmark /quux as added ( = second transition).
      */
      Actions.removeDependency('/foo', '/bar');

      /*
        ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
        ┃                                         ▼
      ┌─────────┐     ┌──────┐     ┌──────┐     ┌───────┐
      │ /bundle │ ──▶ │ /foo │     │ /bar │ ──▶ │ /quux │
      └─────────┘     └──────┘     └──────┘     └───────┘
                        │
                        │
                        ▼
                      ┌──────┐
                      │ /baz │
                      └──────┘
      Finally, /bundle is modified and reachable, so we will mark /quux as
      added again ( = third transition)
      */
      Actions.addDependency('/bundle', '/quux');

      /*
      Compute another delta for the current graph:
      ┌─────────┐     ┌──────┐          ┌┈┈┈┈┈┈┐
      │ /bundle │ ──▶ │ /foo │          ┊ /bar ┊
      └─────────┘     └──────┘          └┈┈┈┈┈┈┘
        │ (modified)    │ (modified)    (deleted)
        │               │
        ▼               ▼
      ┌─────────┐     ┌──────┐
      │ /quux   │     │ /baz │
      └─────────┘     └──────┘
          (added)
      */
      expect(
        getPaths(await graph.traverseDependencies([...files], options)),
      ).toEqual({
        added: new Set(['/quux']),
        deleted: new Set(['/bar']),
        modified: new Set(['/foo', '/bundle']),
      });
    });
  });

  describe('lazy traversal of async imports', () => {
    let localOptions;
    beforeEach(() => {
      localOptions = {
        ...options,
        lazy: true,
      };
    });

    test('async dependencies and their deps are omitted from the initial graph', async () => {
      Actions.removeDependency('/bundle', '/foo');
      Actions.addDependency('/bundle', '/foo', {
        data: {
          asyncType: 'async',
        },
      });

      /*
      ┌─────────┐  async   ┌──────┐     ┌──────┐
      │ /bundle │ ·······▶ │ /foo │ ──▶ │ /bar │
      └─────────┘          └──────┘     └──────┘
                            │
                            │
                            ▼
                          ┌──────┐
                          │ /baz │
                          └──────┘
      */
      expect(
        getPaths(await graph.initialTraverseDependencies(localOptions)),
      ).toEqual({
        added: new Set(['/bundle']),
        deleted: new Set([]),
        modified: new Set([]),
      });
      expect(graph.dependencies.get('/bar')).toBeUndefined();
    });

    test('new async dependencies are not traversed', async () => {
      Actions.removeDependency('/bundle', '/foo');
      Actions.addDependency('/bundle', '/foo', {
        data: {
          asyncType: 'async',
        },
      });

      /*
      ┌─────────┐  async   ┌──────┐     ┌──────┐
      │ /bundle │ ·······▶ │ /foo │ ──▶ │ /bar │
      └─────────┘          └──────┘     └──────┘
                            │
                            │
                            ▼
                          ┌──────┐
                          │ /baz │
                          └──────┘
      */
      await graph.initialTraverseDependencies(localOptions);
      files.clear();

      Actions.createFile('/quux');
      Actions.addDependency('/bundle', '/quux', {
        data: {
          asyncType: 'async',
        },
      });

      /*
      ┌─────────┐  async   ┌──────┐     ┌──────┐
      │ /bundle │ ·······▶ │ /foo │ ──▶ │ /bar │
      └─────────┘          └──────┘     └──────┘
        :                    │
        : async              │
        ▼                    ▼
      ┌─────────┐          ┌──────┐
      │  /quux  │          │ /baz │
      └─────────┘          └──────┘
      */
      expect(
        getPaths(await graph.traverseDependencies([...files], localOptions)),
      ).toEqual({
        added: new Set([]),
        deleted: new Set([]),
        modified: new Set(['/bundle']),
      });
    });

    test('removing an async dependency preserves existing sync dependency', async () => {
      const asyncDependencyKey = Actions.addDependency('/bundle', '/foo', {
        data: {
          asyncType: 'async',
        },
      });
      /*
      ┌─────────┐ ───▶ ┌──────┐     ┌──────┐
      │ /bundle │      │ /foo │ ──▶ │ /bar │
      └─────────┘ ···▶ └──────┘     └──────┘
                          │
                          │
                          ▼
                       ┌──────┐
                       │ /baz │
                       └──────┘
      */
      await graph.initialTraverseDependencies(localOptions);
      files.clear();
      Actions.removeDependencyByKey('/bundle', asyncDependencyKey);

      // The synchronous dependency remains, /foo should not be removed.
      /*
      ┌─────────┐     ┌──────┐     ┌──────┐
      │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │
      └─────────┘     └──────┘     └──────┘
                        │
                        │
                        ▼
                      ┌──────┐
                      │ /baz │
                      └──────┘
      */
      expect(
        getPaths(await graph.traverseDependencies([...files], localOptions)),
      ).toEqual({
        added: new Set([]),
        deleted: new Set([]),
        modified: new Set(['/bundle']),
      });
    });

    test('changing a sync dependency to async is a deletion', async () => {
      /*
      ┌─────────┐     ┌──────┐     ┌──────┐
      │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │
      └─────────┘     └──────┘     └──────┘
                        │
                        │
                        ▼
                      ┌──────┐
                      │ /baz │
                      └──────┘
      */
      await graph.initialTraverseDependencies(localOptions);
      files.clear();

      Actions.removeDependency('/bundle', '/foo');
      Actions.addDependency('/bundle', '/foo', {
        data: {
          asyncType: 'async',
        },
      });

      /*
      ┌─────────┐  async   ┌──────┐     ┌──────┐
      │ /bundle │ ·······▶ │ /foo │ ──▶ │ /bar │
      └─────────┘          └──────┘     └──────┘
                            │
                            │
                            ▼
                          ┌──────┐
                          │ /baz │
                          └──────┘
      */
      expect(
        getPaths(await graph.traverseDependencies([...files], localOptions)),
      ).toEqual({
        added: new Set([]),
        deleted: new Set(['/foo', '/bar', '/baz']),
        modified: new Set(['/bundle']),
      });
    });

    test('changing an async dependency to sync is an addition', async () => {
      Actions.removeDependency('/bundle', '/foo');
      Actions.addDependency('/bundle', '/foo', {
        data: {
          asyncType: 'async',
        },
      });

      /*
      ┌─────────┐  async   ┌──────┐     ┌──────┐
      │ /bundle │ ·······▶ │ /foo │ ──▶ │ /bar │
      └─────────┘          └──────┘     └──────┘
                            │
                            │
                            ▼
                          ┌──────┐
                          │ /baz │
                          └──────┘
      */
      await graph.initialTraverseDependencies(localOptions);
      files.clear();

      Actions.removeDependency('/bundle', '/foo');
      Actions.addDependency('/bundle', '/foo');

      /*
      ┌─────────┐     ┌──────┐     ┌──────┐
      │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │
      └─────────┘     └──────┘     └──────┘
                        │
                        │
                        ▼
                      ┌──────┐
                      │ /baz │
                      └──────┘
      */
      expect(
        getPaths(await graph.traverseDependencies([...files], localOptions)),
      ).toEqual({
        added: new Set(['/foo', '/bar', '/baz']),
        modified: new Set(['/bundle']),
        deleted: new Set([]),
      });
    });

    test('initial graph can have async+sync edges to the same module', async () => {
      Actions.addDependency('/bar', '/foo', {
        data: {
          asyncType: 'async',
        },
      });

      /*
                                    async
                        ┌·················┐
                        ▼                 :
      ┌─────────┐     ┌──────┐          ┌──────┐
      │ /bundle │ ──▶ │ /foo │ ───────▶ │ /bar │
      └─────────┘     └──────┘          └──────┘
                        │
                        │
                        ▼
                      ┌──────┐
                      │ /baz │
                      └──────┘
      */
      await graph.initialTraverseDependencies(localOptions);

      expect(graph.dependencies.get('/foo')).not.toBeUndefined();
    });

    test('adding an async edge pointing at an existing module in the graph', async () => {
      /*
      ┌─────────┐     ┌──────┐     ┌──────┐
      │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │
      └─────────┘     └──────┘     └──────┘
                        │
                        │
                        ▼
                      ┌──────┐
                      │ /baz │
                      └──────┘
      */
      await graph.initialTraverseDependencies(options);

      Actions.addDependency('/bar', '/foo', {
        data: {
          asyncType: 'async',
        },
      });

      /*
                                    async
                        ┌·················┐
                        ▼                 :
      ┌─────────┐     ┌──────┐          ┌──────┐
      │ /bundle │ ──▶ │ /foo │ ───────▶ │ /bar │
      └─────────┘     └──────┘          └──────┘
                        │
                        │
                        ▼
                      ┌──────┐
                      │ /baz │
                      └──────┘
      */
      expect(
        getPaths(await graph.traverseDependencies([...files], localOptions)),
      ).toEqual({
        added: new Set([]),
        modified: new Set(['/bar']),
        deleted: new Set([]),
      });
    });

    test('adding a sync edge brings in a module that is already the target of an async edge', async () => {
      Actions.removeDependency('/foo', '/bar');
      Actions.addDependency('/foo', '/bar', {
        data: {
          asyncType: 'async',
        },
      });

      /*
      ┌─────────┐     ┌──────┐  async   ┌──────┐
      │ /bundle │ ──▶ │ /foo │ ·······▶ │ /bar │
      └─────────┘     └──────┘          └──────┘
                        │
                        │
                        ▼
                      ┌──────┐
                      │ /baz │
                      └──────┘
      */
      await graph.initialTraverseDependencies(localOptions);
      files.clear();

      Actions.addDependency('/bundle', '/bar');

      /*
        ┌─────────────────────────────────┐
        │                                 ▼
      ┌─────────┐     ┌──────┐  async   ┌──────┐
      │ /bundle │ ──▶ │ /foo │ ·······▶ │ /bar │
      └─────────┘     └──────┘          └──────┘
                        │
                        │
                        ▼
                      ┌──────┐
                      │ /baz │
                      └──────┘
      */
      expect(
        getPaths(await graph.traverseDependencies([...files], localOptions)),
      ).toEqual({
        added: new Set(['/bar']),
        modified: new Set(['/bundle']),
        deleted: new Set([]),
      });
    });

    test('on initial traversal, modules are not kept alive by a cycle with an async dep', async () => {
      Actions.removeDependency('/foo', '/bar');
      Actions.addDependency('/foo', '/bar', {
        data: {
          asyncType: 'async',
        },
      });
      Actions.addDependency('/bar', '/foo');
      Actions.removeDependency('/bundle', '/foo');

      /*
                        ┌─────────────────┐
                        ▼                 │
      ┌─────────┐     ┌──────┐  async   ┌──────┐
      │ /bundle │     │ /foo │ ·······▶ │ /bar │
      └─────────┘     └──────┘          └──────┘
                        │
                        │
                        ▼
                      ┌──────┐
                      │ /baz │
                      └──────┘
      */
      expect(
        getPaths(await graph.initialTraverseDependencies(localOptions)),
      ).toEqual({
        added: new Set(['/bundle']),
        deleted: new Set([]),
        modified: new Set([]),
      });
    });

    test('on incremental traversal, modules are not kept alive by a cycle with an async dep - deleting the sync edge in a delta', async () => {
      Actions.removeDependency('/foo', '/bar');
      Actions.addDependency('/foo', '/bar', {
        data: {
          asyncType: 'async',
        },
      });
      Actions.addDependency('/bar', '/foo');

      /*
                        ┌─────────────────┐
                        ▼                 │
      ┌─────────┐     ┌──────┐  async   ┌──────┐
      │ /bundle │ ──▶ │ /foo │ ·······▶ │ /bar │
      └─────────┘     └──────┘          └──────┘
                        │
                        │
                        ▼
                      ┌──────┐
                      │ /baz │
                      └──────┘
      */
      await graph.initialTraverseDependencies(localOptions);
      files.clear();

      Actions.removeDependency('/bundle', '/foo');

      /*
                        ┌─────────────────┐
                        ▼                 │
      ┌─────────┐   / ┌──────┐  async   ┌──────┐
      │ /bundle │ ┈/▷ │ /foo │ ·······▶ │ /bar │
      └─────────┘ /   └──────┘          └──────┘
                        │
                        │
                        ▼
                      ┌──────┐
                      │ /baz │
                      └──────┘
      */
      expect(
        getPaths(await graph.traverseDependencies([...files], localOptions)),
      ).toEqual({
        added: new Set([]),
        deleted: new Set(['/foo', '/baz']),
        modified: new Set(['/bundle']),
      });
    });

    test('on incremental traversal, modules are not kept alive by a cycle with an async dep - adding the async edge in a delta', async () => {
      Actions.removeDependency('/foo', '/bar');
      Actions.addDependency('/bar', '/foo');
      Actions.removeDependency('/bundle', '/foo');

      /*
                        ┌─────────────────┐
                        ▼                 │
      ┌─────────┐     ┌──────┐          ┌──────┐
      │ /bundle │     │ /foo │          │ /bar │
      └─────────┘     └──────┘          └──────┘
                        │
                        │
                        ▼
                      ┌──────┐
                      │ /baz │
                      └──────┘
      */
      await graph.initialTraverseDependencies(localOptions);
      files.clear();

      Actions.addDependency('/foo', '/bar', {
        data: {
          asyncType: 'async',
        },
      });

      /*
                        ┌─────────────────┐
                        ▼                 │
      ┌─────────┐     ┌──────┐          ┌──────┐
      │ /bundle │     │ /foo │ ───────▶ │ /bar │
      └─────────┘     └──────┘          └──────┘
                        │
                        │
                        ▼
                      ┌──────┐
                      │ /baz │
                      └──────┘
      */
      // At this point neither of /foo and /bar is reachable from /bundle.
      expect(
        getPaths(await graph.traverseDependencies([...files], localOptions)),
      ).toEqual({
        added: new Set([]),
        deleted: new Set([]),
        modified: new Set([]),
      });
    });

    test('on incremental traversal, modules are not kept alive by a cycle with an async dep - deletion + add async in the same delta', async () => {
      Actions.removeDependency('/foo', '/bar');
      Actions.addDependency('/bar', '/foo');

      /*
                        ┌─────────────────┐
                        ▼                 │
      ┌─────────┐     ┌──────┐          ┌──────┐
      │ /bundle │ ──▶ │ /foo │          │ /bar │
      └─────────┘     └──────┘          └──────┘
                        │
                        │
                        ▼
                      ┌──────┐
                      │ /baz │
                      └──────┘
      */
      await graph.initialTraverseDependencies(localOptions);
      files.clear();

      Actions.addDependency('/foo', '/bar', {
        data: {
          asyncType: 'async',
        },
      });
      Actions.removeDependency('/bundle', '/foo');

      /*
                        ┌─────────────────┐
                        ▼                 │
      ┌─────────┐   / ┌──────┐  async   ┌──────┐
      │ /bundle │ ┈/▷ │ /foo │ ·······▶ │ /bar │
      └─────────┘ /   └──────┘          └──────┘
                        │
                        │
                        ▼
                      ┌──────┐
                      │ /baz │
                      └──────┘
      */
      expect(
        getPaths(await graph.traverseDependencies([...files], localOptions)),
      ).toEqual({
        added: new Set([]),
        deleted: new Set(['/foo', '/baz']),
        modified: new Set(['/bundle']),
      });
    });

    test('deleting the target of an async dependency retraverses its parent', async () => {
      Actions.removeDependency('/bundle', '/foo');
      Actions.addDependency('/bundle', '/foo', {
        data: {
          asyncType: 'async',
        },
      });

      /*
      ┌─────────┐  async   ┌──────┐     ┌──────┐
      │ /bundle │ ·······▶ │ /foo │ ──▶ │ /bar │
      └─────────┘          └──────┘     └──────┘
                            │
                            │
                            ▼
                          ┌──────┐
                          │ /baz │
                          └──────┘
      */
      await graph.initialTraverseDependencies(localOptions);
      files.clear();

      Actions.deleteFile('/foo', graph);

      /*
      ┌─────────┐  async   ┌┄┄╲┄╱┄┐     ┌──────┐
      │ /bundle │ ·······▶ ┆ /foo ┆ ──▶ │ /bar │
      └─────────┘          └┄┄╱┄╲┄┘     └──────┘
                            │
                            │
                            ▼
                          ┌──────┐
                          │ /baz │
                          └──────┘
      */
      await expect(
        graph.traverseDependencies([...files], localOptions),
      ).rejects.toThrowError('Dependency not found: /bundle -> /foo');

      // NOTE: not clearing `files`, to mimic DeltaCalculator's error behaviour.

      Actions.createFile('/foo');

      /*
      ┌─────────┐  async   ┏━━━━━━┓     ┌──────┐
      │ /bundle │ ·······▶ ┃ /foo ┃ ──▶ │ /bar │
      └─────────┘          ┗━━━━━━┛     └──────┘
                            │
                            │
                            ▼
                          ┌──────┐
                          │ /baz │
                          └──────┘
      */
      mockTransform.mockClear();
      expect(
        getPaths(await graph.traverseDependencies([...files], localOptions)),
      ).toEqual({
        added: new Set([]),
        modified: new Set(['/bundle']),
        deleted: new Set([]),
      });
      expect(mockTransform).toHaveBeenCalledWith('/bundle', undefined);
    });
  });

  test('should try to transform every file only once', async () => {
    // create a second inverse dependency on /bar to add a cycle.
    Actions.addDependency('/bundle', '/bar');
    files.clear();

    await graph.initialTraverseDependencies(options);

    expect(mockTransform.mock.calls.length).toBe(4);
  });

  test('should not re-transform an unmodified file when it is removed and readded within a delta', async () => {
    /*
    ┌─────────┐     ┌──────┐     ┌───────┐
    │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar  │
    └─────────┘     └──────┘     └───────┘
                      │
                      │
                      ▼
                    ┌──────┐
                    │ /baz │
                    └──────┘
    */
    await graph.initialTraverseDependencies(options);

    Actions.removeDependency('/foo', '/baz');
    Actions.addDependency('/bar', '/baz');

    /*
    ┌─────────┐     ┌──────┐     ┌───────┐
    │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar  │
    └─────────┘     └──────┘     └───────┘
                      ┆/           ┃
                     /┆            ┃
                      ▽            ┃
                    ┌──────┐       ┃
                    │ /baz │ ◀━━━━━┛
                    └──────┘
    */
    mockTransform.mockClear();
    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
    ).toEqual({
      added: new Set([]),
      modified: new Set(['/foo', '/bar']),
      deleted: new Set([]),
    });
    // /baz has not been modified, but a naive implementation might re-transform it
    expect(mockTransform).not.toHaveBeenCalledWith('/baz', undefined);
  });

  test('should try to transform every file only once with multiple entry points', async () => {
    Actions.createFile('/bundle-2');
    Actions.addDependency('/bundle-2', '/foo');
    files.clear();

    // Add a second entry point to the graph.
    graph = new TestGraph({
      entryPoints: new Set(['/bundle', '/bundle-2']),
      transformOptions: options.transformOptions,
    });

    await graph.initialTraverseDependencies(options);

    expect(mockTransform.mock.calls.length).toBe(5);
  });

  test('should create two entries when requiring the same file in different forms', async () => {
    await graph.initialTraverseDependencies(options);

    // We're adding a new reference from bundle to foo.
    Actions.addDependency('/bundle', '/foo', {position: 0, name: 'foo.js'});

    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
    ).toEqual({
      added: new Set(),
      modified: new Set(['/bundle']),
      deleted: new Set(),
    });

    expect([
      ...nullthrows(graph.dependencies.get(entryModule)).dependencies,
    ]).toEqual([
      [
        expect.any(String),
        {
          absolutePath: '/foo',
          data: {
            data: objectContaining({asyncType: null, locs: []}),
            name: 'foo.js',
          },
        },
      ],
      [
        expect.any(String),
        {
          absolutePath: '/foo',
          data: {
            data: objectContaining({asyncType: null, locs: []}),
            name: 'foo',
          },
        },
      ],
    ]);
  });

  test('should traverse a graph from multiple entry points', async () => {
    entryModule = Actions.createFile('/bundle-2');

    Actions.addDependency('/bundle-2', '/bundle-2-foo');
    Actions.addDependency('/bundle-2', '/bundle-2-bar');
    Actions.addDependency('/bundle-2', '/bar');

    files.clear();

    graph = new TestGraph({
      entryPoints: new Set(['/bundle', '/bundle-2']),
      transformOptions: options.transformOptions,
    });

    await graph.initialTraverseDependencies(options);

    expect([...graph.dependencies.keys()]).toEqual([
      '/bundle',
      '/foo',
      '/bar',
      '/baz',
      '/bundle-2',
      '/bundle-2-foo',
      '/bundle-2-bar',
    ]);
  });

  test('should traverse the dependency tree in a deterministic order', async () => {
    const localMockTransform = jest.fn();

    // Mocks the transformer call, always resolving the module in `slowPath`
    // after the module in `fastPath`.
    function setMockTransformOrder(fastPath: string, slowPath: string) {
      let deferredSlow;
      let fastResolved = false;

      localMockTransform.mockImplementation(
        async (path: string, context: ?RequireContext) => {
          const result = await mockTransform(path, context);

          if (path === slowPath && !fastResolved) {
            // Return a Promise that won't be resolved after fastPath.
            deferredSlow = deferred(result);
            return deferredSlow.promise;
          }

          if (path === fastPath) {
            fastResolved = true;

            if (deferredSlow) {
              return new Promise(async resolve => {
                await resolve(result);

                deferredSlow.resolve();
              });
            }
          }

          return result;
        },
      );
    }

    const assertOrder = async function () {
      graph = new TestGraph({
        entryPoints: new Set(['/bundle']),
        transformOptions: options.transformOptions,
      });

      expect(
        Array.from(
          getPaths(
            await graph.initialTraverseDependencies({
              ...options,
              transform: localMockTransform,
            }),
          ).added,
        ),
      ).toEqual(['/bundle', '/foo', '/baz', '/bar']);
    };

    // Create a dependency tree where moduleBaz has two inverse dependencies.
    mockedDependencyTree = new Map([
      [
        entryModule,
        [
          {name: 'foo', path: moduleFoo, data: {key: 'foo'}},
          {name: 'bar', path: moduleBar, data: {key: 'bar'}},
        ],
      ],
      [moduleFoo, [{name: 'baz', path: moduleBaz, data: {key: 'baz'}}]],
      [moduleBar, [{name: 'baz', path: moduleBaz, data: {key: 'baz'}}]],
    ]);

    // Test that even when having different modules taking longer, the order
    // remains the same.
    mockTransform.mockClear();
    setMockTransformOrder('/foo', '/bar');
    await assertOrder();
    expect(mockTransform).toHaveBeenCalledWith('/foo', undefined);
    expect(mockTransform).toHaveBeenCalledWith('/bar', undefined);

    mockTransform.mockClear();
    setMockTransformOrder('/bar', '/foo');
    await assertOrder();
    expect(mockTransform).toHaveBeenCalledWith('/bar', undefined);
    expect(mockTransform).toHaveBeenCalledWith('/foo', undefined);
  });

  test('removing a cycle with multiple outgoing edges to the same module', async () => {
    /*
                      ┌─────────────────────────┐
                      │                         ▼
    ┌─────────┐     ┌──────┐     ┌──────┐     ┌──────┐
    │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │ ──▶ │ /baz │
    └─────────┘     └──────┘     └──────┘     └──────┘
                      ▲            │
                      └────────────┘
    */
    Actions.addDependency('/bar', '/foo');
    Actions.addDependency('/bar', '/baz');
    files.clear();

    await graph.initialTraverseDependencies(options);

    /*
                      ┌─────────────────────────┐
                      │                         ▼
    ┌─────────┐   / ┌──────┐     ┌──────┐     ┌──────┐
    │ /bundle │ ┈/▷ │ /foo │ ──▶ │ /bar │ ──▶ │ /baz │
    └─────────┘ /   └──────┘     └──────┘     └──────┘
                      ▲            │
                      └────────────┘
    */
    Actions.removeDependency('/bundle', '/foo');

    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
    ).toEqual({
      added: new Set(),
      modified: new Set(['/bundle']),
      deleted: new Set(['/foo', '/bar', '/baz']),
    });
  });

  test('deleting a cycle root, then reintroducing the same module, does not corrupt its dependencies', async () => {
    Actions.createFile('/quux');
    Actions.removeDependency('/foo', '/baz');
    Actions.addDependency('/bar', '/foo');
    Actions.addDependency('/bundle', '/baz');
    Actions.addDependency('/foo', '/quux');
    files.clear();

    /*
    ┌─────────┐     ┌──────┐     ┌───────┐     ┌──────┐
    │ /bundle │ ──▶ │ /baz │     │       │ ──▶ │ /bar │
    └─────────┘     └──────┘     │ /foo  │     └──────┘
      │                          │       │       │
      └────────────────────────▶ │       │ ◀─────┘
                                 └───────┘
                                   │
                                   │
                                   ▼
                                 ┌───────┐
                                 │ /quux │
                                 └───────┘
    */
    await graph.initialTraverseDependencies(options);

    // This is a regression test for a bug: Originally `/quux` would get deleted
    // incorrectly as a result of `/foo` temporarily being unreachable (and not
    // itself marked for traversal, which would have "rediscovered" `/quux`).

    // The following exact order of operations reproduced the bug:
    Actions.removeDependency('/bar', '/foo'); // (1)
    // ^ Deletes an inbound edge while there's at least another one remaining,
    //   which marks `/foo` as a possible cycle root.

    Actions.removeDependency('/bundle', '/foo'); // (2)
    // ^ Leaves `/foo` with no inbound edges. With the bug, this would delete
    //   `/foo`'s dependencies immediately but defer freeing `/foo` itself until
    //   the cycle collection pass.

    Actions.addDependency('/baz', '/foo'); // (3)
    // ^ `/foo` has an inbound edge again! If we'd freed `/quux` in (2), it
    //   would now be missing.

    /*
    ┌─────────┐     ┌──────┐ (3) ┌───────┐     ┌──────┐
    │ /bundle │ ──▶ │ /baz │ ━━▶ │       │ ──▶ │ /bar │
    └─────────┘     └──────┘     │ /foo  │     └──────┘
      ┆          /               │       │   \   ┆
      └┈┈┈┈┈┈┈┈┈/┈┈┈┈┈┈┈┈┈┈┈┈┈┈▷ │       │ ◁┈┈\┈┈┘ (1)
               /  (2)            └───────┘     \
                                   │
                                   │
                                   ▼
                                 ┌───────┐
                                 │ /quux │
                                 └───────┘
    */
    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
    ).toEqual({
      added: new Set([]),
      modified: new Set(['/bundle', '/bar', '/baz']),
      deleted: new Set([]),
    });
  });
});

describe('only reachable errors are reported', () => {
  test('a resolver error is ignored when batched before detaching the origin module from the graph', async () => {
    /*
    ┌─────────┐     ┌──────┐     ┌──────┐
    │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │
    └─────────┘     └──────┘     └──────┘
                      │
                      │
                      ▼
                    ┌──────┐
                    │ /baz │
                    └──────┘
    */
    await graph.initialTraverseDependencies(options);

    Actions.addDependency('/bar', '/does-not-exist');
    Actions.deleteFile('/does-not-exist', graph);
    Actions.removeDependency('/foo', '/bar');

    /*
    ┌─────────┐     ┌──────┐   / ┌──────┐
    │ /bundle │ ──▶ │ /foo │ ┈/▷ │ /bar │ ━━▶ /does-not-exist
    └─────────┘     └──────┘ /   └──────┘
                      │
                      │
                      ▼
                    ┌──────┐
                    │ /baz │
                    └──────┘
    */
    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
    ).toEqual({
      added: new Set([]),
      modified: new Set(['/foo']),
      deleted: new Set(['/bar']),
    });
  });

  test('a resolver error is cleared after detaching the origin module from the graph', async () => {
    /*
    Generate the initial dependency graph:
    ┌─────────┐     ┌──────┐     ┌──────┐
    │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │
    └─────────┘     └──────┘     └──────┘
                      │
                      │
                      ▼
                    ┌──────┐
                    │ /baz │
                    └──────┘
    */
    await graph.initialTraverseDependencies(options);

    Actions.addDependency('/bar', '/does-not-exist');
    Actions.deleteFile('/does-not-exist', graph);

    /*
    ┌─────────┐     ┌──────┐     ┌──────┐
    │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │ ━━▶ /does-not-exist
    └─────────┘     └──────┘     └──────┘
                      │
                      │
                      ▼
                    ┌──────┐
                    │ /baz │
                    └──────┘
    */
    await expect(
      graph.traverseDependencies([...files], options),
    ).rejects.toThrowError('Dependency not found: /bar -> /does-not-exist');

    // NOTE: not clearing `files`, to mimic DeltaCalculator's error behaviour.

    Actions.removeDependency('/foo', '/bar');

    /*
    ┌─────────┐     ┌──────┐   / ┌──────┐
    │ /bundle │ ──▶ │ /foo │ ┈/▷ │ /bar │ ━━▶ /does-not-exist
    └─────────┘     └──────┘ /   └──────┘
                      │
                      │
                      ▼
                    ┌──────┐
                    │ /baz │
                    └──────┘
    */
    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
    ).toEqual({
      added: new Set([]),
      modified: new Set(['/foo']),
      deleted: new Set(['/bar']),
    });
  });

  test('a transformer error is ignored when batched before detaching the module from the graph', async () => {
    class BarError extends Error {}

    /*
    ┌─────────┐     ┌──────┐     ┌──────┐
    │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │
    └─────────┘     └──────┘     └──────┘
                      │
                      │
                      ▼
                    ┌──────┐
                    │ /baz │
                    └──────┘
    */
    await graph.initialTraverseDependencies(options);

    Actions.modifyFile('/bar');
    Actions.removeDependency('/foo', '/bar');
    transformOverrides.set('/bar', () => {
      throw new BarError();
    });

    /*
    ┌─────────┐     ┌──────┐   / ┏━━━━━━┓
    │ /bundle │ ──▶ │ /foo │ ┈/▷ ┃ /bar ┃ ⚠ BarError
    └─────────┘     └──────┘ /   ┗━━━━━━┛
                      │
                      │
                      ▼
                    ┌──────┐
                    │ /baz │
                    └──────┘
    */
    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
    ).toEqual({
      added: new Set([]),
      modified: new Set(['/foo']),
      deleted: new Set(['/bar']),
    });
  });

  test('a transformer error is cleared after detaching the module from the graph', async () => {
    class BarError extends Error {}

    /*
    ┌─────────┐     ┌──────┐     ┌──────┐
    │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │
    └─────────┘     └──────┘     └──────┘
                      │
                      │
                      ▼
                    ┌──────┐
                    │ /baz │
                    └──────┘
    */
    await graph.initialTraverseDependencies(options);

    Actions.modifyFile('/bar');
    transformOverrides.set('/bar', () => {
      throw new BarError();
    });

    /*
    ┌─────────┐     ┌──────┐     ┏━━━━━━┓
    │ /bundle │ ──▶ │ /foo │ ──▶ ┃ /bar ┃ ⚠ BarError
    └─────────┘     └──────┘     ┗━━━━━━┛
                      │
                      │
                      ▼
                    ┌──────┐
                    │ /baz │
                    └──────┘
    */
    await expect(
      graph.traverseDependencies([...files], options),
    ).rejects.toThrow(BarError);

    // NOTE: not clearing `files`, to mimic DeltaCalculator's error behaviour.

    Actions.removeDependency('/foo', '/bar');

    /*
    ┌─────────┐     ┌──────┐   / ┏━━━━━━┓
    │ /bundle │ ──▶ │ /foo │ ┈/▷ ┃ /bar ┃ ⚠ BarError
    └─────────┘     └──────┘ /   ┗━━━━━━┛
                      │
                      │
                      ▼
                    ┌──────┐
                    │ /baz │
                    └──────┘
    */
    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
    ).toEqual({
      added: new Set([]),
      modified: new Set(['/foo']),
      deleted: new Set(['/bar']),
    });
  });

  test('a resolver error in a cycle is ignored when batched before detaching the origin module from the graph', async () => {
    Actions.addDependency('/bar', '/foo');
    /*
                      ┌────────────┐
                      ▼            │
    ┌─────────┐     ┌──────┐     ┌──────┐
    │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │
    └─────────┘     └──────┘     └──────┘
                      │
                      │
                      ▼
                    ┌──────┐
                    │ /baz │
                    └──────┘

    */
    await graph.initialTraverseDependencies(options);

    Actions.addDependency('/bar', '/does-not-exist');
    Actions.deleteFile('/does-not-exist', graph);
    Actions.removeDependency('/bundle', '/foo');

    /*
                      ┌────────────┐
                      ▼            │
    ┌─────────┐   / ┌──────┐     ┌──────┐
    │ /bundle │ ┈/▷ │ /foo │ ──▶ │ /bar │ ━━▶ /does-not-exist
    └─────────┘ /   └──────┘     └──────┘
                      │
                      │
                      ▼
                    ┌──────┐
                    │ /baz │
                    └──────┘
    */
    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
    ).toEqual({
      added: new Set([]),
      modified: new Set(['/bundle']),
      deleted: new Set(['/foo', '/bar', '/baz']),
    });
  });

  test('a resolver error in a cycle is cleared after detaching the origin module from the graph', async () => {
    Actions.addDependency('/bar', '/foo');
    /*
                      ┌────────────┐
                      ▼            │
    ┌─────────┐     ┌──────┐     ┌──────┐
    │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │
    └─────────┘     └──────┘     └──────┘
                      │
                      │
                      ▼
                    ┌──────┐
                    │ /baz │
                    └──────┘

    */
    await graph.initialTraverseDependencies(options);

    Actions.addDependency('/bar', '/does-not-exist');
    Actions.deleteFile('/does-not-exist', graph);

    /*
                      ┌────────────┐
                      ▼            │
    ┌─────────┐     ┌──────┐     ┌──────┐
    │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │ ━━▶ /does-not-exist
    └─────────┘     └──────┘     └──────┘
                      │
                      │
                      ▼
                    ┌──────┐
                    │ /baz │
                    └──────┘
    */
    await expect(
      graph.traverseDependencies([...files], options),
    ).rejects.toThrowError('Dependency not found: /bar -> /does-not-exist');

    // NOTE: not clearing `files`, to mimic DeltaCalculator's error behaviour.

    Actions.removeDependency('/bundle', '/foo');

    /*
                      ┌────────────┐
                      ▼            │
    ┌─────────┐   / ┌──────┐     ┌──────┐
    │ /bundle │ ┈/▷ │ /foo │ ──▶ │ /bar │ ━━▶ /does-not-exist
    └─────────┘ /   └──────┘     └──────┘
                      │
                      │
                      ▼
                    ┌──────┐
                    │ /baz │
                    └──────┘
    */
    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
    ).toEqual({
      added: new Set([]),
      modified: new Set(['/bundle']),
      deleted: new Set(['/foo', '/bar', '/baz']),
    });
  });

  test('a transformer error in a cycle is ignored when batched before detaching the module from the graph', async () => {
    class BarError extends Error {}

    Actions.addDependency('/bar', '/foo');
    /*
                      ┌────────────┐
                      ▼            │
    ┌─────────┐     ┌──────┐     ┌──────┐
    │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │
    └─────────┘     └──────┘     └──────┘
                      │
                      │
                      ▼
                    ┌──────┐
                    │ /baz │
                    └──────┘
    */
    await graph.initialTraverseDependencies(options);

    Actions.modifyFile('/bar');
    Actions.removeDependency('/bundle', '/foo');
    transformOverrides.set('/bar', () => {
      throw new BarError();
    });

    /*
                      ┌────────────┐
                      ▼            │
    ┌─────────┐   / ┌──────┐     ┏━━━━━━┓
    │ /bundle │ ┈/▷ │ /foo │ ──▶ ┃ /bar ┃ ⚠ BarError
    └─────────┘ /   └──────┘     ┗━━━━━━┛
                      │
                      │
                      ▼
                    ┌──────┐
                    │ /baz │
                    └──────┘
    */
    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
    ).toEqual({
      added: new Set([]),
      modified: new Set(['/bundle']),
      deleted: new Set(['/foo', '/bar', '/baz']),
    });
  });

  test('a transformer error in a cycle is cleared after detaching the module from the graph', async () => {
    class BarError extends Error {}

    Actions.addDependency('/bar', '/foo');
    /*
                      ┌────────────┐
                      ▼            │
    ┌─────────┐     ┌──────┐     ┌──────┐
    │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │
    └─────────┘     └──────┘     └──────┘
                      │
                      │
                      ▼
                    ┌──────┐
                    │ /baz │
                    └──────┘
    */
    await graph.initialTraverseDependencies(options);

    Actions.modifyFile('/bar');
    transformOverrides.set('/bar', () => {
      throw new BarError();
    });

    /*
                      ┌────────────┐
                      ▼            │
    ┌─────────┐     ┌──────┐     ┏━━━━━━┓
    │ /bundle │ ──▶ │ /foo │ ──▶ ┃ /bar ┃ ⚠ BarError
    └─────────┘     └──────┘     ┗━━━━━━┛
                      │
                      │
                      ▼
                    ┌──────┐
                    │ /baz │
                    └──────┘
    */
    await expect(
      graph.traverseDependencies([...files], options),
    ).rejects.toThrow(BarError);

    // NOTE: not clearing `files`, to mimic DeltaCalculator's error behaviour.

    Actions.removeDependency('/bundle', '/foo');

    /*
                      ┌────────────┐
                      ▼            │
    ┌─────────┐   / ┌──────┐     ┏━━━━━━┓
    │ /bundle │ ┈/▷ │ /foo │ ──▶ ┃ /bar ┃ ⚠ BarError
    └─────────┘ /   └──────┘     ┗━━━━━━┛
                      │
                      │
                      ▼
                    ┌──────┐
                    │ /baz │
                    └──────┘
    */
    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
    ).toEqual({
      added: new Set([]),
      modified: new Set(['/bundle']),
      deleted: new Set(['/foo', '/bar', '/baz']),
    });
  });
});

describe('require.context', () => {
  let localOptions;
  beforeEach(() => {
    localOptions = {
      ...options,
      unstable_allowRequireContext: true,
    };
  });

  const ctxParams: RequireContextParams = {
    recursive: true,
    mode: 'sync',
    filter: {pattern: '.*', flags: ''},
  };

  const ctxResolved = {
    recursive: true,
    mode: 'sync',
    filter: /.*/,
    from: '/ctx',
  };

  const ctxPath = deriveAbsolutePathFromContext('/ctx', ctxParams);

  test('a context module is created when the context exists in the initial graph', async () => {
    // Create a context module
    Actions.addDependency('/bundle', '/ctx', {
      data: {
        contextParams: ctxParams,
      },
    });

    // Compute the initial graph
    files.clear();
    await graph.initialTraverseDependencies(localOptions);

    // The transformer receives the arguments necessary to generate a context module
    expect(mockTransform).toHaveBeenCalledWith(ctxPath, ctxResolved);
    // Ensure the module has been created
    expect(graph.dependencies.get(ctxPath)).not.toBe(undefined);
    // No module at /ctx - that dependency turned into the context module
    expect(graph.dependencies.get('/ctx')).toBe(undefined);

    // We can match paths against the created context
    expect(getMatchingContextModules(graph, '/ctx/matched-file')).toEqual(
      new Set([ctxPath]),
    );
    expect(getMatchingContextModules(graph, '/no-match')).toEqual(new Set());
  });

  test('a context module is created incrementally', async () => {
    // Compute the initial graph
    files.clear();
    await graph.initialTraverseDependencies(localOptions);

    // Create a context module
    Actions.addDependency('/bundle', '/ctx', {
      data: {
        contextParams: ctxParams,
      },
    });

    // Compute the new graph incrementally
    expect(
      getPaths(await graph.traverseDependencies([...files], localOptions)),
    ).toEqual({
      added: new Set([ctxPath]),
      deleted: new Set([]),
      modified: new Set(['/bundle']),
    });

    // The transformer receives the arguments necessary to generate a context module
    expect(mockTransform).toHaveBeenCalledWith(ctxPath, ctxResolved);

    // We can match paths against the created context
    expect(getMatchingContextModules(graph, '/ctx/matched-file')).toEqual(
      new Set([ctxPath]),
    );
  });

  test('context exists in initial traversal and is then removed', async () => {
    // Create a context module
    Actions.addDependency('/bundle', '/ctx', {
      data: {
        contextParams: ctxParams,
      },
    });

    // Compute the initial graph
    files.clear();
    await graph.initialTraverseDependencies(localOptions);

    // Remove the reference to the context module
    Actions.removeDependency('/bundle', '/ctx');

    // Compute the new graph incrementally
    expect(
      getPaths(await graph.traverseDependencies([...files], localOptions)),
    ).toEqual({
      added: new Set([]),
      deleted: new Set([ctxPath]),
      modified: new Set(['/bundle']),
    });

    // We can no longer match against this context because it has been deleted
    expect(getMatchingContextModules(graph, '/ctx/matched-file')).toEqual(
      new Set(),
    );
  });

  test('context + matched file exist in initial traversal and are then removed', async () => {
    // Create a context module
    Actions.addDependency('/bundle', '/ctx', {
      data: {
        contextParams: ctxParams,
      },
    });

    // Create the file matched by the context
    Actions.createFile('/ctx/matched-file');
    // Create a dependency between the context module and the new file, for mockTransform
    Actions.addInferredDependency(ctxPath, '/ctx/matched-file');

    // Compute the initial graph
    files.clear();
    await graph.initialTraverseDependencies(localOptions);

    // Ensure the context module and the matched file are in the graph
    expect(graph.dependencies.get(ctxPath)).not.toBe(undefined);
    expect(graph.dependencies.get('/ctx/matched-file')).not.toBe(undefined);

    // Remove the reference to the context module
    Actions.removeDependency('/bundle', '/ctx');

    // Compute the new graph incrementally
    expect(
      getPaths(await graph.traverseDependencies([...files], localOptions)),
    ).toEqual({
      added: new Set([]),
      deleted: new Set([ctxPath, '/ctx/matched-file']),
      modified: new Set(['/bundle']),
    });

    // We can no longer match against this context because it has been deleted
    expect(getMatchingContextModules(graph, '/ctx/matched-file')).toEqual(
      new Set(),
    );
  });

  test('remove a matched file incrementally from a context', async () => {
    // Create a context module
    Actions.addDependency('/bundle', '/ctx', {
      data: {
        contextParams: ctxParams,
      },
    });

    // Create the file matched by the context
    Actions.createFile('/ctx/matched-file');
    // Create a dependency between the context module and the new file, for mockTransform
    Actions.addInferredDependency(ctxPath, '/ctx/matched-file');

    // Compute the initial graph
    files.clear();
    await graph.initialTraverseDependencies(localOptions);

    // Ensure we recorded an inverse dependency between the matched file and the context module
    expect([
      ...nullthrows(graph.dependencies.get('/ctx/matched-file'))
        .inverseDependencies,
    ]).toEqual([ctxPath]);

    // Delete the matched file
    Actions.deleteFile('/ctx/matched-file', graph);

    // Propagate the deletion to the context module (normally DeltaCalculator's responsibility)
    Actions.removeInferredDependency(ctxPath, '/ctx/matched-file');
    Actions.modifyFile(ctxPath);

    // Compute the new graph incrementally
    mockTransform.mockClear();
    expect(
      getPaths(await graph.traverseDependencies([...files], localOptions)),
    ).toEqual({
      added: new Set([]),
      modified: new Set([ctxPath]),
      deleted: new Set(['/ctx/matched-file']),
    });

    // Ensure the incremental traversal re-transformed the context module
    expect(mockTransform).toHaveBeenCalledWith(ctxPath, ctxResolved);
  });

  test('modify a matched file incrementally', async () => {
    // Create a context module
    Actions.addDependency('/bundle', '/ctx', {
      data: {
        contextParams: ctxParams,
      },
    });

    // Create the file matched by the context
    Actions.createFile('/ctx/matched-file');
    // Create a dependency between the context module and the new file, for mockTransform
    Actions.addInferredDependency(ctxPath, '/ctx/matched-file');

    // Compute the initial graph
    files.clear();
    await graph.initialTraverseDependencies(localOptions);

    // Modify the matched file
    Actions.modifyFile('/ctx/matched-file');

    // We do not propagate the modification to the context module. (See DeltaCalculator)

    // Compute the new graph incrementally
    mockTransform.mockClear();
    expect(
      getPaths(await graph.traverseDependencies([...files], localOptions)),
    ).toEqual({
      added: new Set([]),
      modified: new Set(['/ctx/matched-file']),
      deleted: new Set([]),
    });

    // Ensure the incremental traversal did not re-transform the context module
    expect(mockTransform).not.toHaveBeenCalledWith(ctxPath, ctxResolved);
  });

  test('add a matched file incrementally to a context', async () => {
    // Create a context module
    Actions.addDependency('/bundle', '/ctx', {
      data: {
        contextParams: ctxParams,
      },
    });

    // Compute the initial graph
    files.clear();
    await graph.initialTraverseDependencies(localOptions);

    // Create the file matched by the context
    Actions.createFile('/ctx/matched-file');
    // Create a dependency between the context module and the new file, for mockTransform
    Actions.addInferredDependency(ctxPath, '/ctx/matched-file');
    // Propagate the addition to the context module (normally DeltaCalculator's responsibility)
    graph.markModifiedContextModules('/ctx/matched-file', files);

    // Compute the new graph incrementally
    mockTransform.mockClear();
    expect(
      getPaths(await graph.traverseDependencies([...files], localOptions)),
    ).toEqual({
      added: new Set(['/ctx/matched-file']),
      modified: new Set([ctxPath]),
      deleted: new Set([]),
    });

    // Ensure the incremental traversal re-transformed the context module
    expect(mockTransform).toHaveBeenCalledWith(ctxPath, ctxResolved);
  });

  test('add a matched file incrementally to a context with two references', async () => {
    // Create a context module
    Actions.addDependency('/bundle', '/ctx', {
      data: {
        contextParams: ctxParams,
      },
    });

    // Create another reference to the same context module
    Actions.addDependency('/foo', '/ctx', {
      data: {
        contextParams: ctxParams,
      },
    });

    // Compute the initial graph
    files.clear();
    await graph.initialTraverseDependencies(localOptions);

    // Create the file matched by the context
    Actions.createFile('/ctx/matched-file');
    Actions.addInferredDependency(ctxPath, '/ctx/matched-file');
    // Propagate the addition to the context module (normally DeltaCalculator's responsibility)
    graph.markModifiedContextModules('/ctx/matched-file', files);

    // Compute the new graph incrementally
    mockTransform.mockClear();
    expect(
      getPaths(await graph.traverseDependencies([...files], localOptions)),
    ).toEqual({
      added: new Set(['/ctx/matched-file']),
      modified: new Set([ctxPath]),
      deleted: new Set([]),
    });

    // Ensure the incremental traversal re-transformed the context module
    expect(mockTransform).toHaveBeenCalledWith(ctxPath, ctxResolved);
  });

  test('remove only one of two references to a context module', async () => {
    // Create a context module
    Actions.addDependency('/bundle', '/ctx', {
      data: {
        contextParams: ctxParams,
      },
    });

    // Create another reference to the same context module
    Actions.addDependency('/foo', '/ctx', {
      data: {
        contextParams: ctxParams,
      },
    });

    // Compute the initial graph
    files.clear();
    await graph.initialTraverseDependencies(localOptions);

    // Remove one reference
    Actions.removeDependency('/bundle', '/ctx');

    // Compute the new graph incrementally
    mockTransform.mockClear();
    expect(
      getPaths(await graph.traverseDependencies([...files], localOptions)),
    ).toEqual({
      added: new Set([]),
      modified: new Set(['/bundle']),
      deleted: new Set([]),
    });

    // Ensure the incremental traversal did not re-transform the context module
    expect(mockTransform).not.toHaveBeenCalledWith(ctxPath, ctxResolved);

    // We can still match against this context because it has not been deleted
    expect(getMatchingContextModules(graph, '/ctx/matched-file')).toEqual(
      new Set([ctxPath]),
    );
  });

  describe('when two distinct contexts match the same file', () => {
    const narrowCtxParams: RequireContextParams = {
      recursive: true,
      mode: 'sync',
      filter: {pattern: '\\./narrow/.*', flags: ''},
    };

    const narrowCtxResolved = {
      recursive: true,
      mode: 'sync',
      filter: /\.\/narrow\/.*/,
      from: '/ctx',
    };

    const narrowCtxPath = deriveAbsolutePathFromContext(
      '/ctx',
      narrowCtxParams,
    );

    test('creates two context modules in the initial traversal', async () => {
      // Create a context module
      Actions.addDependency('/bundle', '/ctx', {
        data: {
          contextParams: ctxParams,
        },
      });

      // Create a different context module with the same base path and origin module
      Actions.addDependency('/bundle', '/ctx', {
        data: {
          contextParams: narrowCtxParams,
          key: '/ctx2',
        },
      });

      // Compute the initial graph
      files.clear();
      await graph.initialTraverseDependencies(localOptions);

      // The transformer receives the arguments necessary to generate each context module
      expect(mockTransform).toHaveBeenCalledWith(ctxPath, ctxResolved);
      expect(mockTransform).toHaveBeenCalledWith(
        narrowCtxPath,
        narrowCtxResolved,
      );
      // Ensure the modules have been created
      expect(graph.dependencies.get(ctxPath)).not.toBe(undefined);
      expect(graph.dependencies.get(narrowCtxPath)).not.toBe(undefined);
      // No module at /ctx or /ctx/narrow - those dependencies turned into the context modules
      expect(graph.dependencies.get('/ctx')).toBe(undefined);
      expect(graph.dependencies.get('/ctx/narrow')).toBe(undefined);
      // Not conflating the key with the virtual path
      expect(graph.dependencies.get('/ctx2')).toBe(undefined);

      // We can match paths against the contexts
      expect(getMatchingContextModules(graph, '/ctx/matched-file')).toEqual(
        new Set([ctxPath]),
      );
      expect(
        getMatchingContextModules(graph, '/ctx/narrow/matched-file'),
      ).toEqual(new Set([ctxPath, narrowCtxPath]));
    });

    test('add a file matched by both contexts', async () => {
      // Create a context module
      Actions.addDependency('/bundle', '/ctx', {
        data: {
          contextParams: ctxParams,
        },
      });

      // Create a different context module with the same base path and origin module
      Actions.addDependency('/bundle', '/ctx', {
        data: {
          contextParams: narrowCtxParams,
          key: '/ctx2',
        },
      });

      // Compute the initial graph
      files.clear();
      await graph.initialTraverseDependencies(localOptions);

      // Create the file matched by the contexts
      Actions.createFile('/ctx/narrow/matched-file');
      Actions.addInferredDependency(ctxPath, '/ctx/narrow/matched-file');
      Actions.addInferredDependency(narrowCtxPath, '/ctx/narrow/matched-file');
      // Propagate the addition to the context modules (normally DeltaCalculator's responsibility)
      graph.markModifiedContextModules('/ctx/narrow/matched-file', files);

      // Compute the new graph incrementally
      expect(
        getPaths(await graph.traverseDependencies([...files], localOptions)),
      ).toEqual({
        added: new Set(['/ctx/narrow/matched-file']),
        modified: new Set([ctxPath, narrowCtxPath]),
        deleted: new Set([]),
      });
    });

    test('deleting one context does not delete a file matched by both contexts', async () => {
      // Create a context module
      Actions.addDependency('/bundle', '/ctx', {
        data: {
          contextParams: ctxParams,
        },
      });

      // Create a different context module with the same base path and origin module
      Actions.addDependency('/bundle', '/ctx', {
        data: {
          contextParams: narrowCtxParams,
          key: '/ctx2',
        },
      });

      // Create the file matched by the contexts
      Actions.createFile('/ctx/narrow/matched-file');
      Actions.addInferredDependency(ctxPath, '/ctx/narrow/matched-file');
      Actions.addInferredDependency(narrowCtxPath, '/ctx/narrow/matched-file');

      // Compute the initial graph
      files.clear();
      await graph.initialTraverseDependencies(localOptions);

      // Remove the reference to one of the context modules
      Actions.removeDependency('/bundle', '/ctx');

      // Compute the new graph incrementally
      expect(
        getPaths(await graph.traverseDependencies([...files], localOptions)),
      ).toEqual({
        added: new Set([]),
        modified: new Set(['/bundle']),
        deleted: new Set([ctxPath]),
      });
    });

    test('edge case: changing context params incrementally under the same key', async () => {
      // Create a context module
      Actions.addDependency('/bundle', '/ctx', {
        data: {
          contextParams: ctxParams,
          key: '/ctx',
        },
      });
      // Create the file matched by the contexts
      Actions.createFile('/ctx/narrow/matched-file');
      Actions.addInferredDependency(ctxPath, '/ctx/narrow/matched-file');

      // Compute the initial graph
      files.clear();
      await graph.initialTraverseDependencies(localOptions);

      // Remove the reference to one of the context modules
      Actions.removeDependency('/bundle', '/ctx');
      // Replace it with a context with different params
      Actions.addDependency('/bundle', '/ctx', {
        data: {
          contextParams: narrowCtxParams,
          key: '/ctx',
        },
      });
      Actions.addInferredDependency(narrowCtxPath, '/ctx/narrow/matched-file');

      // Compute the new graph incrementally
      expect(
        getPaths(await graph.traverseDependencies([...files], localOptions)),
      ).toEqual({
        added: new Set([narrowCtxPath]),
        modified: new Set(['/bundle']),
        deleted: new Set([ctxPath]),
      });

      // We can match paths against the updated context
      expect(getMatchingContextModules(graph, '/ctx/matched-file')).toEqual(
        new Set(),
      );
      expect(
        getMatchingContextModules(graph, '/ctx/narrow/matched-file'),
      ).toEqual(new Set([narrowCtxPath]));
    });
  });

  test('edge case: replacing a generated context file with a file that happens to have the same name and key', async () => {
    // Create a context module
    Actions.addDependency('/bundle', '/ctx', {
      data: {
        contextParams: ctxParams,
        key: '/ctx',
      },
    });
    // Create the file matched by the context
    Actions.createFile('/ctx/matched-file');
    Actions.addInferredDependency(ctxPath, '/ctx/matched-file');

    // Compute the initial graph
    files.clear();
    await graph.initialTraverseDependencies(localOptions);

    // Remove the reference to the context module
    Actions.removeDependency('/bundle', '/ctx');
    // Create a real file that collides with the context module's generated path
    Actions.createFile(ctxPath);
    Actions.addDependency('/bundle', ctxPath, {data: {key: '/ctx'}});
    Actions.createFile('/other-file');
    Actions.removeInferredDependency(ctxPath, '/ctx/matched-file');
    Actions.addDependency(ctxPath, '/other-file');

    // Compute the new graph incrementally
    expect(
      getPaths(await graph.traverseDependencies([...files], localOptions)),
    ).toEqual({
      added: new Set(['/other-file']),
      modified: new Set(['/bundle', ctxPath]),
      deleted: new Set(['/ctx/matched-file']),
    });

    // We can no longer match paths against the context because it has been deleted
    expect(getMatchingContextModules(graph, '/ctx/matched-file')).toEqual(
      new Set(),
    );
  });
});

describe('reorderGraph', () => {
  test('should reorder any unordered graph in DFS order', async () => {
    const dep = (path: string): ResolvedDependency => ({
      absolutePath: path,
      data: {
        data: {
          asyncType: null,
          isESMImport: false,
          locs: [],
          key: path.substr(1),
        },
        name: path.substr(1),
      },
    });

    const mod = (moduleData: {
      dependencies: Map<string, Dependency>,
      path: string,
    }): Module<MixedOutput> => ({
      ...moduleData,
      output: [],
      getSource: () => Buffer.from('// source'),
      // NOTE: inverseDependencies is traversal state/output, not input, so we
      // don't pre-populate it.
      inverseDependencies: new CountingSet(),
    });

    const graph = new TestGraph({
      entryPoints: new Set(['/a', '/b']),
      transformOptions: options.transformOptions,
    });
    // prettier-ignore
    const deps = [
      ['/2', mod({path: '/2', dependencies: new Map()})],
      ['/0', mod({path: '/0', dependencies: new Map([['/1', dep('/1')], ['/2', dep('/2')]])})],
      ['/1', mod({path: '/1', dependencies: new Map([['/2', dep('/2')]])})],
      ['/3', mod({path: '/3', dependencies: new Map([])})],
      ['/b', mod({path: '/b', dependencies: new Map([['/3', dep('/3')]])})],
      ['/a', mod({path: '/a', dependencies: new Map([['/0', dep('/0')]])})],
    ];
    for (const [key, dep] of deps) {
      graph.dependencies.set(key, dep);
    }

    graph.reorderGraph({shallow: false});

    expect([...graph.dependencies.keys()]).toEqual([
      '/a',
      '/0',
      '/1',
      '/2',
      '/b',
      '/3',
    ]);
  });
});

describe('optional dependencies', () => {
  let localGraph;
  let localOptions;
  let dependencyKeys: Map<string, string>;

  const createMockTransform = (notOptional?: string[]) => {
    /* $FlowFixMe[missing-this-annot] The 'this' type annotation(s) required by
     * Flow's LTI update could not be added via codemod */
    return async function (path: string, context: ?RequireContext) {
      const result = await mockTransform.call(this, path, context);
      return {
        ...result,
        dependencies: result.dependencies.map(dep => {
          let isOptional;
          if (notOptional && notOptional.includes(dep.name)) {
            isOptional = false;
          } else {
            isOptional = dep.name.includes('optional-');
          }
          return {
            ...dep,
            data: {
              ...dep.data,
              isOptional,
            },
          };
        }),
      };
    };
  };

  beforeEach(() => {
    mockedDependencies = new Set();
    mockedDependencyTree = new Map();
    dependencyKeys = new Map();

    entryModule = Actions.createFile('/bundle-o');

    dependencyKeys.set(
      '/regular-a',
      Actions.addDependency('/bundle-o', '/regular-a'),
    );
    dependencyKeys.set(
      '/optional-b',
      Actions.addDependency('/bundle-o', '/optional-b'),
    );

    localGraph = new TestGraph({
      entryPoints: new Set(['/bundle-o']),
      transformOptions: options.transformOptions,
    });

    Actions.deleteFile('/optional-b', localGraph);
  });

  test('missing optional dependency will be skipped', async () => {
    localOptions = {
      ...options,
      transform: createMockTransform(),
    };

    const result = await localGraph.initialTraverseDependencies(localOptions);

    expect(result.added).toEqual(
      new Map([
        [
          '/bundle-o',
          expect.objectContaining({
            dependencies: new Map([
              [
                dependencyKeys.get('/regular-a'),
                expect.objectContaining({
                  absolutePath: '/regular-a',
                  data: expect.objectContaining({
                    isOptional: false,
                  }),
                }),
              ],
              [
                dependencyKeys.get('/optional-b'),
                expect.objectContaining({
                  absolutePath: null,
                  data: expect.objectContaining({
                    isOptional: true,
                  }),
                }),
              ],
            ]),
          }),
        ],
        [
          '/regular-a',
          expect.objectContaining({
            dependencies: new Map(),
          }),
        ],
      ]),
    );
  });
  test('missing non-optional dependency will throw', async () => {
    localOptions = {
      ...options,
      transform: createMockTransform(['optional-b']),
    };
    await expect(
      localGraph.initialTraverseDependencies(localOptions),
    ).rejects.toThrow();
  });

  test('deleting an optional dependency will not throw', async () => {
    localOptions = {
      ...options,
      transform: createMockTransform(),
    };
    /*
    ┌───────────┐     ┌────────────┐
    │ /bundle-o │ ──▶ │ /regular-a │
    └───────────┘     └────────────┘
          │
          │
          ▼
    ┌─────────────┐     ┌────────────┐
    │ /optional-b │ ──▶ │ /regular-c │
    └─────────────┘     └────────────┘
    */
    Actions.createFile('/optional-b');
    Actions.addDependency('/optional-b', '/regular-c');

    expect(
      getPaths(await localGraph.initialTraverseDependencies(localOptions)),
    ).toEqual({
      added: new Set(['/bundle-o', '/regular-a', '/optional-b', '/regular-c']),
      modified: new Set(),
      deleted: new Set(),
    });

    Actions.deleteFile('/optional-b', localGraph);

    /*
    ┌───────────┐     ┌────────────┐
    │ /bundle-o │ ──▶ │ /regular-a │
    └───────────┘     └────────────┘
          │
          │
          ▼
    ┌────╲──╱─────┐     ┌────────────┐
    │ /optional-b │ ──▶ │ /regular-c │
    └────╱──╲─────┘     └────────────┘
    */

    expect(
      getPaths(await localGraph.traverseDependencies([...files], localOptions)),
    ).toEqual({
      added: new Set(),
      modified: new Set(['/bundle-o']),
      deleted: new Set(['/optional-b', '/regular-c']),
    });
  });

  test('creating a file satisfying an unresolved optional dependency', async () => {
    localOptions = {
      ...options,
      transform: createMockTransform(),
    };
    /*
    ┌───────────┐     ┌────────────┐
    │ /bundle-o │ ──▶ │ /regular-a │
    └───────────┘     └────────────┘
          ┊
          ┊
          ▽
    ┌┈┈┈┈┈┈┈┈┈┈┈┈┈┐
    ┊ /optional-b ┊ (not yet created)
    └┈┈┈┈┈┈┈┈┈┈┈┈┈┘
    */

    expect(
      getPaths(await localGraph.initialTraverseDependencies(localOptions)),
    ).toEqual({
      added: new Set(['/bundle-o', '/regular-a']),
      modified: new Set(),
      deleted: new Set(),
    });

    Actions.createFile('/optional-b');
    Actions.addDependency('/optional-b', '/regular-c');

    /*
    ┌───────────┐     ┌────────────┐
    │ /bundle-o │ ──▶ │ /regular-a │
    └───────────┘     └────────────┘
          │
          │
          ▼
    ┏━━━━━━━━━━━━━┓     ┏━━━━━━━━━━━━┓
    ┃ /optional-b ┃ ──▶ ┃ /regular-c ┃
    ┗━━━━━━━━━━━━━┛     ┗━━━━━━━━━━━━┛
    */

    expect(
      getPaths(await localGraph.traverseDependencies([...files], localOptions)),
    ).toEqual({
      added: new Set(['/optional-b', '/regular-c']),
      modified: new Set(['/bundle-o']),
      deleted: new Set(),
    });
  });
});

describe('parallel edges', () => {
  test('add twice w/ same name, build and remove once', async () => {
    // Create a second edge between /foo and /bar.
    Actions.addDependency('/foo', '/bar', {
      data: {
        key: 'bar-second-key',
      },
    });

    await graph.initialTraverseDependencies(options);

    // Remove one of the edges between /foo and /bar (arbitrarily)
    Actions.removeDependency('/foo', '/bar');

    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
    ).toEqual({
      added: new Set(),
      modified: new Set(['/foo']),
      deleted: new Set(),
    });
  });

  test('add twice w/ same name, build and remove twice', async () => {
    // Create a second edge between /foo and /bar.
    Actions.addDependency('/foo', '/bar', {
      data: {
        key: 'bar-second-key',
      },
    });

    await graph.initialTraverseDependencies(options);

    // Remove both edges between /foo and /bar
    Actions.removeDependency('/foo', '/bar');
    Actions.removeDependency('/foo', '/bar');

    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
    ).toEqual({
      added: new Set(),
      modified: new Set(['/foo']),
      deleted: new Set(['/bar']),
    });
  });

  test('add twice w/ different names, build and remove once', async () => {
    // Create a second edge between /foo and /bar, with a different `name`.
    Actions.addDependency('/foo', '/bar', {name: 'bar-second'});

    await graph.initialTraverseDependencies(options);

    // Remove one of the edges between /foo and /bar (arbitrarily)
    Actions.removeDependency('/foo', '/bar');

    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
    ).toEqual({
      added: new Set(),
      modified: new Set(['/foo']),
      deleted: new Set(),
    });
  });

  test('add twice w/ different names, build and remove twice', async () => {
    // Create a second edge between /foo and /bar, with a different `name`.
    Actions.addDependency('/foo', '/bar', {name: 'bar-second'});

    await graph.initialTraverseDependencies(options);

    // Remove both edges between /foo and /bar
    Actions.removeDependency('/foo', '/bar');
    Actions.removeDependency('/foo', '/bar');

    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
    ).toEqual({
      added: new Set(),
      modified: new Set(['/foo']),
      deleted: new Set(['/bar']),
    });
  });
});

describe('recovery from transform and resolution errors', () => {
  beforeEach(() => {
    transformOverrides.clear();
  });

  test('a modified parent module is reported after a child error has been cleared', async () => {
    /*
    ┌─────────┐     ┌──────┐     ┌──────┐
    │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │
    └─────────┘     └──────┘     └──────┘
                      │
                      │
                      ▼
                    ┌──────┐
                    │ /baz │
                    └──────┘
    */
    await graph.initialTraverseDependencies(options);

    class BarError extends Error {}
    transformOverrides.set('/bar', () => {
      throw new BarError();
    });
    Actions.modifyFile('/foo');
    Actions.modifyFile('/bar');

    /*
    ┌─────────┐     ┏━━━━━━┓     ┏━━━━━━┓
    │ /bundle │ ──▶ ┃ /foo ┃ ──▶ ┃ /bar ┃ ⚠ BarError
    └─────────┘     ┗━━━━━━┛     ┗━━━━━━┛
                      │
                      │
                      ▼
                    ┌──────┐
                    │ /baz │
                    └──────┘
    */
    await expect(
      graph.traverseDependencies([...files], options),
    ).rejects.toThrow(BarError);

    // User fixes /bar
    transformOverrides.clear();

    // NOTE: not clearing `files`, to mimic DeltaCalculator's error behaviour.

    /*
    ┌─────────┐     ┏━━━━━━┓     ┏━━━━━━┓
    │ /bundle │ ──▶ ┃ /foo ┃ ──▶ ┃ /bar ┃
    └─────────┘     ┗━━━━━━┛     ┗━━━━━━┛
                      │
                      │
                      ▼
                    ┌──────┐
                    │ /baz │
                    └──────┘
    */
    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
    ).toEqual({
      added: new Set(),
      modified: new Set(['/foo', '/bar']),
      deleted: new Set(),
    });
  });

  test('report removed dependencies after being interrupted by a transform error', async () => {
    /*
    ┌─────────┐     ┌──────┐     ┌──────┐
    │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │
    └─────────┘     └──────┘     └──────┘
                      │
                      │
                      ▼
                    ┌──────┐
                    │ /baz │
                    └──────┘
    */
    await graph.initialTraverseDependencies(options);

    class BadError extends Error {}
    transformOverrides.set('/bad', () => {
      throw new BadError();
    });
    Actions.createFile('/bad');
    Actions.removeDependency('/bundle', '/foo');
    Actions.addDependency('/bundle', '/bad');

    /*
    ┌─────────┐     /   ┌──────┐     ┌──────┐
    │ /bundle │ ┈┈┈/┈┈▷ │ /foo │ ──▶ │ /bar │
    └─────────┘   /     └──────┘     └──────┘
        ┃                 │
        ┃                 │
        ▼                 ▼
    ┏━━━━━━┓            ┌──────┐
    ┃ /bad ┃ ⚠ BadError │ /baz │
    ┗━━━━━━┛            └──────┘
    */
    await expect(
      graph.traverseDependencies([...files], options),
    ).rejects.toBeInstanceOf(BadError);

    // User fixes /bad
    transformOverrides.clear();

    /*
    ┌─────────┐     /   ┌──────┐     ┌──────┐
    │ /bundle │ ┈┈┈/┈┈▷ │ /foo │ ──▶ │ /bar │
    └─────────┘   /     └──────┘     └──────┘
        ┃                 │
        ┃                 │
        ▼                 ▼
    ┏━━━━━━┓            ┌──────┐
    ┃ /bad ┃            │ /baz │
    ┗━━━━━━┛            └──────┘
    */
    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
    ).toEqual({
      added: new Set(['/bad']),
      modified: new Set(['/bundle']),
      deleted: new Set(['/foo', '/bar', '/baz']),
    });
  });

  test('report new dependencies as added after correcting an error in their dependencies', async () => {
    /*
    ┌─────────┐     ┌──────┐     ┌──────┐
    │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │
    └─────────┘     └──────┘     └──────┘
                      │
                      │
                      ▼
                    ┌──────┐
                    │ /baz │
                    └──────┘
    */
    await graph.initialTraverseDependencies(options);

    Actions.createFile('/new');
    Actions.createFile('/bad');
    Actions.addDependency('/bar', '/new');
    Actions.addDependency('/new', '/bad');
    class BadError extends Error {}
    transformOverrides.set('/bad', () => {
      throw new BadError();
    });

    /*

    ┌─────────┐     ┌──────┐     ┌──────┐     ┏━━━━━━┓     ┏━━━━━━┓
    │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │ ━━▶ ┃ /new ┃ ━━▶ ┃ /bad ┃ ⚠ BadError
    └─────────┘     └──────┘     └──────┘     ┗━━━━━━┛     ┗━━━━━━┛
                      │
                      │
                      ▼
                    ┌──────┐
                    │ /baz │
                    └──────┘
    */
    await expect(
      graph.traverseDependencies([...files], options),
    ).rejects.toBeInstanceOf(BadError);

    // User fixes /bad
    transformOverrides.clear();
    /*

    ┌─────────┐     ┌──────┐     ┌──────┐     ┏━━━━━━┓     ┏━━━━━━┓
    │ /bundle │ ──▶ │ /foo │ ──▶ │ /bar │ ━━▶ ┃ /new ┃ ━━▶ ┃ /bad ┃
    └─────────┘     └──────┘     └──────┘     ┗━━━━━━┛     ┗━━━━━━┛
                      │
                      │
                      ▼
                    ┌──────┐
                    │ /baz │
                    └──────┘
    */
    expect(
      getPaths(await graph.traverseDependencies([...files], options)),
    ).toEqual({
      added: new Set(['/new', '/bad']),
      modified: new Set(['/bar']),
      deleted: new Set([]),
    });
  });
});

test('when only the order of transformer dependencies changes, the resolved dependencies should be reordered too', async () => {
  await graph.initialTraverseDependencies(options);
  expect([
    ...nullthrows(graph.dependencies.get('/foo')).dependencies.values(),
  ]).toEqual([
    objectContaining({absolutePath: '/bar'}),
    objectContaining({absolutePath: '/baz'}),
  ]);

  Actions.modifyFile('/foo');
  const transformerDeps = nullthrows(mockedDependencyTree.get('/foo'));
  mockedDependencyTree.set('/foo', [...transformerDeps].reverse());

  expect(
    getPaths(await graph.traverseDependencies([...files], options)),
  ).toEqual({
    added: new Set(),
    modified: new Set(['/foo']),
    deleted: new Set(),
  });

  expect([
    ...nullthrows(graph.dependencies.get('/foo')).dependencies.values(),
  ]).toEqual([
    objectContaining({absolutePath: '/baz'}),
    objectContaining({absolutePath: '/bar'}),
  ]);
});
