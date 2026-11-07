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

import type {FileCandidates} from '../types';

export default function formatFileCandidates(
  candidates: FileCandidates,
): string {
  if (candidates.type === 'asset') {
    return candidates.name;
  }
  let formatted = candidates.filePathPrefix;
  if (candidates.candidateExts.length) {
    formatted += '(' + candidates.candidateExts.filter(Boolean).join('|') + ')';
  }
  return formatted;
}
