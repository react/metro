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

import path from 'node:path';

const list = [/\/__tests__\/.*/];

function escapeRegExp(pattern: RegExp | string) {
  if (pattern instanceof RegExp) {
    // the forward slash may or may not be escaped in regular expression depends
    // on if it's in brackets. See this post for details
    // https://github.com/nodejs/help/issues/3039. The or condition in string
    // replace regexp is to cover both use cases.
    // We should replace all forward slashes to proper OS specific separators.
    // The separator needs to be escaped in the regular expression source string,
    // hence the '\\' prefix.
    return pattern.source.replace(/\/|\\\//g, '\\' + path.sep);
  } else if (typeof pattern === 'string') {
    // Make sure all the special characters used by regular expression are properly
    // escaped. The string inputs are supposed to match as is.
    const escaped = pattern.replace(
      /[\-\[\]\{\}\(\)\*\+\?\.\\\^\$\|]/g,
      '\\$&',
    );
    // convert the '/' into an escaped local file separator. The separator needs
    // to be escaped in the regular expression source string, hence the '\\' prefix.
    return escaped.replaceAll('/', '\\' + path.sep);
  } else {
    throw new Error(
      `Expected exclusionList to be called with RegExp or string, got: ${typeof pattern}`,
    );
  }
}

export default function exclusionList(
  additionalExclusions?: ReadonlyArray<RegExp | string>,
): RegExp {
  return new RegExp(
    '(' +
      (additionalExclusions || []).concat(list).map(escapeRegExp).join('|') +
      ')$',
  );
}
