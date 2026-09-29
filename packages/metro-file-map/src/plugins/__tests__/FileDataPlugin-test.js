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

import FileDataPlugin from '../FileDataPlugin';

const options = {
  name: 'test-plugin',
  cacheKey: 'test-plugin-1',
  worker: {modulePath: 'mock-worker', setupArgs: {}},
  filter: () => true,
};

const files = {
  lookup: (): {exists: false} => ({exists: false}),
  fileIterator: () => [],
};

describe('FileDataPlugin', () => {
  test('is not lazy by default', () => {
    expect(new FileDataPlugin<?string>(options).getWorker().lazy).not.toBe(
      true,
    );
  });

  test('passes `lazy` to its worker description', () => {
    expect(
      new FileDataPlugin<?string>({...options, lazy: true}).getWorker(),
    ).toEqual({worker: options.worker, filter: options.filter, lazy: true});
  });

  test('processFile throws before the plugin is initialized', () => {
    const plugin = new FileDataPlugin<?string>(options);
    expect(() => plugin.processFile('/project/package.json')).toThrow(
      'test-plugin plugin has not been initialized',
    );
  });

  test('processFile asks the file map to process the file', async () => {
    const plugin = new FileDataPlugin<?string>({...options, lazy: true});
    const processFile = jest.fn<[string], ?string>(() => 'file data');
    await plugin.initialize({files, pluginState: null, processFile});

    expect(plugin.processFile('/project/package.json')).toBe('file data');
    expect(processFile).toHaveBeenCalledWith('/project/package.json');
  });
});
