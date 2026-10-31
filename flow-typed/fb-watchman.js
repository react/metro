/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 * @format
 * @oncall react_native
 */

declare module 'fb-watchman' {
  declare type WatchmanBaseResponse = Readonly<{
    version: string,
    clock: string,
  }>;

  declare type WatchmanClockResponse = Readonly<{
    ...WatchmanBaseResponse,
    warning?: string,
  }>;

  declare type WatchmanSubscribeResponse = Readonly<{
    ...WatchmanBaseResponse,
    subscribe: string,
    warning?: string,
    'asserted-states'?: ReadonlyArray<string>,
  }>;

  declare type WatchmanWatchResponse = Readonly<{
    ...WatchmanBaseResponse,
    watch: string,
    watcher: string,
    relative_path: string,
    warning?: string,
  }>;

  declare type WatchmanWatchListResponse = Readonly<{
    ...WatchmanBaseResponse,
    roots: ReadonlyArray<string>,
  }>;

  declare type WatchmanSubscriptionEvent = {
    subscription: string,
    is_fresh_instance: boolean,
    files: ReadonlyArray<WatchmanFileChange>,
    // Set on a unilateral event when the watch ends, e.g. when its root is
    // deleted.
    canceled?: boolean,
    'state-enter'?: ?string,
    'state-leave'?: ?string,
    clock?: Readonly<{
      scm: {
        'mergebase-with'?: string,
        mergebase?: string,
      },
      clock: string,
    }>,
  };

  declare type WatchmanLogEvent = unknown;

  declare type SavedStateInfo = Readonly<{
    'manifold-path': ?string,
    'manifold-bucket': ?string,
    error: ?string,
  }>;

  declare type WatchmanFileType =
    | 'b' // block special file
    | 'c' // character special file
    | 'd' // directory
    | 'f' // regular file
    | 'l' // symbolic link
    | 'p' // named pipe (fifo)
    | 's' // socket
    | 'D' // Solaris Door
    | '?'; // An unknown file type

  declare type WatchmanFile = Readonly<{
    name: string,
    exists: boolean,
    dev?: number,
    cclock?: string,
    gid?: number,
    ino?: number,
    type?: WatchmanFileType,
    mode?: number,
    mtime_ms?: number | Readonly<{toNumber: () => number}>,
    mtime?: number,
    mtime_us?: number,
    mtime_ns?: number,
    mtime_f?: number,
    new?: boolean,
    nlink?: number,
    size?: number,
    uid?: number,
    'content.sha1hex'?: string,
    symlink_target?: string,
  }>;

  declare type WatchmanFileChange = Readonly<{
    ...WatchmanFile,
    new: boolean,
  }>;

  declare type WatchmanQueryResponse = Readonly<{
    'saved-state-info'?: SavedStateInfo,
    files: ReadonlyArray<WatchmanFile>,
    clock: {
      scm: {'mergebase-with': string, mergebase: string},
      clock: string,
    },
    is_fresh_instance: boolean,
    version: string,
    warning?: string,
  }>;

  declare type WatchmanDirnameExpression = ['dirname' | 'idirname', string];

  declare type WatchmanMatchExpression =
    | ['match' | 'imatch', string]
    | ['match' | 'imatch', string, 'basename' | 'wholename']
    | [
        'match' | 'imatch',
        string,
        'basename' | 'wholename',
        Readonly<{includedotfiles?: boolean, noescape?: boolean}>,
      ];

  declare type WatchmanNotExpression = ['not', WatchmanExpression];

  declare type WatchmanSuffixExpression = [
    'suffix',
    string | ReadonlyArray<string>,
  ];
  declare type WatchmanNameExpression =
    | ['name' | 'iname', string | ReadonlyArray<string>]
    | [
        'name' | 'iname',
        string | ReadonlyArray<string>,
        'basename' | 'wholename',
      ];

  declare type WatchmanTypeExpression = ['type', WatchmanFileType];

  // Would be ['allof' | 'anyof', ...WatchmanExpression] if Flow supported
  // variadic tuples
  declare type WatchmanVariadicExpression = Array<
    'allof' | 'anyof' | WatchmanExpression,
  >;

  declare type WatchmanExpression =
    | WatchmanDirnameExpression
    | WatchmanMatchExpression
    | WatchmanNotExpression
    | WatchmanNameExpression
    | WatchmanSuffixExpression
    | WatchmanTypeExpression
    | WatchmanVariadicExpression;

  declare type WatchmanQuerySince =
    | string
    | Readonly<{
        clock?: string,
        scm: Readonly<{
          'mergebase-with': string,
          'saved-state'?: {
            storage: string,
            config: {project: string, ...},
          },
        }>,
      }>;

  declare type WatchmanQuery = {
    defer?: ReadonlyArray<string>,
    expression?: WatchmanExpression,
    fields: ReadonlyArray<string>,
    glob?: ReadonlyArray<string>,
    glob_includedotfiles?: boolean,
    path?: ReadonlyArray<string>,
    // A repo-root-relative path to a subdirectory within which
    // the query will be constrained.  Returned file names in
    // WatchmanFile will be relative to this location.
    relative_root?: string,
    since?: WatchmanQuerySince,
    suffix?: string | ReadonlyArray<string>,
  };

  declare class Client {
    capabilityCheck(
      config: Readonly<{
        optional?: ReadonlyArray<string>,
        required?: ReadonlyArray<string>,
      }>,
      callback: (
        error: ?Error,
        response: ?{
          version: string,
          capabilities: Readonly<{[string]: boolean}>,
        },
      ) => void,
    ): void;
    command(
      config: ['watch-project', string],
      callback: (
        error: ?Error,
        response: WatchmanWatchResponse,
      ) => void | Promise<void>,
    ): void;
    command(
      config: ['watch-list'],
      callback: (error: ?Error, response: WatchmanWatchListResponse) => void,
    ): void;
    command(
      config: ['query', string, WatchmanQuery],
      callback: (error: ?Error, response: WatchmanQueryResponse) => void,
    ): void;
    command(
      config: ['find', string, string],
      callback: (error: ?Error, response: WatchmanQueryResponse) => void,
    ): void;
    command(
      config: ['clock', string],
      callback: (error: ?Error, response: WatchmanClockResponse) => void,
    ): void;
    command(
      config: ['subscribe', string, string, WatchmanQuery],
      callback: (error: ?Error, response: WatchmanSubscribeResponse) => void,
    ): void;
    command(
      config: ['state-enter', string, string],
      callback: (error: ?Error, response: WatchmanBaseResponse) => void,
    ): void;
    command(
      config: ['state-leave', string, string],
      callback: (error: ?Error, response: WatchmanBaseResponse) => void,
    ): void;
    end(): void;

    on('connect', () => void): void;
    on('end', () => void): void;
    on('error', (error: Error) => void): void;
    on('subscription', (event: WatchmanSubscriptionEvent) => void): void;
    on('log', (event: WatchmanLogEvent) => void): void;
    removeAllListeners: (eventName?: string) => void;
  }

  declare module.exports: {Client: Class<Client>};
}
