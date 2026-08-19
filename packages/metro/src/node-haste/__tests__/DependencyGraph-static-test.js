/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 * @oncall react_native
 */

import type {ConfigT, InputConfigT} from 'metro-config';
import type {CustomResolutionContext, Resolution} from 'metro-resolver';
import type {PackageJson} from 'metro-resolver/private/types';

import DependencyGraph from '../DependencyGraph';
import {getDefaultConfig, mergeConfig} from 'metro-config';
import {
  AmbiguousModuleResolutionError,
  PackageResolutionError,
} from 'metro-core';
import {InvalidPackageError} from 'metro-resolver';
import * as path from 'node:path';

// The Watcher is still constructed (it hosts the injected crawler), but neither
// built-in crawler may run, and nothing may be watched.
jest.mock('metro-file-map/private/crawlers/watchman/index', () => () => {
  throw new Error('watchmanCrawl must not be called for a static file map');
});
jest.mock('metro-file-map/private/crawlers/node/index', () => () => {
  throw new Error('nodeCrawl must not be called for a static file map');
});

const rootDir = path.join(path.sep, 'project');
const p = (...parts: Array<string>) => path.join(rootDir, ...parts);

const dep = (name: string) => ({
  name,
  data: {asyncType: null, isESMImport: false, key: name, locs: []},
});

async function makeConfig(overrides?: InputConfigT): Promise<ConfigT> {
  return mergeConfig(await getDefaultConfig(rootDir), {
    projectRoot: rootDir,
    ...overrides,
  });
}

describe('DependencyGraph.unstable_fromStaticFileMap', () => {
  test('resolves relative, node_modules and Haste imports without touching disk', async () => {
    const packageJsons: {[string]: PackageJson} = {
      [p('node_modules', 'dep', 'package.json')]: {main: './lib/dep.js'},
    };
    const graph = await DependencyGraph.unstable_fromStaticFileMap(
      await makeConfig(),
      {
        files: [
          {path: p('src', 'index.js')},
          {path: p('src', 'sibling.js')},
          {path: p('src', 'Hasty.js'), hasteId: 'Hasty'},
          {path: p('node_modules', 'dep', 'package.json')},
          {path: p('node_modules', 'dep', 'lib', 'dep.js')},
        ],
        readPackageJson: filePath => packageJsons[filePath],
      },
    );

    expect(
      graph.resolveDependency(p('src', 'index.js'), dep('./sibling'), null, {
        dev: false,
      }),
    ).toEqual({type: 'sourceFile', filePath: p('src', 'sibling.js')});

    expect(
      graph.resolveDependency(p('src', 'index.js'), dep('Hasty'), null, {
        dev: false,
      }),
    ).toEqual({type: 'sourceFile', filePath: p('src', 'Hasty.js')});

    expect(
      graph.resolveDependency(p('src', 'index.js'), dep('dep'), null, {
        dev: false,
      }),
    ).toEqual({
      type: 'sourceFile',
      filePath: p('node_modules', 'dep', 'lib', 'dep.js'),
    });

    await graph.end();
  });

  test('wraps resolution errors by default', async () => {
    const graph = await DependencyGraph.unstable_fromStaticFileMap(
      await makeConfig(),
      {
        files: [
          {path: p('src', 'index.js')},
          {path: p('src', 'a', 'Dup.js'), hasteId: 'Dup'},
          {path: p('src', 'b', 'Dup.js'), hasteId: 'Dup'},
          {path: p('src', 'broken', 'package.json')},
        ],
        readPackageJson: () => ({main: './nope.js'}),
      },
    );

    expect(() =>
      graph.resolveDependency(p('src', 'index.js'), dep('Dup'), null, {
        dev: false,
      }),
    ).toThrow(AmbiguousModuleResolutionError);

    expect(() =>
      graph.resolveDependency(p('src', 'index.js'), dep('./broken'), null, {
        dev: false,
      }),
    ).toThrow(PackageResolutionError);

    await graph.end();
  });

  test('unstable_rawResolutionErrors leaves errors unwrapped', async () => {
    const {DuplicateHasteCandidatesError} = require('metro-file-map');
    const graph = await DependencyGraph.unstable_fromStaticFileMap(
      await makeConfig(),
      {
        files: [
          {path: p('src', 'index.js')},
          {path: p('src', 'a', 'Dup.js'), hasteId: 'Dup'},
          {path: p('src', 'b', 'Dup.js'), hasteId: 'Dup'},
          {path: p('src', 'broken', 'package.json')},
        ],
        readPackageJson: () => ({main: './nope.js'}),
        unstable_rawResolutionErrors: true,
      },
    );

    expect(() =>
      graph.resolveDependency(p('src', 'index.js'), dep('Dup'), null, {
        dev: false,
      }),
    ).toThrow(DuplicateHasteCandidatesError);

    expect(() =>
      graph.resolveDependency(p('src', 'index.js'), dep('./broken'), null, {
        dev: false,
      }),
    ).toThrow(InvalidPackageError);

    await graph.end();
  });

  test('caches resolutions per resolverOptions', async () => {
    const resolveRequest = jest.fn<
      [CustomResolutionContext, string, string | null],
      Resolution,
    >(() => ({type: 'sourceFile', filePath: p('src', 'sibling.js')}));
    const graph = await DependencyGraph.unstable_fromStaticFileMap(
      await makeConfig({resolver: {resolveRequest}}),
      {
        files: [{path: p('src', 'index.js')}, {path: p('src', 'sibling.js')}],
      },
    );

    const opts = {customResolverOptions: {a: '1'}, dev: false};
    graph.resolveDependency(p('src', 'index.js'), dep('x'), null, opts);
    graph.resolveDependency(p('src', 'index.js'), dep('x'), null, opts);
    expect(resolveRequest).toHaveBeenCalledTimes(1);

    graph.resolveDependency(p('src', 'index.js'), dep('x'), null, {
      customResolverOptions: {a: '2'},
      dev: false,
    });
    expect(resolveRequest).toHaveBeenCalledTimes(2);

    await graph.end();
  });
});
