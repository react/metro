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

import DependencyGraph from '../DependencyGraph';
import createFileMap from '../DependencyGraph/createFileMap';
import {getDefaultConfig} from 'metro-config';

jest.mock('../DependencyGraph/createFileMap');

type FunctionMock = JestMockFn<ReadonlyArray<unknown>, unknown>;

// $FlowFixMe[incompatible-type] Jest automocks the default export
const mockCreateFileMap: FunctionMock = createFileMap;

describe('DependencyGraph', () => {
  let config: ConfigT;
  let fileMapEnd;

  beforeEach(() => {
    config = {
      ...getDefaultConfig.getDefaultValues('/'),
      reporter: {update: jest.fn()},
    };
    fileMapEnd = jest.fn().mockResolvedValue();
  });

  test('ends the file map when the build fails', async () => {
    const error = new Error('Crawl failed');
    mockCreateFileMap.mockReturnValue({
      fileMap: {
        build: jest.fn().mockRejectedValue(error),
        end: fileMapEnd,
        on: jest.fn(),
        setMaxListeners: jest.fn(),
      },
      hasteMap: {},
      dependencyPlugin: null,
    });

    const depGraph = new DependencyGraph(config);

    await expect(depGraph.ready()).rejects.toBe(error);
    await expect(depGraph.end()).resolves.toBeUndefined();
    expect(fileMapEnd).toHaveBeenCalledTimes(1);
  });
});
