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

import type {FileAndDirCandidates} from '../types';

import formatFileCandidates from './formatFileCandidates';

export default class FailedToResolvePathError extends Error {
  candidates: FileAndDirCandidates;

  constructor(candidates: FileAndDirCandidates) {
    super(
      'The module could not be resolved because none of these files exist:\n\n' +
        [candidates.file, candidates.dir]
          .filter(Boolean)
          .map(candidates => `  * ${formatFileCandidates(candidates)}`)
          .join('\n'),
    );
    this.candidates = candidates;
  }
}
