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

import {AbstractWatcher} from '../AbstractWatcher';
import {join} from 'node:path';

const options = {
  included: null,
  ignored: null,
  watchmanDeferStates: [],
};

describe('AbstractWatcher errors', () => {
  test('reports an error to its listeners while watching', async () => {
    const watcher = new AbstractWatcher(join('/', 'project'), options);
    const onError = jest.fn<[Error], void>();
    watcher.onError(onError);
    await watcher.startWatching();

    const error = new Error('watch failed');
    watcher.emitError(error);

    expect(onError.mock.calls).toEqual([[error]]);
  });

  test('does not throw for an error reported after stopWatching', async () => {
    const watcher = new AbstractWatcher(join('/', 'project'), options);
    watcher.onError(() => {});
    await watcher.startWatching();
    await watcher.stopWatching();

    expect(() => watcher.emitError(new Error('late error'))).not.toThrow();
  });
});
