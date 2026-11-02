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
 * A string that the default transformer rejects in source and JSON files, so
 * that placeholders containing it can be found and replaced in generated code
 * without parsing it. Serializers receive it as `options.reservedString`, and
 * should not assume its value.
 */
export const RESERVED_STRING = '_$$_METRO_';
