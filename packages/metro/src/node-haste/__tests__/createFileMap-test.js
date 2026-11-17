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

import type {ConfigT} from 'metro-config';
import type {HasteMap} from 'metro-file-map';

import createFileMap from '../DependencyGraph/createFileMap';
import {getDefaultConfig} from 'metro-config';
import {HastePlugin} from 'metro-file-map';

function createHasteMap(resolver: Partial<ConfigT['resolver']>): ?HasteMap {
  const defaults = getDefaultConfig.getDefaultValues('/');
  return createFileMap(
    {...defaults, resolver: {...defaults.resolver, ...resolver}},
    {watch: false},
  ).hasteMap;
}

describe('createFileMap', () => {
  let getWorker;

  beforeEach(() => {
    // The file map asks each of its plugins for a worker when constructed.
    getWorker = jest.spyOn(HastePlugin.prototype, 'getWorker');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('adds no Haste plugin without a hasteImplModulePath or Haste packages', () => {
    const hasteMap = createHasteMap({});

    expect(hasteMap).toBeNull();
    expect(getWorker).not.toHaveBeenCalled();
  });

  test.each([
    [
      'a hasteImplModulePath',
      {
        hasteImplModulePath:
          require.resolve('../../DeltaBundler/__fixtures__/hasteImpl.js'),
      },
    ],
    ['Haste packages', {enableGlobalPackages: true}],
  ])('adds the Haste plugin with %s', (_, resolver) => {
    const hasteMap = createHasteMap(resolver);

    expect(hasteMap).toBeInstanceOf(HastePlugin);
    expect(getWorker.mock.instances).toHaveLength(1);
    expect(getWorker.mock.instances[0]).toBe(hasteMap);
  });
});
