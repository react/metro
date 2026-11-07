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

export default class FailedToResolveUnsupportedError extends Error {
  constructor(message: string, options?: {cause?: unknown}) {
    super(message, options);
  }
}
