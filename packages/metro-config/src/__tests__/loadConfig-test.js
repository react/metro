/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 * @oncall react_native
 */

// eslint-disable-next-line lint/sort-imports
import getDefaultConfig from '../defaults';

const {loadConfig} = require('../loadConfig');
const path = require('path');
const prettyFormat = require('pretty-format');
const util = require('util');

const FIXTURES = path.resolve(__dirname, '../__fixtures__');

describe('loadConfig', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.clearAllMocks();
  });

  test('can load the config from a path', async () => {
    // We don't actually use the specified file in this test but it needs to
    // resolve to a real file on the file system.
    const result = await loadConfig({
      config: path.resolve(FIXTURES, 'custom-path.metro.config.js'),
    });
    expect(result).toMatchObject({
      cacheVersion: 'custom-path',
    });
  });

  test('can load config objects', async () => {
    const result = await loadConfig({
      config: path.resolve(FIXTURES, 'basic.config.js'),
    });
    expect(result.cacheVersion).toEqual('basic-config');
  });

  test('can load config from function', async () => {
    const defaultConfigOverrides = {
      resolver: {
        sourceExts: ['json', 're'],
      },
    };
    const result = await loadConfig(
      {
        config: path.resolve(
          __dirname,
          '../__fixtures__/cjs-sync-function.metro.config.js',
        ),
      },
      defaultConfigOverrides,
    );
    const defaults = await getDefaultConfig();
    expect(result.resolver).toMatchObject({
      assetExts: defaults.resolver.assetExts,
      sourceExts: ['json', 're', 'tsx'],
      hasteImplModulePath: 'test',
    });
  });

  test('can load config that exports a promise', async () => {
    const result = await loadConfig(
      {
        config: path.resolve(
          __dirname,
          '../__fixtures__/cjs-promise.metro.config.js',
        ),
      },
      {},
    );
    expect(result).toMatchObject({
      cacheVersion: 'cjs-promise-config',
    });
  });

  test('mergeConfig chains config functions', async () => {
    const defaultConfigOverrides = {
      resolver: {
        sourceExts: ['override'],
      },
    };
    const config = path.resolve(
      __dirname,
      '../__fixtures__/merged.metro.config.js',
    );
    const result = await loadConfig({config}, defaultConfigOverrides);
    expect(result.projectRoot).toEqual(path.dirname(config));
    expect(result.resolver).toMatchObject({
      sourceExts: ['before', 'override', 'after'],
    });
  });

  test('can load the config from a path pointing to a directory', async () => {
    // We don't actually use the specified file in this test but it needs to
    // resolve to a real file on the file system.
    const result = await loadConfig({cwd: FIXTURES});
    expect(result).toMatchObject({
      cacheVersion: 'default-config',
    });
  });

  test('can load the config with no config present', async () => {
    jest.mock('fs', () => ({
      existsSync: jest.fn(() => false),
    }));
    const result = await loadConfig({cwd: process.cwd()});
    jest.unmock('fs');

    let defaultConfig = await getDefaultConfig(process.cwd());
    defaultConfig = {
      ...defaultConfig,
      watchFolders: [defaultConfig.projectRoot, ...defaultConfig.watchFolders],
    };

    expect(prettyFormat.format(result)).toEqual(
      prettyFormat.format(defaultConfig),
    );
  });

  test('validates config for server', async () => {
    expect.assertions(1);
    try {
      await loadConfig({
        config: path.resolve(FIXTURES, 'bad-server.metro.config.js'),
      });
    } catch (error) {
      expect(util.stripVTControlCharacters(error.message)).toMatchSnapshot();
    }
  });

  test('validates config for projectRoot', async () => {
    expect.assertions(1);
    try {
      await loadConfig({
        config: path.resolve(FIXTURES, 'bad-root.metro.config.js'),
      });
    } catch (error) {
      expect(util.stripVTControlCharacters(error.message)).toMatchSnapshot();
    }
  });

  test('injects `metro-cache` into the `cacheStores` callback', async () => {
    const result = await loadConfig({
      config: path.resolve(FIXTURES, 'cachestores.config.js'),
    });
    expect(result.cacheStores[0]).toBeInstanceOf(
      require('metro-cache').FileStore,
    );
  });

  describe('given a search directory', () => {
    const HOME = process.platform === 'win32' ? 'C:\\Home' : '/home';
    const mockHomeDir = jest.fn().mockReturnValue(HOME);
    const mockExistsSync = jest.fn();
    let loadConfig;

    beforeAll(() => {
      jest.resetModules();
      jest.mock('os', () => ({
        ...jest.requireActual('os'),
        homedir: mockHomeDir,
      }));
      jest.mock('fs', () => ({
        existsSync: mockExistsSync,
      }));
      // Reload after mocking above
      loadConfig = require('../loadConfig').loadConfig;
    });

    test('looks in the expected places', async () => {
      await loadConfig({cwd: path.join(HOME, 'project')});
      expect(mockExistsSync.mock.calls.map(args => args[0])).toEqual(
        [
          'project/metro.config.js',
          'project/metro.config.cjs',
          'project/metro.config.mjs',
          'project/metro.config.json',
          'project/metro.config.ts',
          'project/metro.config.cts',
          'project/metro.config.mts',
          'project/.config/metro.js',
          'project/.config/metro.cjs',
          'project/.config/metro.mjs',
          'project/.config/metro.json',
          'project/.config/metro.ts',
          'project/.config/metro.cts',
          'project/.config/metro.mts',
          'project/package.json',
          'metro.config.js',
          'metro.config.cjs',
          'metro.config.mjs',
          'metro.config.json',
          'metro.config.ts',
          'metro.config.cts',
          'metro.config.mts',
          '.config/metro.js',
          '.config/metro.cjs',
          '.config/metro.mjs',
          '.config/metro.json',
          '.config/metro.ts',
          '.config/metro.cts',
          '.config/metro.mts',
          'package.json',
        ].map(relativePath => path.resolve(HOME, relativePath)),
      );
    });

    test('returns defaults when no config is present', async () => {
      const result = await loadConfig({cwd: path.resolve(HOME, 'project')});
      let defaultConfig = await getDefaultConfig(path.resolve(HOME, 'project'));
      defaultConfig = {
        ...defaultConfig,
        watchFolders: [
          defaultConfig.projectRoot,
          ...defaultConfig.watchFolders,
        ],
      };

      expect(prettyFormat.format(result)).toEqual(
        prettyFormat.format(defaultConfig),
      );
    });
  });
});
