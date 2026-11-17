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

import type {
  DeltaResult,
  MixedOutput,
  Options,
  TransformResultDependency,
} from '../types';

import DeltaBundler from '../../DeltaBundler';
import DeltaCalculator from '../DeltaCalculator';

const {EventEmitter} = require('node:events');

jest.mock('../DeltaCalculator');

describe('DeltaBundler', () => {
  let deltaBundler;

  const mockGraph = {
    dependencies: new Map([
      ['/entry', {code: 'entry'}],
      ['/foo', {code: 'foo'}],
    ]),
    entryPoints: ['/entry'],
  };

  const options: Options<MixedOutput> = {
    unstable_allowRequireContext: false,
    unstable_enablePackageExports: false,
    unstable_incrementalResolution: false,
    lazy: false,
    onProgress: null,
    resolve: (from: string, dependency: TransformResultDependency) => {
      throw new Error('Never called');
    },
    shallow: false,
    transform: (modulePath: string) => {
      throw new Error('Never called');
    },
    transformOptions: {
      // NOTE: These options are ignored because we mock out the transformer (via DeltaCalculator).
      dev: false,
      minify: false,
      platform: null,
      type: 'module',
      unstable_transformProfile: 'default',
    },
  };

  beforeEach(async () => {
    const fileEmitter = new EventEmitter();
    deltaBundler = new DeltaBundler(fileEmitter);

    DeltaCalculator.prototype.getDelta.mockImplementation(async ({reset}) =>
      Promise.resolve({
        modified: reset ? mockGraph.dependencies : new Map(),
        deleted: new Set(),
        reset,
      }),
    );

    DeltaCalculator.prototype.getGraph.mockReturnValue(mockGraph);
  });

  test('should create a new graph when buildGraph gets called', async () => {
    expect(
      await deltaBundler.buildGraph(mockGraph.entryPoints, options),
    ).toEqual(mockGraph);

    expect(DeltaCalculator.prototype.getDelta.mock.calls[0][0]).toEqual({
      reset: true,
      shallow: false,
    });
  });

  test('should get a delta when getDelta gets called', async () => {
    const graph = await deltaBundler.buildGraph(mockGraph.entryPoints, options);

    expect(
      await deltaBundler.getDelta(graph, {reset: false, shallow: false}),
    ).toEqual({
      modified: new Map(),
      deleted: new Set(),
      reset: false,
    });
  });

  test('should get a reset delta when calling getDelta({reset: true, shallow: false})', async () => {
    const graph = await deltaBundler.buildGraph(mockGraph.entryPoints, options);

    expect(
      await deltaBundler.getDelta(graph, {reset: true, shallow: false}),
    ).toEqual({
      modified: graph.dependencies,
      deleted: new Set(),
      reset: true,
    });
  });

  test('should throw an error when trying to get the delta of a graph that does not exist', async () => {
    const graph = await deltaBundler.buildGraph(mockGraph.entryPoints, options);

    deltaBundler.endGraph(graph);

    await expect(
      deltaBundler.getDelta(graph, {reset: false, shallow: false}),
    ).rejects.toBeInstanceOf(Error);
  });

  test('should throw an error when trying to end a graph twice', async () => {
    const graph = await deltaBundler.buildGraph(mockGraph.entryPoints, options);

    deltaBundler.endGraph(graph);

    expect(() => deltaBundler.endGraph(graph)).toThrow();
  });

  describe('onModulesReleased', () => {
    const outputA = [{type: 'js/module', data: {}}];
    const sharedOutputInA = [{type: 'js/module', data: {}}];
    const outputB = [{type: 'js/module', data: {}}];
    const sharedOutputInB = [{type: 'js/module', data: {}}];
    const graphA = {
      dependencies: new Map([
        ['/a', {output: outputA}],
        ['/shared', {output: sharedOutputInA}],
      ]),
      entryPoints: ['/a'],
    };
    const graphB = {
      dependencies: new Map([
        ['/b', {output: outputB}],
        ['/shared', {output: sharedOutputInB}],
      ]),
      entryPoints: ['/b'],
    };
    let onModulesReleased;

    beforeEach(() => {
      onModulesReleased = jest.fn();
      deltaBundler = new DeltaBundler(new EventEmitter(), {onModulesReleased});
    });

    async function buildGraphs() {
      DeltaCalculator.prototype.getGraph
        .mockReturnValueOnce(graphA)
        .mockReturnValueOnce(graphB);
      const transformingOptions = {...options, transform: jest.fn()};
      return [
        await deltaBundler.buildGraph(graphA.entryPoints, transformingOptions),
        await deltaBundler.buildGraph(graphB.entryPoints, transformingOptions),
      ];
    }

    // Fails the next update of the graph built last, after it transforms
    // `paths`.
    function failNextUpdate(paths: ReadonlyArray<string>) {
      const {transform} = jest
        .requireMock('../DeltaCalculator')
        .default.mock.calls.at(-1)[2];
      DeltaCalculator.prototype.getDelta.mockImplementationOnce(async () => {
        await Promise.all(paths.map(modulePath => transform(modulePath, null)));
        throw new Error('Update failed');
      });
    }

    const emptyDelta: DeltaResult<MixedOutput> = {
      added: new Map(),
      modified: new Map(),
      deleted: new Set(),
      reset: false,
    };

    function releasedArgs() {
      expect(onModulesReleased).toHaveBeenCalledTimes(1);
      const [{paths, heldOutputs}] = onModulesReleased.mock.calls[0];
      return {paths, heldOutputs: [...heldOutputs]};
    }

    test("is called with the ended graph's paths and what other graphs hold there", async () => {
      const [a] = await buildGraphs();
      expect(onModulesReleased).not.toHaveBeenCalled();

      deltaBundler.endGraph(a);

      const {paths, heldOutputs} = releasedArgs();
      expect(paths).toEqual(['/a', '/shared']);
      expect(heldOutputs).toHaveLength(1);
      expect(heldOutputs[0]).toBe(sharedOutputInB);
    });

    test('is called with the source paths of released virtual modules', async () => {
      const virtualOutputInA = [{type: 'js/module', data: {}}];
      const virtualOutputInB = [{type: 'js/module', data: {}}];
      const graphWithVirtual = (entry: string, output: typeof outputA) => ({
        dependencies: new Map([
          [entry, {output: [{type: 'js/module', data: {}}]}],
          ['virtual:/v', {output}],
        ]),
        entryPoints: [entry],
      });
      const virtualGraphA = graphWithVirtual('/a', virtualOutputInA);
      const virtualGraphB = graphWithVirtual('/b', virtualOutputInB);
      DeltaCalculator.prototype.getGraph
        .mockReturnValueOnce(virtualGraphA)
        .mockReturnValueOnce(virtualGraphB);
      const a = await deltaBundler.buildGraph(['/a'], options);
      await deltaBundler.buildGraph(['/b'], options);

      deltaBundler.endGraph(a);

      const {paths, heldOutputs} = releasedArgs();
      expect(paths).toEqual(['/a', '/v']);
      expect(heldOutputs).toHaveLength(1);
      expect(heldOutputs[0]).toBe(virtualOutputInB);
    });

    test('is not called after a delta that releases nothing', async () => {
      const [a] = await buildGraphs();
      DeltaCalculator.prototype.getDelta.mockResolvedValueOnce({
        added: new Map(),
        modified: new Map(),
        deleted: new Set(),
        reset: false,
      });

      await deltaBundler.getDelta(a, {reset: false, shallow: false});

      expect(onModulesReleased).not.toHaveBeenCalled();
    });

    test('is called with only the deleted paths after a delta that deletes modules', async () => {
      const [a] = await buildGraphs();
      DeltaCalculator.prototype.getDelta.mockResolvedValueOnce({
        added: new Map(),
        modified: new Map(),
        deleted: new Set(['/shared']),
        reset: false,
      });

      await deltaBundler.getDelta(a, {reset: false, shallow: false});

      const {paths, heldOutputs} = releasedArgs();
      expect(paths).toEqual(['/shared']);
      expect(heldOutputs).toHaveLength(2);
      expect(heldOutputs[0]).toBe(sharedOutputInA);
      expect(heldOutputs[1]).toBe(sharedOutputInB);
    });

    test('is called with what failed updates transformed once the graph commits an update', async () => {
      const [, b] = await buildGraphs();
      failNextUpdate(['/new', '/shared']);

      await expect(
        deltaBundler.getDelta(b, {reset: false, shallow: false}),
      ).rejects.toThrow('Update failed');
      expect(onModulesReleased).not.toHaveBeenCalled();

      DeltaCalculator.prototype.getDelta.mockResolvedValueOnce(emptyDelta);
      await deltaBundler.getDelta(b, {reset: false, shallow: false});

      // The graph holds `/shared`, so only `/new` is released.
      const {paths, heldOutputs} = releasedArgs();
      expect(paths).toEqual(['/new']);
      expect(heldOutputs).toHaveLength(0);

      // It's released once.
      onModulesReleased.mockClear();
      DeltaCalculator.prototype.getDelta.mockResolvedValueOnce(emptyDelta);
      await deltaBundler.getDelta(b, {reset: false, shallow: false});
      expect(onModulesReleased).not.toHaveBeenCalled();
    });

    test('is called with what failed updates transformed when the graph ends', async () => {
      const [, b] = await buildGraphs();
      failNextUpdate(['/new']);
      await expect(
        deltaBundler.getDelta(b, {reset: false, shallow: false}),
      ).rejects.toThrow('Update failed');

      deltaBundler.endGraph(b);

      expect(releasedArgs().paths).toEqual(['/b', '/shared', '/new']);
    });

    test('is called with every held output after a reset delta', async () => {
      const [a] = await buildGraphs();
      DeltaCalculator.prototype.getDelta.mockResolvedValueOnce({
        added: graphA.dependencies,
        modified: new Map(),
        deleted: new Set(),
        reset: true,
      });

      await deltaBundler.getDelta(a, {reset: true, shallow: false});

      const {paths, heldOutputs} = releasedArgs();
      expect(paths).toBeNull();
      expect(new Set(heldOutputs)).toEqual(
        new Set([outputA, sharedOutputInA, outputB, sharedOutputInB]),
      );
      expect(heldOutputs).toHaveLength(4);
    });
  });
});
