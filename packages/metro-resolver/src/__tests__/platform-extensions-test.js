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

import FailedToResolvePathError from '../errors/FailedToResolvePathError';
import * as Resolver from '../index';
import {createResolutionContext, posixToSystemPath as p} from './utils';

const fileMap = {
  [p('/root/project/foo.js')]: '',
  [p('/root/project/bar.js')]: '',
  [p('/root/project/bar.ios.js')]: '',
  [p('/root/project/bar.native.js')]: '',
  [p('/root/project/baz.ios.js')]: '',
  [p('/root/project/baz.native.js')]: '',
};

describe('preferNativePlatform: true', () => {
  const context: ResolutionContext = {
    ...createResolutionContext(fileMap),
    originModulePath: p('/root/project/foo.js'),
    preferNativePlatform: true,
  };

  test('platform: null resolves to .native.js', () => {
    expect(Resolver.resolve(context, './bar', null)).toEqual({
      type: 'sourceFile',
      filePath: p('/root/project/bar.native.js'),
    });
  });

  test('platform: ios resolves to .ios.js', () => {
    expect(Resolver.resolve(context, './bar', 'ios')).toEqual({
      type: 'sourceFile',
      filePath: p('/root/project/bar.ios.js'),
    });
  });

  test('platform: android resolves to .js', () => {
    expect(Resolver.resolve(context, './bar', 'android')).toEqual({
      type: 'sourceFile',
      filePath: p('/root/project/bar.native.js'),
    });
  });

  test('platform: android, only ios+native available resolves to native', () => {
    expect(Resolver.resolve(context, './baz', 'android')).toEqual({
      type: 'sourceFile',
      filePath: p('/root/project/baz.native.js'),
    });
  });
});

describe('preferNativePlatform: false', () => {
  const context: ResolutionContext = {
    ...createResolutionContext(fileMap),
    originModulePath: p('/root/project/foo.js'),
    preferNativePlatform: false,
  };

  test('platform: null resolves to .js', () => {
    expect(Resolver.resolve(context, './bar', null)).toEqual({
      type: 'sourceFile',
      filePath: p('/root/project/bar.js'),
    });
  });

  test('platform: ios resolves to .ios.js', () => {
    expect(Resolver.resolve(context, './bar', 'ios')).toEqual({
      type: 'sourceFile',
      filePath: p('/root/project/bar.ios.js'),
    });
  });

  test('platform: android resolves to .js', () => {
    expect(Resolver.resolve(context, './bar', 'android')).toEqual({
      type: 'sourceFile',
      filePath: p('/root/project/bar.js'),
    });
  });

  test('platform: android, only ios+native available does not resolve', () => {
    expect(() => Resolver.resolve(context, './baz', 'android')).toThrow(
      FailedToResolvePathError,
    );
  });
});
