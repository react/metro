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

import {DYNAMIC_ROOT_ID_LENGTH} from '../dynamicRoots';
import ProjectRouteMap, {MAX_WATCH_FOLDERS} from '../ProjectRouteMap';
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

  describe('dynamic roots', () => {
    const dynamicRoots = [
      {id: '01234567', rootDir: path.normalize('/elsewhere/lib')},
      {
        id: 'fedcba98',
        rootDir: path.normalize('/mnt/scratch/node_modules/pkg'),
      },
    ];
    let currentDynamicRoots = dynamicRoots;
    const dynamicRouteMap = new ProjectRouteMap(
      config,
      () => currentDynamicRoots,
    );

    beforeEach(() => {
      currentDynamicRoots = dynamicRoots;
    });

    test('resolves a dynamic root id to a file in that root', () => {
      expect(
        dynamicRouteMap.filePathOfUrlDecodedPathname(
          '/[metro-watchFolders]/01234567/helpers/a.js',
        ),
      ).toBe(path.normalize('/elsewhere/lib/helpers/a.js'));
    });

    test('returns null for an unknown dynamic root id', () => {
      expect(
        dynamicRouteMap.filePathOfUrlDecodedPathname(
          '/[metro-watchFolders]/00000000/helpers/a.js',
        ),
      ).toBeNull();
      expect(
        routeMap.filePathOfUrlDecodedPathname(
          '/[metro-watchFolders]/01234567/helpers/a.js',
        ),
      ).toBeNull();
    });

    test('maps a file in a dynamic root to its id', () => {
      expect(
        dynamicRouteMap.urlPathnameOfFilePath(
          path.normalize('/elsewhere/lib/helpers/a b.js'),
        ),
      ).toBe('/[metro-watchFolders]/01234567/helpers/a%20b.js');
    });

    test('prefers a watch folder to a dynamic root within it, and still resolves the id', () => {
      const filePath = path.normalize('/mnt/scratch/node_modules/pkg/index.js');
      expect(dynamicRouteMap.urlPathnameOfFilePath(filePath)).toBe(
        '/[metro-watchFolders]/0/pkg/index.js',
      );
      expect(
        dynamicRouteMap.filePathOfUrlDecodedPathname(
          '/[metro-watchFolders]/fedcba98/index.js',
        ),
      ).toBe(filePath);
    });

    test('reads a segment of id length as an id, even if numeric, and a shorter number as an index', () => {
      expect(
        dynamicRouteMap.filePathOfUrlDecodedPathname(
          '/[metro-watchFolders]/00000001/a.js',
        ),
      ).toBeNull();
      expect(
        dynamicRouteMap.filePathOfUrlDecodedPathname(
          '/[metro-watchFolders]/0000001/a.js',
        ),
      ).toBe(path.join(path.normalize('/other/watch'), 'a.js'));
    });

    test('allows the most watch folders whose indices are all shorter than an id', () => {
      expect(String(MAX_WATCH_FOLDERS - 1).length).toBeLessThan(
        DYNAMIC_ROOT_ID_LENGTH,
      );
      expect(String(MAX_WATCH_FOLDERS).length).toBe(DYNAMIC_ROOT_ID_LENGTH);
    });

    test('throws for more watch folders than that', () => {
      // Sparse, and rejected before any route is built from it.
      expect(
        () =>
          new ProjectRouteMap({
            ...config,
            watchFolders: new Array<string>(MAX_WATCH_FOLDERS + 1),
          }),
      ).toThrow(
        `Metro supports at most ${MAX_WATCH_FOLDERS} watchFolders, but ` +
          `${MAX_WATCH_FOLDERS + 1} are configured.`,
      );
    });

    test.each([
      [path.normalize('/elsewhere/lib/'), 'helpers/a.js'],
      [path.normalize('/'), 'elsewhere/lib/helpers/a.js'],
    ])(
      'maps files in a dynamic root %s, which ends in a separator, in both directions',
      (rootDir, rootRelativePath) => {
        const filePath = path.normalize('/elsewhere/lib/helpers/a.js');
        const pathname = `/[metro-watchFolders]/89abcdef/${rootRelativePath}`;
        const map = new ProjectRouteMap(config, () => [
          {id: '89abcdef', rootDir},
        ]);
        expect(map.urlPathnameOfFilePath(filePath)).toBe(pathname);
        expect(map.filePathOfUrlDecodedPathname(pathname)).toBe(filePath);
      },
    );

    test('reads dynamic roots on each use', () => {
      currentDynamicRoots = [];
      expect(
        dynamicRouteMap.filePathOfUrlDecodedPathname(
          '/[metro-watchFolders]/01234567/helpers/a.js',
        ),
      ).toBeNull();
      currentDynamicRoots = dynamicRoots;
      expect(
        dynamicRouteMap.filePathOfUrlDecodedPathname(
          '/[metro-watchFolders]/01234567/helpers/a.js',
        ),
      ).not.toBeNull();
    });
  });
});
