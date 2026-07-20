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

import type {DeltaResult, Graph, MixedOutput, Module} from './DeltaBundler';
import type {
  Options as DeltaBundlerOptions,
  ReadOnlyDependencies,
  TransformInputOptions,
} from './DeltaBundler/types';
import type {GraphId} from './lib/getGraphId';
import type {ResolverInputOptions} from './shared/types';
import type {ConfigT} from 'metro-config';

import Bundler from './Bundler';
import DeltaBundler from './DeltaBundler';
import ResourceNotFoundError from './IncrementalBundler/ResourceNotFoundError';
import getGraphId from './lib/getGraphId';
import getPrependedScripts from './lib/getPrependedScripts';
import * as transformHelpers from './lib/transformHelpers';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export opaque type RevisionId: string = string;

export type OutputGraph = Graph<>;

type OtherOptions = Readonly<{
  onProgress: DeltaBundlerOptions<>['onProgress'],
  shallow: boolean,
  lazy: boolean,
}>;

export type GraphRevision = {
  // Identifies the last computed revision.
  readonly id: RevisionId,
  readonly date: Date,
  readonly graphId: GraphId,
  readonly graph: OutputGraph,
  readonly prepend: ReadonlyArray<Module<>>,
};

export type IncrementalBundlerOptions = Readonly<{
  hasReducedPerformance?: boolean,
  watch?: boolean,
}>;

function createRevisionId(): RevisionId {
  return crypto.randomBytes(8).toString('hex');
}

function revisionIdFromString(str: string): RevisionId {
  return str;
}

export default class IncrementalBundler {
  _config: ConfigT;
  _bundler: Bundler;
  _deltaBundler: DeltaBundler<>;
  _revisionsById: Map<RevisionId, Promise<GraphRevision>> = new Map();
  _revisionsByGraphId: Map<GraphId, Promise<GraphRevision>> = new Map();

  static revisionIdFromString: (str: string) => RevisionId =
    revisionIdFromString;

  constructor(config: ConfigT, options?: IncrementalBundlerOptions) {
    this._config = config;
    this._bundler = new Bundler(config, options);
    this._deltaBundler = new DeltaBundler(this._bundler.getWatcher());
  }

  async end(): Promise<void> {
    this._deltaBundler.end();
    await this._bundler.end();
  }

  getBundler(): Bundler {
    return this._bundler;
  }

  getDeltaBundler(): DeltaBundler<> {
    return this._deltaBundler;
  }

  getRevision(revisionId: RevisionId): ?Promise<GraphRevision> {
    return this._revisionsById.get(revisionId);
  }

  getRevisionByGraphId(graphId: GraphId): ?Promise<GraphRevision> {
    return this._revisionsByGraphId.get(graphId);
  }

  async buildGraphForEntries(
    entryFiles: ReadonlyArray<string>,
    transformOptions: TransformInputOptions,
    resolverOptions: ResolverInputOptions,
    otherOptions?: OtherOptions = {
      onProgress: null,
      shallow: false,
      lazy: false,
    },
  ): Promise<OutputGraph> {
    const absoluteEntryFiles = await this._getAbsoluteEntryFiles(entryFiles);

    const graph = await this._deltaBundler.buildGraph(absoluteEntryFiles, {
      resolve: await transformHelpers.getResolveDependencyFn(
        this._bundler,
        transformOptions.platform,
        resolverOptions,
      ),
      transform: await transformHelpers.getTransformFn(
        absoluteEntryFiles,
        this._bundler,
        this._deltaBundler,
        this._config,
        transformOptions,
        resolverOptions,
      ),
      transformOptions,
      onProgress: otherOptions.onProgress,
      lazy: otherOptions.lazy,
      unstable_allowRequireContext:
        this._config.transformer.unstable_allowRequireContext,
      unstable_enablePackageExports:
        this._config.resolver.unstable_enablePackageExports,
      unstable_incrementalResolution:
        this._config.resolver.unstable_incrementalResolution,
      shallow: otherOptions.shallow,
    });

    this._config.serializer.experimentalSerializerHook(graph, {
      added: graph.dependencies,
      modified: new Map(),
      deleted: new Set(),
      reset: true,
    });

    return graph;
  }

  async getDependencies(
    entryFiles: ReadonlyArray<string>,
    transformOptions: TransformInputOptions,
    resolverOptions: ResolverInputOptions,
    otherOptions?: OtherOptions = {
      onProgress: null,
      shallow: false,
      lazy: false,
    },
  ): Promise<ReadOnlyDependencies<>> {
    const absoluteEntryFiles = await this._getAbsoluteEntryFiles(entryFiles);

    const dependencies = await this._deltaBundler.getDependencies(
      absoluteEntryFiles,
      {
        resolve: await transformHelpers.getResolveDependencyFn(
          this._bundler,
          transformOptions.platform,
          resolverOptions,
        ),
        transform: await transformHelpers.getTransformFn(
          absoluteEntryFiles,
          this._bundler,
          this._deltaBundler,
          this._config,
          transformOptions,
          resolverOptions,
        ),
        transformOptions,
        onProgress: otherOptions.onProgress,
        lazy: otherOptions.lazy,
        unstable_allowRequireContext:
          this._config.transformer.unstable_allowRequireContext,
        unstable_enablePackageExports:
          this._config.resolver.unstable_enablePackageExports,
        unstable_incrementalResolution:
          this._config.resolver.unstable_incrementalResolution,
        shallow: otherOptions.shallow,
      },
    );

    return dependencies;
  }

  async buildGraph(
    entryFile: string,
    transformOptions: TransformInputOptions,
    resolverOptions: ResolverInputOptions,
    otherOptions?: OtherOptions = {
      onProgress: null,
      shallow: false,
      lazy: false,
    },
  ): Promise<{
    readonly graph: OutputGraph,
    readonly prepend: ReadonlyArray<Module<>>,
  }> {
    const graph = await this.buildGraphForEntries(
      [entryFile],
      transformOptions,
      resolverOptions,
      otherOptions,
    );

    const {type: _, ...transformOptionsWithoutType} = transformOptions;

    const prepend = await getPrependedScripts(
      this._config,
      transformOptionsWithoutType,
      resolverOptions,
      this._bundler,
      this._deltaBundler,
    );

    return {
      prepend,
      graph,
    };
  }

  // TODO T34760750 (alexkirsz) Eventually, I'd like to get to a point where
  // this class exposes only initializeGraph and updateGraph.
  async initializeGraph(
    entryFile: string,
    transformOptions: TransformInputOptions,
    resolverOptions: ResolverInputOptions,
    otherOptions?: OtherOptions = {
      onProgress: null,
      shallow: false,
      lazy: false,
    },
  ): Promise<{
    delta: DeltaResult<>,
    revision: GraphRevision,
    ...
  }> {
    const graphId = getGraphId(entryFile, transformOptions, {
      resolverOptions,
      shallow: otherOptions.shallow,
      lazy: otherOptions.lazy,
      unstable_allowRequireContext:
        this._config.transformer.unstable_allowRequireContext,
    });
    const revisionId = createRevisionId();
    const revisionPromise = (async () => {
      const {graph, prepend} = await this.buildGraph(
        entryFile,
        transformOptions,
        resolverOptions,
        otherOptions,
      );
      return {
        id: revisionId,
        date: new Date(),
        graphId,
        graph,
        prepend,
      };
    })();

    this._revisionsById.set(revisionId, revisionPromise);
    this._revisionsByGraphId.set(graphId, revisionPromise);
    try {
      const revision = await revisionPromise;
      const delta = {
        added: revision.graph.dependencies,
        modified: new Map<string, Module<MixedOutput>>(),
        deleted: new Set<string>(),
        reset: true,
      };
      return {
        revision,
        delta,
      };
    } catch (err) {
      // Evict a bad revision from the cache since otherwise
      // we'll keep getting it even after the build is fixed.
      this._revisionsById.delete(revisionId);
      this._revisionsByGraphId.delete(graphId);
      throw err;
    }
  }

  async updateGraph(
    revision: GraphRevision,
    reset: boolean,
  ): Promise<{
    delta: DeltaResult<>,
    revision: GraphRevision,
    ...
  }> {
    const delta = await this._deltaBundler.getDelta(revision.graph, {
      reset,
      shallow: false,
    });

    this._config.serializer.experimentalSerializerHook(revision.graph, delta);

    if (
      delta.added.size > 0 ||
      delta.modified.size > 0 ||
      delta.deleted.size > 0
    ) {
      this._revisionsById.delete(revision.id);
      revision = {
        ...revision,
        // Generate a new revision id, to be used to verify the next incremental
        // request.
        id: crypto.randomBytes(8).toString('hex'),
        date: new Date(),
      };
      const revisionPromise = Promise.resolve(revision);
      this._revisionsById.set(revision.id, revisionPromise);
      this._revisionsByGraphId.set(revision.graphId, revisionPromise);
    }

    return {revision, delta};
  }

  async endGraph(graphId: GraphId): Promise<void> {
    const revPromise = this._revisionsByGraphId.get(graphId);
    if (!revPromise) {
      return;
    }
    const revision = await revPromise;
    this._deltaBundler.endGraph(revision.graph);
    this._revisionsByGraphId.delete(graphId);
    this._revisionsById.delete(revision.id);
  }

  async _getAbsoluteEntryFiles(
    entryFiles: ReadonlyArray<string>,
  ): Promise<ReadonlyArray<string>> {
    const absoluteEntryFiles = entryFiles.map((entryFile: string) =>
      path.resolve(
        this._config.server.unstable_serverRoot ?? this._config.projectRoot,
        entryFile,
      ),
    );

    await Promise.all(
      absoluteEntryFiles.map(
        (entryFile: string) =>
          new Promise((resolve: void => void, reject: unknown => unknown) => {
            // This should throw an error if the file doesn't exist.
            // Using this instead of fs.exists to account for SimLinks.
            fs.realpath(entryFile, err => {
              if (err) {
                reject(new ResourceNotFoundError(entryFile));
              } else {
                resolve();
              }
            });
          }),
      ),
    );

    return absoluteEntryFiles;
  }

  // Wait for the bundler to become ready.
  async ready(): Promise<void> {
    await this._bundler.ready();
  }
}
