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

import TerminalReporter from '../TerminalReporter';

describe('TerminalReporter', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('updates the bundle transform progress status at most every 100ms', () => {
    const terminal = {log: jest.fn(), status: jest.fn()};
    const reporter = new TerminalReporter(terminal as $FlowFixMe);
    const progress = (transformedFileCount: number) =>
      reporter.update({
        buildID: 'build-1',
        type: 'bundle_transform_progressed',
        transformedFileCount,
        totalFileCount: 10,
      });
    reporter.update({
      buildID: 'build-1',
      bundleDetails: {
        bundleType: 'bundle',
        customResolverOptions: {},
        customTransformOptions: {},
        dev: true,
        entryFile: 'foo/bar.js',
        minify: false,
        platform: null,
      },
      type: 'bundle_build_started',
    });
    progress(1);
    progress(2);
    expect(terminal.status).toHaveBeenCalledTimes(2);
    expect(terminal.status.mock.calls[1][0]).toContain('(1/10)');
    jest.advanceTimersByTime(100);
    progress(3);
    expect(terminal.status).toHaveBeenCalledTimes(3);
    expect(terminal.status.mock.calls[2][0]).toContain('(3/10)');
  });
});
