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
  test('shows the latest bundle transform progress', () => {
    const terminal = {log: jest.fn(), status: jest.fn()};
    const reporter = new TerminalReporter(terminal as $FlowFixMe);
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
    reporter.update({
      buildID: 'build-1',
      type: 'bundle_transform_progressed',
      transformedFileCount: 1,
      totalFileCount: 10,
    });
    reporter.update({
      buildID: 'build-1',
      type: 'bundle_transform_progressed',
      transformedFileCount: 2,
      totalFileCount: 10,
    });
    expect(terminal.status).toHaveBeenCalledTimes(3);
    expect(terminal.status.mock.calls[2][0]).toContain('(2/10)');
  });
});
