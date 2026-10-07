/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

import type {RequireContextParams} from '../../ModuleGraph/worker/collectDependencies';
import type {
  BundlerResolution,
  ResolvedDependency,
  TransformResultDependency,
  VirtualSource,
} from '../types';

import {buildSubgraph} from '../buildSubgraph';
import {createPathNormalizer} from './test-utils';
import nullthrows from 'nullthrows';

const p = createPathNormalizer();

const makeTransformDep = (
  name: string,
  asyncType: null | 'weak' | 'async' = null,
  isESMImport: boolean = false,
  contextParams?: RequireContextParams,
): TransformResultDependency => ({
  name,
  data: {
    key: 'key-' + name + (isESMImport ? '-import' : ''),
    asyncType,
    isESMImport,
    locs: [],
    contextParams,
  },
});

class BadTransformError extends Error {}
class DoesNotExistError extends Error {}

describe('GraphTraversal', () => {
  let transformDeps: Map<string, ReadonlyArray<TransformResultDependency>>;

  let params;

  beforeEach(() => {
    transformDeps = new Map([
      [p('/bundle'), [makeTransformDep('foo')]],
      [p('/foo'), [makeTransformDep('bar'), makeTransformDep('baz')]],
      [p('/bar'), []],
      [p('/baz'), [makeTransformDep('qux', 'weak')]],
      [
        p('/entryWithContext'),
        [
          makeTransformDep('virtual', null, false, {
            filter: {
              pattern: 'contextMatch.*',
              flags: 'i',
            },
            mode: 'sync',
            recursive: true,
          }),
        ],
      ],
      [
        p('/virtual?ctx=af3bf59b8564d441084c02bdf04c4d662d74d3bd'),
        [makeTransformDep('contextMatch')],
      ],
      [p('/contextMatch'), []],
    ]);
    params = {
      resolve: jest.fn((from, dependency) => {
        if (dependency.name === 'does-not-exist') {
          throw new DoesNotExistError();
        }
        return {
          filePath: p(`/${dependency.name}`),
          type: 'sourceFile' as const,
        };
      }),
      transform: jest.fn(async (path, requireContext) => {
        if (path === p('/bad')) {
          throw new BadTransformError();
        }
        return {
          dependencies: nullthrows(transformDeps.get(path), path),
          output: [],
          getSource: () => Buffer.from('// source'),
        };
      }),
      shouldTraverse: jest.fn(
        (dependency: ResolvedDependency, virtualSource: ?VirtualSource) =>
          dependency.data.data.asyncType !== 'weak',
      ),
    };
  });

  test('traverses all nodes out from /bundle, except a weak dependency', async () => {
    const {moduleData} = await buildSubgraph(
      new Set([p('/bundle')]),
      new Map(),
      params,
    );
    expect([...moduleData.keys()]).toEqual([
      p('/bundle'),
      p('/foo'),
      p('/bar'),
      p('/baz'),
    ]);
    expect(moduleData.get(p('/bundle'))).toEqual({
      dependencies: new Map([
        [
          'key-foo',
          {
            absolutePath: p('/foo'),
            data: makeTransformDep('foo'),
          },
        ],
      ]),
      getSource: expect.any(Function),
      output: [],
      virtualSources: new Map(),
    });
  });

  test('resolves context and traverses context matches', async () => {
    const {moduleData} = await buildSubgraph(
      new Set([p('/entryWithContext')]),
      new Map(),
      params,
    );
    expect(params.transform).toHaveBeenCalledWith(
      p('/entryWithContext'),
      undefined,
    );
    const expectedResolvedContext = {
      filter: /contextMatch.*/i,
      from: p('/virtual'),
      mode: 'sync',
      recursive: true,
    };
    expect(params.transform).toHaveBeenCalledWith(
      p('/virtual?ctx=af3bf59b8564d441084c02bdf04c4d662d74d3bd'),
      {type: 'requireContext', requireContext: expectedResolvedContext},
    );
    expect(params.transform).toHaveBeenCalledWith(
      p('/contextMatch'),
      undefined,
    );
    expect(params.transform).toHaveBeenCalledWith(
      p('/entryWithContext'),
      undefined,
    );
    expect(moduleData).toEqual(
      new Map([
        [
          p('/entryWithContext'),
          {
            dependencies: new Map([
              [
                'key-virtual',
                {
                  absolutePath: p(
                    '/virtual?ctx=af3bf59b8564d441084c02bdf04c4d662d74d3bd',
                  ),
                  data: nullthrows(
                    transformDeps.get(p('/entryWithContext')),
                  )[0],
                },
              ],
            ]),
            virtualSources: new Map([
              [
                'key-virtual',
                {
                  type: 'requireContext',
                  requireContext: expectedResolvedContext,
                },
              ],
            ]),
            output: [],
            getSource: expect.any(Function),
          },
        ],
        [
          p('/contextMatch'),
          {
            dependencies: new Map(),
            virtualSources: new Map(),
            output: [],
            getSource: expect.any(Function),
          },
        ],
        [
          p('/virtual?ctx=af3bf59b8564d441084c02bdf04c4d662d74d3bd'),
          {
            dependencies: new Map([
              [
                'key-contextMatch',
                {
                  absolutePath: p('/contextMatch'),
                  data: nullthrows(
                    transformDeps.get(
                      p(
                        '/virtual?ctx=af3bf59b8564d441084c02bdf04c4d662d74d3bd',
                      ),
                    ),
                  )[0],
                },
              ],
            ]),
            virtualSources: new Map(),
            output: [],
            getSource: expect.any(Function),
          },
        ],
      ]),
    );
  });

  test('transforms a virtual module as its virtual path and resolves its dependencies from there', async () => {
    const virtualPath = p('/virtual.ts');
    const source = Buffer.from('export default 1;');
    const sha1 = 'b'.repeat(40);
    const modulePath = virtualPath + '?virtual=' + 'a'.repeat(40);
    transformDeps.set(virtualPath, [makeTransformDep('foo')]);
    const resolveFromVirtual = jest.fn(
      (from: string, dep: TransformResultDependency): BundlerResolution => ({
        type: 'sourceFile',
        filePath: p('/foo'),
      }),
    );
    const localParams = {
      ...params,
      resolve: (
        from: string,
        dep: TransformResultDependency,
      ): BundlerResolution =>
        from === p('/bundle')
          ? {type: 'virtualModule', filePath: modulePath, source, sha1}
          : resolveFromVirtual(from, dep),
    };

    const {moduleData} = await buildSubgraph(
      new Set([p('/bundle')]),
      new Map(),
      localParams,
    );

    // The graph node is the module path with its identity suffix.
    expect(moduleData.has(modulePath)).toBe(true);
    // The transformer and the resolver see the bare virtual path, so that
    // extension checks and relative resolution behave as for a file there.
    expect(params.transform).toHaveBeenCalledWith(virtualPath, {
      type: 'buffer',
      source,
      sha1,
    });
    expect(resolveFromVirtual).toHaveBeenCalledWith(
      virtualPath,
      expect.anything(),
    );
  });

  test('returns errors thrown by the transformer', async () => {
    transformDeps.set(p('/bar'), [makeTransformDep('bad')]);
    const result = await buildSubgraph(
      new Set([p('/bundle')]),
      new Map(),
      params,
    );
    expect([...result.errors]).toEqual([[p('/bad'), new BadTransformError()]]);
  });

  test('returns errors thrown by the resolver', async () => {
    transformDeps.set(p('/bar'), [makeTransformDep('does-not-exist')]);
    const result = await buildSubgraph(
      new Set([p('/bundle')]),
      new Map(),
      params,
    );
    expect([...result.errors]).toEqual([[p('/bar'), new DoesNotExistError()]]);
  });
});
