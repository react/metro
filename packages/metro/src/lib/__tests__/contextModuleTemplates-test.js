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

import {getContextModuleTemplate} from '../contextModuleTemplates';

describe('getContextModuleTemplate', () => {
  test('creates a sync template', () => {
    const template = getContextModuleTemplate('sync', '/path/to/project/src', [
      '/path/to/project/src/foo.js',
    ]);
    expect(template).toMatch(/foo\.js/);
    expect(template).toMatchSnapshot();
  });
  test('creates an empty template', () => {
    const template = getContextModuleTemplate(
      'sync',
      '/path/to/project/src',
      [],
    );
    expect(template).toMatch(/MODULE_NOT_FOUND/);
    expect(template).toMatchSnapshot();
  });
  test('creates an eager template', () => {
    const template = getContextModuleTemplate('eager', '/path/to/project/src', [
      '/path/to/project/src/foo.js',
    ]);
    expect(template).toMatchSnapshot();
  });
  test('creates a lazy template', () => {
    const template = getContextModuleTemplate('lazy', '/path/to/project/src', [
      '/path/to/project/src/foo.js',
    ]);
    expect(template).toMatchSnapshot();
  });
  test('creates a lazy-once template', () => {
    const template = getContextModuleTemplate(
      'lazy-once',
      '/path/to/project/src',
      ['/path/to/project/src/foo.js', '/path/to/project/src/another/bar.js'],
    );

    expect(template).toMatchSnapshot();
  });

  test('creates posix paths on windows for sync template', () => {
    jest.resetModules();
    const mockPath = jest.requireActual<{win32: unknown}>('path');
    jest.mock('node:path', () => mockPath.win32);
    const {
      getContextModuleTemplate: getWindowsTemplate,
    } = require('../contextModuleTemplates');
    const template = getWindowsTemplate('sync', 'c:/path/to/project/src', [
      'C:\\path\\to\\project\\src\\foo.js',
    ]);
    expect(template).toMatch(/foo\.js/);
    expect(template).toMatchSnapshot();
  });
});
