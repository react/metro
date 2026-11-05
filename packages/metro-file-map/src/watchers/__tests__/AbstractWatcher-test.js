/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

import {AbstractWatcher} from '../AbstractWatcher';
import * as path from 'node:path';

test('stopping detaches error listeners and tolerates errors from in-flight work', async () => {
  const watcher = new AbstractWatcher(path.join(path.sep, 'project'), {
    ignored: null,
    included: null,
  });
  const onError = jest.fn<[Error], void>();
  const removeListener = watcher.onError(onError);
  const error = new Error('watcher error');
  watcher.emitError(error);
  expect(onError).toHaveBeenCalledWith(error);
  onError.mockClear();

  await watcher.stopWatching();
  removeListener();
  expect(() => watcher.emitError(error)).not.toThrow();
  expect(onError).not.toHaveBeenCalled();

  await watcher.stopWatching();
  expect(() => watcher.emitError(error)).not.toThrow();
});
