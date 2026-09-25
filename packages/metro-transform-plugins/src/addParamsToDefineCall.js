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

/**
 * Simple way of adding additional parameters to the end of the define calls.
 *
 * This is used to add extra information to the generic compiled modules (like
 * the dependencyMap object or the list of inverse dependencies).
 */
export default function addParamsToDefineCall(
  code: string,
  ...paramsToAdd: Array<unknown>
): string {
  const index = code.lastIndexOf(')');
  const params = paramsToAdd.map(param =>
    // Distinguish between `undefined` and `null` - `undefined` is not JSON.
    // eslint-disable-next-line lint/strictly-null
    param !== undefined ? JSON.stringify(param) : 'undefined',
  );

  return code.slice(0, index) + ',' + params.join(',') + code.slice(index);
}
