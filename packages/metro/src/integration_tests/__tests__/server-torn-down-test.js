/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow strict-local
 * @oncall react_native
 */

const Metro = require('../../..');
// $FlowFixMe[cannot-resolve-module] - Untyped module
const asyncHooks = require('node:async_hooks');

jest.useRealTimers();

jest.setTimeout(10000);

describe('Server torn down test', () => {
  const active = new Map<
    number,
    {type: string, callStack: string, resource: unknown},
  >();
  const hook = asyncHooks.createHook({
    init(asyncId, type, _triggerAsyncId, resource) {
      if (
        [
          'TIMERWRAP',
          'PROMISE',
          'PerformanceObserver',
          'RANDOMBYTESREQUEST',
          'Timeout',
          'TickObject',
          'FILEHANDLE',
          'FILEHANDLECLOSEREQ',
          'FSREQCALLBACK',
          'FSREQPROMISE',
          'FSEVENTWRAP',
          'SIGNALWRAP',
        ].includes(type)
      ) {
        // these are only destroyed by garbage collector
        // so we dont expect them to be destroyed when metro is closed
        return;
      }
      active.set(asyncId, {
        type,
        callStack: new Error('mock error to get stack trace').stack,
        resource,
      });
    },
    destroy(asyncId) {
      if (active.has(asyncId)) {
        active.delete(asyncId);
      }
    },
  });

  beforeEach(() => {
    active.clear();
    hook.enable();
  });

  afterEach(() => {
    hook.disable();
  });

  test('ensures expectMetroTornDown works well', () => {
    // running it without metro being open should ensure it works
    expect(active).toEqual(new Map());
  });

  test('closing should close all handlers', async () => {
    const config = await Metro.loadConfig({
      config: require.resolve('../metro.config.js'),
    });

    let onCloseResolve;
    const closePromise = new Promise(resolve => (onCloseResolve = resolve));

    const {httpServer} = await Metro.runServer(config, {
      onClose: () => {
        onCloseResolve();
      },
    });

    httpServer.close();

    await closePromise;

    expect(Array.from(active.values())).toEqual([]);
  });
});
