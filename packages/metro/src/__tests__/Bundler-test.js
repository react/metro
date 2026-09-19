/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

'use strict';

jest.mock('../DeltaBundler/Transformer');
jest.mock('../node-haste/DependencyGraph');

const Bundler = require('../Bundler').default;
const Transformer = require('../DeltaBundler/Transformer').default;
const DependencyGraph = require('../node-haste/DependencyGraph').default;
const {getDefaultValues} = require('metro-config').getDefaultConfig;

describe('Bundler', () => {
  let config;
  let reporter;

  beforeEach(() => {
    reporter = {update: jest.fn()};
    config = {...getDefaultValues('/'), reporter};

    DependencyGraph.mockImplementation(() => ({
      ready: jest.fn().mockResolvedValue(),
    }));

    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test.each([
    ['ready', bundler => bundler.ready()],
    ['transformFile', bundler => bundler.transformFile('/entry.js', {})],
  ])(
    'propagates Transformer initialization errors from %s',
    async (_method, invoke) => {
      const error = new Error('Transformer initialization failed');
      Transformer.mockImplementation(() => {
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
    const unhandledRejections = [];
    const onUnhandledRejection = reason => {
      unhandledRejections.push(reason);
    };

    Transformer.mockImplementation(() => {
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
