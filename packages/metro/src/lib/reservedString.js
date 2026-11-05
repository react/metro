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
 * The string reserved for identifiers that Metro generates for a serializer to
 * find without parsing the code. The default transformer rejects it in source
 * and JSON files, which prevents accidental collisions. Custom transforms
 * should not generate it unless they expect Metro to process it. Serializers
 * receive this string as `options.reservedString`, and should not assume its
 * value.
 */
export const RESERVED_STRING = '_$$_METRO_';
