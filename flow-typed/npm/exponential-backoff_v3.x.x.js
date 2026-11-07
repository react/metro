/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

// https://github.com/coveooss/exponential-backoff
// https://www.npmjs.com/package/exponential-backoff

declare module 'exponential-backoff' {
  declare export type BackoffOptions = Partial<IBackOffOptions>;
  declare type IBackOffOptions = {
    delayFirstAttempt: boolean,
    jitter: 'none' | 'full',
    maxDelay: number,
    numOfAttempts: number,
    retry: (e: any, attemptNumber: number) => boolean | Promise<boolean>,
    startingDelay: number,
    timeMultiple: number,
  };
  declare type BackOff = <T>(
    request: () => Promise<T>,
    options?: BackoffOptions,
  ) => Promise<T>;
  declare module.exports: {
    backOff: BackOff,
  };
}
