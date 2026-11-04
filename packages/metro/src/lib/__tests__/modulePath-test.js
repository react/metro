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

'use strict';

import {
  deriveVirtualModulePath,
  getModuleDisplayPath,
  getModuleSourcePath,
  isVirtualModulePath,
  isVirtualModuleUrl,
} from '../modulePath';

test('a virtual module path is the virtual path in the virtual namespace', () => {
  const modulePath = deriveVirtualModulePath('/root/App.generated.tsx');
  expect(modulePath).toBe('virtual:/root/App.generated.tsx');
  expect(isVirtualModulePath(modulePath)).toBe(true);
  expect(getModuleSourcePath(modulePath)).toBe('/root/App.generated.tsx');
});

test('real module paths pass through unchanged', () => {
  expect(isVirtualModulePath('/root/App.tsx')).toBe(false);
  expect(getModuleSourcePath('/root/App.tsx')).toBe('/root/App.tsx');
  expect(getModuleDisplayPath('/root/src/App.tsx', '/root')).toBe(
    'src/App.tsx',
  );
});

test('a virtual module is displayed relative to the root, in its namespace', () => {
  expect(
    getModuleDisplayPath('virtual:/root/src/App.generated.tsx', '/root'),
  ).toBe('virtual:src/App.generated.tsx');
});

test.each([
  ['?virtual=true', true],
  ['?platform=ios&virtual=true', true],
  ['?virtual', true],
  ['?platform=ios', false],
  ['', false],
])('isVirtualModuleUrl(%s) is %s', (search, expected) => {
  expect(isVirtualModuleUrl(new URLSearchParams(search))).toBe(expected);
});
