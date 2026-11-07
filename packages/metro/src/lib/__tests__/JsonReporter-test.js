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

import JsonReporter from '../JsonReporter';

describe('JsonReporter', () => {
  test('prints deeply nested errors', () => {
    const mockStream = {
      write: jest.fn(),
    };
    const reporter = new JsonReporter<{type: 'some_failure', error: Error}>(
      mockStream as $FlowFixMe,
    );
    reporter.update({
      type: 'some_failure',
      error: new AggregateError(
        [
          new Error('test error'),
          new Error('test error with a cause', {cause: new Error('cause')}),
        ],
        'test aggregate error',
      ),
    });
    expect(mockStream.write).toHaveBeenCalled();
    const deserialized = JSON.parse(mockStream.write.mock.calls[0][0]);
    expect(deserialized.error).toEqual({
      message: 'test aggregate error',
      stack: expect.stringContaining('JsonReporter-test'),
      errors: [
        {
          message: 'test error',
          stack: expect.stringContaining('JsonReporter-test'),
        },
        {
          message: 'test error with a cause',
          stack: expect.stringContaining('JsonReporter-test'),
          cause: {
            message: 'cause',
            stack: expect.stringContaining('JsonReporter-test'),
          },
        },
      ],
    });
  });
});
