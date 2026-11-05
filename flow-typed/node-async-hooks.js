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

// The parts of `async_hooks` that Metro uses, which the Node libdef lacks.

declare module 'async_hooks' {
  declare export type HookCallbacks = {
    init?: (
      asyncId: number,
      type: string,
      triggerAsyncId: number,
      resource: {...},
    ) => void,
    before?: (asyncId: number) => void,
    after?: (asyncId: number) => void,
    destroy?: (asyncId: number) => void,
    promiseResolve?: (asyncId: number) => void,
  };

  declare export interface AsyncHook {
    enable(): this;
    disable(): this;
  }

  declare export function createHook(callbacks: HookCallbacks): AsyncHook;

  declare export class AsyncLocalStorage<T> {
    constructor(): void;
    getStore(): T | void;
    run<R>(store: T, callback: () => R): R;
    exit<R>(callback: () => R): R;
  }
}

declare module 'node:async_hooks' {
  export type * from 'async_hooks';
  declare module.exports: $Exports<'async_hooks'>;
}
