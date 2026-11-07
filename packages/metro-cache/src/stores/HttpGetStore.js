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

import type HttpError from './HttpError';
import type {Options as HttpOptions} from './HttpStore';
import type NetworkError from './NetworkError';

import HttpStore from './HttpStore';
import {Logger} from 'metro-core';

export default class HttpGetStore<T> extends HttpStore<T> {
  #warned: boolean;

  constructor(options: HttpOptions) {
    super(options);

    this.#warned = false;
  }

  async get(key: Buffer): Promise<?T> {
    try {
      return await super.get(key);
    } catch (err) {
      if (
        !(err instanceof HttpStore.HttpError) &&
        !(err instanceof HttpStore.NetworkError)
      ) {
        throw err;
      }

      this.#warn(err);

      return null;
    }
  }

  async set(_key: Buffer, _value: T): Promise<void> {}

  #warn(err: HttpError | NetworkError) {
    if (!this.#warned) {
      process.emitWarning(
        [
          'Could not connect to the HTTP cache.',
          'Original error: ' + err.message,
        ].join(' '),
      );

      Logger.log(
        Logger.createEntry({
          action_name: 'HttpGetStore:Warning',
          log_entry_label: `${err.message} (${err.code})`,
        }),
      );
      this.#warned = true;
    }
  }
}
