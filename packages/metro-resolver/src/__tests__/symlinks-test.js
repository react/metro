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

import type {ResolutionContext} from '../index';
import type {MockFileMap} from './utils';

import FailedToResolvePathError from '../errors/FailedToResolvePathError';
import * as Resolver from '../index';
import {createResolutionContext, posixToSystemPath as p} from './utils';

const fileMap: MockFileMap = {
  [p('/root/project/foo.js')]: '',
  [p('/root/project/baz/index.js')]: '',
  [p('/root/project/baz.js')]: {realPath: null},
  [p('/root/project/link-to-foo.js')]: {realPath: p('/root/project/foo.js')},
};

const CONTEXT: ResolutionContext = {
  ...createResolutionContext(fileMap),
  originModulePath: p('/root/project/foo.js'),
};

test('resolves to a real path when the chosen candidate is a symlink', () => {
  expect(Resolver.resolve(CONTEXT, './link-to-foo', null)).toEqual({
    type: 'sourceFile',
    filePath: p('/root/project/foo.js'),
  });
});

test('does not resolve to a broken symlink', () => {
  // ./baz.js is a broken link, baz/index.js is real
  expect(() => Resolver.resolve(CONTEXT, './baz.js', null)).toThrow(
    FailedToResolvePathError,
  );
  expect(Resolver.resolve(CONTEXT, './baz', null)).toEqual({
    type: 'sourceFile',
    filePath: p('/root/project/baz/index.js'),
  });
});
