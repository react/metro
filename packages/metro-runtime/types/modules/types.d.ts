/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<3ff5e6379d94db2cf24b884dc9b00e3e>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-runtime/src/modules/types.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

export type ModuleMap = ReadonlyArray<[number, string]>;
export type Bundle = {
  readonly modules: ModuleMap;
  readonly post: string;
  readonly pre: string;
};
export type DeltaBundle = {
  readonly added: ModuleMap;
  readonly modified: ModuleMap;
  readonly deleted: ReadonlyArray<number>;
};
export type BundleVariant =
  | Readonly<
      Omit<Bundle, keyof {base: true; revisionId: string}> & {
        base: true;
        revisionId: string;
      }
    >
  | Readonly<
      Omit<DeltaBundle, keyof {base: false; revisionId: string}> & {
        base: false;
        revisionId: string;
      }
    >;
export type BundleMetadata = {
  readonly pre: number;
  readonly post: number;
  readonly modules: ReadonlyArray<[number, number]>;
};
export type FormattedError = {
  readonly type: string;
  readonly message: string;
  readonly errors: Array<{description: string}>;
};
export type HmrModule = {
  readonly module: [number, string];
  readonly sourceMappingURL: string;
  readonly sourceURL: string;
};
export type HmrUpdate = {
  readonly added: ReadonlyArray<HmrModule>;
  readonly deleted: ReadonlyArray<number>;
  readonly isInitialUpdate: boolean;
  readonly modified: ReadonlyArray<HmrModule>;
  readonly revisionId: string;
};
export type HmrUpdateMessage = {
  readonly type: 'update';
  readonly body: HmrUpdate;
};
export type HmrErrorMessage = {
  readonly type: 'error';
  readonly body: FormattedError;
};
export type HmrClientMessage =
  | {
      readonly type: 'register-entrypoints';
      readonly entryPoints: Array<string>;
    }
  | {
      readonly type: 'log';
      readonly level: 'trace' | 'info' | 'warn' | 'log' | 'group' | 'groupCollapsed' | 'groupEnd' | 'debug';
      readonly data: Array<unknown>;
    }
  | {readonly type: 'log-opt-in'}
  | {readonly type: 'heartbeat'};
export type HmrMessage =
  | {readonly type: 'bundle-registered'}
  | {
      readonly type: 'update-start';
      readonly body: {readonly isInitialUpdate: boolean};
    }
  | {
      readonly type: 'update-done';
      readonly body?: {readonly changeId?: string};
    }
  | HmrUpdateMessage
  | HmrErrorMessage
  | {readonly type: 'heartbeat'};
