/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

import {UnableToResolveError} from '../../node-haste/DependencyGraph/ModuleResolution';
import formatBundlingError from '../formatBundlingError';
import {AmbiguousModuleResolutionError} from 'metro-core';
import FileMap, {DuplicateHasteCandidatesError} from 'metro-file-map';

describe('formatBundlingError', () => {
  test('AmbiguousModuleResolutionError', () => {
    const hasteError = new DuplicateHasteCandidatesError(
      'target',
      FileMap.H.GENERIC_PLATFORM,
      false,
      new Map([
        ['/root/a.js', FileMap.H.MODULE],
        ['/root/b.js', FileMap.H.MODULE],
      ]),
    );
    expect(
      formatBundlingError(
        new AmbiguousModuleResolutionError('/origin/module.js', hasteError),
      ),
    ).toMatchObject({
      type: 'AmbiguousModuleResolutionError',
      message:
        "Ambiguous resolution: module '/origin/module.js' tries to require " +
        "'target', but there are several files providing this module. You " +
        'can delete or fix them: \n\n/root/a.js\n\n/root/b.js',
    });
  });

  test('UnableToResolveError', () => {
    expect(
      formatBundlingError(
        new UnableToResolveError('/origin/module.js', 'target', 'message'),
      ),
    ).toMatchObject({
      name: 'Error',
      type: 'UnableToResolveError',
      message:
        'Unable to resolve module target from /origin/module.js: message',
      originModulePath: '/origin/module.js',
      targetModuleName: 'target',
    });
  });
});
