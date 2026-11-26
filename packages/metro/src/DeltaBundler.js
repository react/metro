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
  ReleasedModules,
  TransformFn,
} from './DeltaBundler/types';
import type EventEmitter from 'node:events';

import DeltaCalculator from './DeltaBundler/DeltaCalculator';
import {deriveVirtualModulePath, getModuleSourcePath} from './lib/modulePath';
import debugModule from 'debug';

const debug = debugModule('Metro:DeltaBundler');

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
export type DeltaBundlerOptions<T> = Readonly<{
  // Called after a graph releases modules or ends, with the outputs that live
  // graphs still hold at the released paths. A graph releases the modules that
  // its failed updates transformed once it commits an update or ends.
  onModulesReleased?: ?(released: ReleasedModules<T>) => void,
}>;

export default class DeltaBundler<T = MixedOutput> {
  _changeEventSource: EventEmitter;
  _deltaCalculators: Map<Graph<T>, DeltaCalculator<T>> = new Map();
  readonly #onModulesReleased: ?(released: ReleasedModules<T>) => void;
  // The paths each live graph has transformed since it last committed an
  // update, recorded only if `onModulesReleased` is set.
  #transformedPaths: Map<Graph<T>, Set<string>> = new Map();

  constructor(
    changeEventSource: EventEmitter,
    options?: DeltaBundlerOptions<T>,
  ) {
    this._changeEventSource = changeEventSource;
    this.#onModulesReleased = options?.onModulesReleased;
  }

  end(): void {
    this._deltaCalculators.forEach((deltaCalculator: DeltaCalculator<T>) =>
      deltaCalculator.end(),
    );
    this._deltaCalculators = new Map();
    this.#transformedPaths = new Map();
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

    try {
      await deltaCalculator.getDelta({reset: true, shallow: options.shallow});
      return deltaCalculator.getGraph().dependencies;
    } finally {
      deltaCalculator.end();
    }
  }

  // Note: the graph returned by this function needs to be ended when finished
  // so that we don't leak graphs that are not reachable.
  // To get just the dependencies, use getDependencies which will not leak graphs.
  async buildGraph(
    entryPoints: ReadonlyArray<string>,
    options: Options<T>,
  ): Promise<Graph<T>> {
    const transformedPaths = new Set<string>();
    const recordingTransform: TransformFn<T> = (modulePath, virtualSource) => {
      // Record the graph path, which for a virtual module is namespaced.
      transformedPaths.add(
        virtualSource?.type === 'buffer'
          ? deriveVirtualModulePath(modulePath)
          : modulePath,
      );
      return options.transform(modulePath, virtualSource);
    };
    const deltaCalculator = new DeltaCalculator(
      new Set(entryPoints),
      this._changeEventSource,
      this.#onModulesReleased == null
        ? options
        : {...options, transform: recordingTransform},
    );

    try {
      await deltaCalculator.getDelta({reset: true, shallow: options.shallow});
    } catch (error) {
      // A graph whose first build fails is never returned, so nothing else
      // can end it: its calculator would keep listening for file changes and
      // hold its partial graph for the life of the server, once per failed
      // build. What the build transformed stays shared for its retries.
      deltaCalculator.end();
      throw error;
    }
    const graph = deltaCalculator.getGraph();

    this._deltaCalculators.set(graph, deltaCalculator);
    if (this.#onModulesReleased != null) {
      // The graph holds every module that its first build transformed.
      transformedPaths.clear();
      this.#transformedPaths.set(graph, transformedPaths);
    }
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

    // A failed update throws here and releases nothing, so what it transformed
    // stays shared until the graph commits an update or ends.
    const delta = await deltaCalculator.getDelta({reset, shallow});
    const uncommittedPaths = this.#takeUncommittedPaths(graph).filter(
      modulePath => !delta.deleted.has(modulePath),
    );
    if (delta.reset) {
      // A reset delta doesn't say which modules the build released.
      this.#notifyModulesReleased(null);
    } else if (delta.deleted.size > 0 || uncommittedPaths.length > 0) {
      this.#notifyModulesReleased([...delta.deleted, ...uncommittedPaths]);
    }
    return delta;
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
    const uncommittedPaths = this.#takeUncommittedPaths(graph);
    this.#transformedPaths.delete(graph);
    this.#notifyModulesReleased([
      ...graph.dependencies.keys(),
      ...uncommittedPaths,
    ]);
  }

  // Returns the paths that `graph` has transformed since it last committed an
  // update and doesn't hold, such as what its failed updates transformed, and
  // starts recording afresh.
  #takeUncommittedPaths(graph: Graph<T>): Array<string> {
    const transformedPaths = this.#transformedPaths.get(graph);
    if (transformedPaths == null || transformedPaths.size === 0) {
      return [];
    }
    const uncommittedPaths = Array.from(transformedPaths).filter(
      modulePath => !graph.dependencies.has(modulePath),
    );
    transformedPaths.clear();
    return uncommittedPaths;
  }

  // Collects the outputs that live graphs hold at `paths`, or anywhere if
  // `paths` is null, so the cost scales with what was released rather than
  // with the size of every graph.
  #notifyModulesReleased(paths: ?ReadonlyArray<string>): void {
    const onModulesReleased = this.#onModulesReleased;
    if (onModulesReleased == null) {
      return;
    }
    const start = performance.now();
    const heldOutputs = new Set<ReadonlyArray<T>>();
    for (const graph of this._deltaCalculators.keys()) {
      if (paths == null) {
        for (const module of graph.dependencies.values()) {
          heldOutputs.add(module.output);
        }
      } else {
        for (const path of paths) {
          const module = graph.dependencies.get(path);
          if (module != null) {
            heldOutputs.add(module.output);
          }
        }
      }
    }
    onModulesReleased({
      // A module is transformed as its source path, which differs from its
      // graph path for a virtual module.
      paths: paths == null ? null : paths.map(getModuleSourcePath),
      heldOutputs,
    });
    debug(
      'Released %s modules, %d outputs still held, in %dms',
      paths?.length ?? 'all',
      heldOutputs.size,
      Math.round(performance.now() - start),
    );
  }
}
