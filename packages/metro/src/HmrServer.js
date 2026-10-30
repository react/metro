/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

import type {
  RevisionId,
  default as IncrementalBundler,
} from './IncrementalBundler';
import type {GraphOptions} from './shared/types';
import type {ConfigT, RootPerfLogger} from 'metro-config';
import type {
  HmrClientMessage,
  HmrErrorMessage,
  HmrMessage,
  HmrUpdateMessage,
} from 'metro-runtime/src/modules/types';

import hmrJSBundle from './DeltaBundler/Serializers/hmrJSBundle';
import GraphNotFoundError from './IncrementalBundler/GraphNotFoundError';
import RevisionNotFoundError from './IncrementalBundler/RevisionNotFoundError';
import debounceAsyncQueue from './lib/debounceAsyncQueue';
import formatBundlingError from './lib/formatBundlingError';
import getGraphId from './lib/getGraphId';
import parseBundleOptionsFromBundleRequestUrl from './lib/parseBundleOptionsFromBundleRequestUrl';
import RootUrlMap from './lib/RootUrlMap';
import splitBundleOptions from './lib/splitBundleOptions';
import * as transformHelpers from './lib/transformHelpers';
import debugModule from 'debug';
import {Logger} from 'metro-core';
import nullthrows from 'nullthrows';

const debug = debugModule('Metro:HMR');

const {createActionStartEntry, createActionEndEntry, log} = Logger;

export type Client = {
  optedIntoHMR: boolean,
  revisionIds: Array<RevisionId>,
  readonly sendFn: string => void,
};

type ClientGroup = {
  readonly clients: Set<Client>,
  clientUrl: URL,
  revisionId: RevisionId,
  readonly unlisten: () => void,
  readonly graphOptions: GraphOptions,
};

function send(sendFns: Array<(string) => void>, message: HmrMessage): void {
  const strMessage = JSON.stringify(message);
  sendFns.forEach((sendFn: string => void) => sendFn(strMessage));
}

/**
 * The HmrServer (Hot Module Reloading) implements a lightweight interface
 * to communicate easily to the logic in the React Native repository (which
 * is the one that handles the Web Socket connections).
 *
 * This interface allows the HmrServer to hook its own logic to WS clients
 * getting connected, disconnected or having errors (through the
 * `onClientConnect`, `onClientDisconnect` and `onClientError` methods).
 */
export default class HmrServer<TClient extends Client> {
  _config: ConfigT;
  _bundler: IncrementalBundler;
  _createModuleId: (path: string) => number;
  _clientGroups: Map<RevisionId, ClientGroup>;
  _rootUrlMap: RootUrlMap;

  constructor(
    bundler: IncrementalBundler,
    createModuleId: (path: string) => number,
    config: ConfigT,
  ) {
    this._config = config;
    this._bundler = bundler;
    this._createModuleId = createModuleId;
    this._clientGroups = new Map();
    this._rootUrlMap = new RootUrlMap(config, () =>
      bundler.getBundler().getDynamicRoots(),
    );
  }

  onClientConnect: (
    requestUrl: string,
    sendFn: (data: string) => void,
  ) => Promise<Client> = async (requestUrl, sendFn) => {
    return {
      sendFn,
      revisionIds: [],
      optedIntoHMR: false,
    };
  };

  async _registerEntryPoint(
    client: Client,
    originalRequestUrl: string,
    sendFn: (data: string) => void,
  ): Promise<void> {
    debug('Registering entry point: %s', originalRequestUrl);
    const requestUrl =
      this._config.server.rewriteRequestUrl(originalRequestUrl);
    debug('Rewritten as: %s', requestUrl);

    const {bundleType: _bundleType, ...options} =
      parseBundleOptionsFromBundleRequestUrl(
        requestUrl,
        new Set(this._config.resolver.platforms),
      );
    const {entryFile, resolverOptions, transformOptions, graphOptions} =
      splitBundleOptions(options);

    /**
     * `entryFile` is relative to projectRoot, we need to use resolution function
     * to find the appropriate file with supported extensions.
     */
    const resolutionFn = await transformHelpers.getResolveDependencyFn(
      this._bundler.getBundler(),
      transformOptions.platform,
      resolverOptions,
    );
    const absolutePath =
      this._rootUrlMap.filePathOfUrlDecodedPathname(entryFile);
    const rootDir = absolutePath != null ? '/' : this._rootUrlMap.serverRootDir;
    const resolvedEntryFile = absolutePath ?? entryFile;
    const resolvedEntryFilePath = resolutionFn(rootDir + '/.', {
      name: resolvedEntryFile,
      data: {
        key: resolvedEntryFile,
        asyncType: null,
        isESMImport: false,
        locs: [],
      },
    }).filePath;
    const graphId = getGraphId(resolvedEntryFilePath, transformOptions, {
      resolverOptions,
      shallow: graphOptions.shallow,
      lazy: graphOptions.lazy,
      unstable_allowRequireContext:
        this._config.transformer.unstable_allowRequireContext,
    });
    const revPromise = this._bundler.getRevisionByGraphId(graphId);
    if (!revPromise) {
      send([sendFn], {
        type: 'error',
        body: formatBundlingError(new GraphNotFoundError(graphId)),
      });
      return;
    }

    const {graph, id} = await revPromise;
    client.revisionIds.push(id);

    let clientGroup: ?ClientGroup = this._clientGroups.get(id);
    if (clientGroup != null) {
      clientGroup.clients.add(client);
    } else {
      const clientUrl = new URL(requestUrl);

      // Prepare the clientUrl to be used as sourceUrl in HMR updates.
      clientUrl.protocol = 'http';

      const clientQuery = clientUrl.searchParams;
      clientQuery.delete('bundleEntry');
      clientQuery.set('dev', clientQuery.get('dev') || 'true');
      clientQuery.set('minify', clientQuery.get('minify') || 'false');
      clientQuery.set('modulesOnly', 'true');
      clientQuery.set('runModule', clientQuery.get('runModule') || 'false');
      clientQuery.set('shallow', 'true');

      clientGroup = {
        clients: new Set([client]),
        clientUrl: new URL(clientUrl),
        revisionId: id,
        graphOptions,
        unlisten: (): void => unlisten(),
      };

      this._clientGroups.set(id, clientGroup);

      let latestChangeEvent: ?{
        readonly logger: ?RootPerfLogger,
        readonly changeId: string,
      } = null;

      const debounceCallHandleFileChange = debounceAsyncQueue(async () => {
        await this._handleFileChange(
          nullthrows(clientGroup),
          {isInitialUpdate: false},
          latestChangeEvent,
        );
      }, 50);

      const unlisten = this._bundler
        .getDeltaBundler()
        .listen(graph, async changeEvent => {
          latestChangeEvent = changeEvent;
          await debounceCallHandleFileChange();
        });
    }

    await this._handleFileChange(clientGroup, {isInitialUpdate: true});
    send([sendFn], {type: 'bundle-registered'});
  }

  onClientMessage: (
    client: TClient,
    message: string | Buffer | ArrayBuffer | Array<Buffer>,
    sendFn: (data: string) => void,
  ) => Promise<void> = async (client, message, sendFn) => {
    let data: HmrClientMessage;
    try {
      data = JSON.parse(String(message));
    } catch (error) {
      send([sendFn], {
        type: 'error',
        body: formatBundlingError(error),
      });
      return Promise.resolve();
    }
    if (data && data.type) {
      switch (data.type) {
        case 'register-entrypoints':
          return Promise.all(
            data.entryPoints.map(entryPoint =>
              this._registerEntryPoint(client, entryPoint, sendFn),
            ),
          );
        case 'log':
          if (this._config.server.forwardClientLogs) {
            this._config.reporter.update({
              type: 'client_log',
              level: data.level,
              data: data.data,
              mode: data.mode,
            });
          }
          break;
        case 'log-opt-in':
          client.optedIntoHMR = true;
          break;
        case 'heartbeat':
          debug('Heartbeat received');
          sendFn(String(message));
          break;
        default:
          break;
      }
    }
    return Promise.resolve();
  };

  onClientError: (client: TClient, e: Error) => void = (client, e) => {
    this._config.reporter.update({
      type: 'hmr_client_error',
      error: e,
    });
    this.onClientDisconnect(client);
  };

  onClientDisconnect: (client: TClient) => void = client => {
    client.revisionIds.forEach(revisionId => {
      const group = this._clientGroups.get(revisionId);
      if (group != null) {
        group.clients.delete(client);
        if (group.clients.size === 0) {
          this._clientGroups.delete(revisionId);
          group.unlisten();
        }
      }
    });
  };

  async _handleFileChange(
    group: ClientGroup,
    options: {isInitialUpdate: boolean},
    changeEvent: ?{
      readonly logger: ?RootPerfLogger,
      readonly changeId?: string,
    },
  ): Promise<void> {
    const logger = !options.isInitialUpdate ? changeEvent?.logger : null;
    if (logger) {
      logger.point('fileChange_end');
      logger.point('hmrPrepareAndSendMessage_start');
    }

    const optedIntoHMR = [...group.clients].some(
      (client: Client) => client.optedIntoHMR,
    );
    const processingHmrChange = log(
      createActionStartEntry({
        // Even when HMR is disabled on the client, this function still
        // runs so we can stash updates while it's off and apply them later.
        // However, this would mess up our internal analytics because we track
        // HMR as being used even for people who have it disabled.
        // As a workaround, we use a different event name for clients
        // that didn't explicitly opt into HMR.
        action_name: optedIntoHMR
          ? 'Processing HMR change'
          : 'Processing HMR change (no client opt-in)',
      }),
    );

    const sendFns = [...group.clients].map((client: Client) => client.sendFn);

    send(sendFns, {
      type: 'update-start',
      body: options,
    });

    const message = await this._prepareMessage(group, options, changeEvent);
    send(sendFns, message);
    send(sendFns, {
      type: 'update-done',
      body: {changeId: changeEvent?.changeId},
    });

    log({
      ...createActionEndEntry(processingHmrChange),
      outdated_modules:
        message.type === 'update'
          ? message.body.added.length + message.body.modified.length
          : undefined,
    });

    if (logger) {
      logger.point('hmrPrepareAndSendMessage_end');
      logger.end('SUCCESS');
    }
  }

  async _prepareMessage(
    group: ClientGroup,
    options: {isInitialUpdate: boolean},
    changeEvent: ?{
      readonly logger: ?RootPerfLogger,
      readonly changeId?: string,
    },
  ): Promise<HmrUpdateMessage | HmrErrorMessage> {
    const logger = !options.isInitialUpdate ? changeEvent?.logger : null;
    try {
      const revPromise = this._bundler.getRevision(group.revisionId);
      if (!revPromise) {
        return {
          type: 'error',
          body: formatBundlingError(
            new RevisionNotFoundError(group.revisionId),
          ),
        };
      }

      logger?.point('updateGraph_start');

      const {revision, delta} = await this._bundler.updateGraph(
        await revPromise,
        false,
      );

      logger?.point('updateGraph_end');

      const previousRevisionId = group.revisionId;
      group.revisionId = revision.id;
      for (const client of group.clients) {
        client.revisionIds = client.revisionIds.filter(
          revisionId => revisionId !== previousRevisionId,
        );
        client.revisionIds.push(revision.id);
      }
      // If the group's last client disconnected while this update was in
      // progress, the group is no longer listening for changes. Don't make it
      // discoverable again, and don't disturb any new group that has since
      // been registered under the previous revision.
      if (this._clientGroups.get(previousRevisionId) === group) {
        this._clientGroups.delete(previousRevisionId);
        this._clientGroups.set(revision.id, group);
      }

      logger?.point('serialize_start');

      const hmrUpdate = hmrJSBundle(delta, revision.graph, {
        clientUrl: new URL(group.clientUrl),
        createModuleId: this._createModuleId,
        includeAsyncPaths: group.graphOptions.lazy,
        projectRoot: this._config.projectRoot,
        serverRoot: this._rootUrlMap.serverRootDir,
      });

      logger?.point('serialize_end');

      return {
        type: 'update',
        body: {
          revisionId: revision.id,
          isInitialUpdate: options.isInitialUpdate,
          ...hmrUpdate,
        },
      };
    } catch (error) {
      const formattedError = formatBundlingError(error);

      this._config.reporter.update({type: 'bundling_error', error});

      return {type: 'error', body: formattedError};
    }
  }
}
