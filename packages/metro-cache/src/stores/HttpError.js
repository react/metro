/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 * @format
 */

export default class HttpError extends Error {
  code: number;

  constructor(message: string, code: number) {
    super(message);

    this.code = code;
  }
}
