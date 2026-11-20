/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow
 */

type ContextModule<T> = {
  (key: string): T,
  keys(): Array<string>,
};

export type RequireWithContext = {
  (id: string): any,
  resolve: (id: string, options?: {paths?: Array<string>, ...}) => string,
  cache: any,
  main: typeof module,
  context<T>(
    name: string,
    recursive?: boolean,
    filter?: RegExp,
    mode?: 'sync' | 'eager' | 'lazy' | 'lazy-once',
  ): ContextModule<T>,
};

export function copyContextToObject<T>(ctx: ContextModule<T>): {
  [key: string]: T,
} {
  return Object.fromEntries(ctx.keys().map(key => [key, ctx(key)]));
}

export function awaitProperties<T>(
  obj: Readonly<{[key: string]: Promise<T>}>,
): Promise<{[key: string]: T}> {
  const result: {[key: string]: T} = {};
  return Promise.all(
    Object.keys(obj).map(key => {
      return obj[key].then(value => (result[key] = value));
    }),
  ).then(() => result);
}
