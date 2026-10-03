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

import type {InputConfigT} from 'metro-config';

import ProjectRouteMap from '../ProjectRouteMap';
import {mergeConfig} from 'metro-config';
import path from 'node:path';

const {
  getDefaultConfig: {getDefaultValues},
} = require('metro-config');

const config = mergeConfig(getDefaultValues('/project/root'), {
  watchFolders: ['/mnt/scratch/node_modules', '/other/watch'],
} as InputConfigT);

const routeMap = new ProjectRouteMap(config);

describe('ProjectRouteMap', () => {
  describe('serverRootDir', () => {
    test('defaults to projectRoot', () => {
      expect(routeMap.serverRootDir).toBe('/project/root');
    });

    test('uses unstable_serverRoot when set', () => {
      const map = new ProjectRouteMap(
        mergeConfig(getDefaultValues('/project/root'), {
          server: {unstable_serverRoot: '/server/root'},
        } as InputConfigT),
      );
      expect(map.serverRootDir).toBe('/server/root');
    });
  });

  describe('filePathOfUrlDecodedPathname', () => {
    test('resolves [metro-watchFolders]/N/ prefix', () => {
      expect(
        routeMap.filePathOfUrlDecodedPathname(
          './[metro-watchFolders]/0/expo-router/entry',
        ),
      ).toBe(
        path.join(
          path.normalize('/mnt/scratch/node_modules'),
          'expo-router',
          'entry',
        ),
      );
    });

    test('resolves URL-style /[metro-watchFolders]/N/ prefix', () => {
      expect(
        routeMap.filePathOfUrlDecodedPathname(
          '/[metro-watchFolders]/0/expo-router/entry',
        ),
      ).toBe(
        path.join(
          path.normalize('/mnt/scratch/node_modules'),
          'expo-router',
          'entry',
        ),
      );
    });

    test('resolves against the correct watchFolder by index', () => {
      expect(
        routeMap.filePathOfUrlDecodedPathname(
          './[metro-watchFolders]/1/some/module',
        ),
      ).toBe(path.join(path.normalize('/other/watch'), 'some', 'module'));
    });

    test('resolves [metro-project]/ prefix', () => {
      expect(
        routeMap.filePathOfUrlDecodedPathname(
          './[metro-project]/src/app/index',
        ),
      ).toBe(path.join(path.normalize('/project/root'), 'src', 'app', 'index'));
    });

    test('returns null for non-prefixed paths', () => {
      expect(routeMap.filePathOfUrlDecodedPathname('./src/index')).toBeNull();
      expect(routeMap.filePathOfUrlDecodedPathname('/src/index')).toBeNull();
      expect(routeMap.filePathOfUrlDecodedPathname('./app')).toBeNull();
    });

    test('returns null for out-of-bounds watchFolder index', () => {
      expect(
        routeMap.filePathOfUrlDecodedPathname(
          '/[metro-watchFolders]/99/foo.js',
        ),
      ).toBeNull();
    });
  });

  describe('filePathOfUrlPathname', () => {
    test('decodes URL-encoded segments', () => {
      expect(
        routeMap.filePathOfUrlPathname('/%5Bmetro-project%5D/src/App.js'),
      ).toBe(path.join(path.normalize('/project/root'), 'src', 'App.js'));
    });
  });

  describe('urlPathnameOfFilePath', () => {
    test('maps file in projectRoot to /[metro-project]/', () => {
      expect(
        routeMap.urlPathnameOfFilePath(
          path.normalize('/project/root') +
            path.sep +
            'src' +
            path.sep +
            'App.js',
        ),
      ).toBe('/[metro-project]/src/App.js');
    });

    test('maps file in watchFolder to /[metro-watchFolders]/N/', () => {
      expect(
        routeMap.urlPathnameOfFilePath(
          path.normalize('/mnt/scratch/node_modules') +
            path.sep +
            'expo-router' +
            path.sep +
            'entry.js',
        ),
      ).toBe('/[metro-watchFolders]/0/expo-router/entry.js');
    });

    test('maps file in second watchFolder', () => {
      expect(
        routeMap.urlPathnameOfFilePath(
          path.normalize('/other/watch') +
            path.sep +
            'some' +
            path.sep +
            'module.js',
        ),
      ).toBe('/[metro-watchFolders]/1/some/module.js');
    });

    test('falls back to absolute path for files outside all routes', () => {
      expect(
        routeMap.urlPathnameOfFilePath(
          path.normalize('/unrelated/path/file.js'),
        ),
      ).toBe('/unrelated/path/file.js');
    });

    test('is the inverse of filePathOfUrlDecodedPathname for prefixed paths', () => {
      const pathname = '/[metro-watchFolders]/0/expo-router/entry.js';
      const filePath = routeMap.filePathOfUrlDecodedPathname('.' + pathname);
      expect(filePath).not.toBeNull();
      if (filePath != null) {
        expect(routeMap.urlPathnameOfFilePath(filePath)).toBe(pathname);
      }
    });
  });
});
