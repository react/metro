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
  Graph,
  // eslint-disable-next-line no-unused-vars
  MixedOutput,
  Options,
  ReadOnlyGraph,
} from './DeltaBundler/types';
import type EventEmitter from 'node:events';

import DeltaCalculator from './DeltaBundler/DeltaCalculator';

export type {
  DeltaResult,
  Graph,
  Dependencies,
  MixedOutput,
  Module,
  ReadOnlyGraph,
  TransformFn,
  TransformResult,
  TransformResultDependency,
  TransformResultWithSource,
} from './DeltaBundler/types';

/**
 * `DeltaBundler` uses the `DeltaTransformer` to build bundle deltas. This
 * module handles all the transformer instances so it can support multiple
 * concurrent clients requesting their own deltas. This is done through the
 * `clientId` param (which maps a client to a specific delta transformer).
 */
export default class DeltaBundler<T = MixedOutput> {
  _changeEventSource: EventEmitter;
  _deltaCalculators: Map<Graph<T>, DeltaCalculator<T>> = new Map();

  constructor(changeEventSource: EventEmitter) {
    this._changeEventSource = changeEventSource;
  }

  end(): void {
    this._deltaCalculators.forEach((deltaCalculator: DeltaCalculator<T>) =>
      deltaCalculator.end(),
    );
    this._deltaCalculators = new Map();
  }

  async getDependencies(
    entryPoints: ReadonlyArray<string>,
    options: Options<T>,
  ): Promise<ReadOnlyGraph<T>['dependencies']> {
    const deltaCalculator = new DeltaCalculator(
      new Set(entryPoints),
      this._changeEventSource,
      options,
    );

    await deltaCalculator.getDelta({reset: true, shallow: options.shallow});
    const graph = deltaCalculator.getGraph();

    deltaCalculator.end();
    return graph.dependencies;
  }

  // Note: the graph returned by this function needs to be ended when finished
  // so that we don't leak graphs that are not reachable.
  // To get just the dependencies, use getDependencies which will not leak graphs.
  async buildGraph(
    entryPoints: ReadonlyArray<string>,
    options: Options<T>,
  ): Promise<Graph<T>> {
    const deltaCalculator = new DeltaCalculator(
      new Set(entryPoints),
      this._changeEventSource,
      options,
    );

    await deltaCalculator.getDelta({reset: true, shallow: options.shallow});
    const graph = deltaCalculator.getGraph();

    this._deltaCalculators.set(graph, deltaCalculator);
    return graph;
  }

  async getDelta(
    graph: Graph<T>,
    {
      reset,
      shallow,
    }: {
      reset: boolean,
      shallow: boolean,
      ...
    },
  ): Promise<DeltaResult<T>> {
    const deltaCalculator = this._deltaCalculators.get(graph);

    if (!deltaCalculator) {
      throw new Error('Graph not found');
    }

    return await deltaCalculator.getDelta({reset, shallow});
  }

  listen(graph: Graph<T>, callback: () => Promise<void>): () => void {
    const deltaCalculator = this._deltaCalculators.get(graph);

    if (!deltaCalculator) {
      throw new Error('Graph not found');
    }

    deltaCalculator.on('change', callback);

    return () => {
      deltaCalculator.removeListener('change', callback);
    };
  }

  endGraph(graph: Graph<T>): void {
    const deltaCalculator = this._deltaCalculators.get(graph);

    if (!deltaCalculator) {
      throw new Error('Graph not found');
    }

    deltaCalculator.end();

    this._deltaCalculators.delete(graph);
  }
}
