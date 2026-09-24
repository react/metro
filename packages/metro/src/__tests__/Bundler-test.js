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

import Bundler from '../Bundler';
import Transformer from '../DeltaBundler/Transformer';
import DependencyGraph from '../node-haste/DependencyGraph';
import {getDefaultConfig} from 'metro-config';

jest.mock('../DeltaBundler/Transformer');
jest.mock('../node-haste/DependencyGraph');

type ClassMock = JestMockFn<ReadonlyArray<unknown>, unknown>;

// $FlowFixMe[incompatible-type] Jest automocks the default export
const MockTransformer: ClassMock = Transformer;
// $FlowFixMe[incompatible-type] Jest automocks the default export
const MockDependencyGraph: ClassMock = DependencyGraph;

describe('Bundler', () => {
  let config: ConfigT;
  let reporter;

  beforeEach(() => {
    reporter = {update: jest.fn()};
    config = {...getDefaultConfig.getDefaultValues('/'), reporter};

    MockDependencyGraph.mockImplementation(() => ({
      ready: jest.fn().mockResolvedValue(),
    }));

    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test.each([
    ['ready', (bundler: Bundler) => bundler.ready()],
    [
      'transformFile',
      // $FlowFixMe[incompatible-type] Transform options are unused before initialization fails
      (bundler: Bundler) => bundler.transformFile('/entry.js', {}),
    ],
  ])(
    'propagates Transformer initialization errors from %s',
    async (_method, invoke) => {
      const error = new Error('Transformer initialization failed');
      MockTransformer.mockImplementation(() => {
        throw error;
      });

      const bundler = new Bundler(config);

      await expect(invoke(bundler)).rejects.toBe(error);
      expect(reporter.update).toHaveBeenCalledWith({
        type: 'transformer_load_failed',
        error,
      });
    },
  );

  test('does not emit an unhandled rejection before ready is called', async () => {
    jest.useRealTimers();

    const error = new Error('Transformer initialization failed');
    const unhandledRejections: Array<unknown> = [];
    const onUnhandledRejection = (reason: unknown) => {
      unhandledRejections.push(reason);
    };

    MockTransformer.mockImplementation(() => {
      throw error;
    });
    process.on('unhandledRejection', onUnhandledRejection);

    try {
      const bundler = new Bundler(config);

      await new Promise(resolve => setImmediate(resolve));

      await expect(bundler.ready()).rejects.toBe(error);
      expect(unhandledRejections).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandledRejection);
      jest.useFakeTimers();
    }
  });
});
