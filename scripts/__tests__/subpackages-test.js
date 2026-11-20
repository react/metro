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

import fs from 'node:fs';
import path from 'node:path';

const WORKSPACE_ROOT = path.resolve(__dirname, '../..');

const readJsonSync = (absOrRelativePath: string) =>
  JSON.parse(
    fs.readFileSync(path.resolve(WORKSPACE_ROOT, absOrRelativePath), 'utf-8'),
  );
const workspaceRootPackageJson = readJsonSync('package.json');

const ALL_PACKAGES: ReadonlySet<string> = new Set(
  Array.isArray(workspaceRootPackageJson.workspaces)
    ? workspaceRootPackageJson.workspaces
        .flatMap(relativeGlob =>
          fs.globSync(relativeGlob, {
            cwd: WORKSPACE_ROOT,
            withFileTypes: true as true,
          }),
        )
        .filter(dirent => dirent.isDirectory())
        .map(dirent =>
          path.relative(
            WORKSPACE_ROOT,
            path.join(dirent.parentPath, dirent.name),
          ),
        )
    : [],
);

const METRO_PACKAGE_VERSION = readJsonSync(
  'packages/metro/package.json',
).version;
const PUBLIC_PACKAGE_BASENAMES = new Set(
  [...ALL_PACKAGES.values()]
    .map(relativePath => relativePath.split(path.sep))
    .filter(parts => parts[0] !== 'private')
    .map(parts => parts.pop()),
);

test('workspaces are split into public and private directories', () => {
  expect(workspaceRootPackageJson.workspaces).toEqual([
    'packages/*',
    'private/*',
  ]);
});

test('workspaces are enumerated from root package.json', () => {
  expect(ALL_PACKAGES.size).toBeGreaterThan(0);
});

describe.each([...ALL_PACKAGES])('%s', packagePath => {
  let packageJson: {
    name: string,
    dependencies: {[key: string]: unknown},
    [key: string]: unknown,
  };

  beforeAll(() => {
    packageJson = JSON.parse(
      fs.readFileSync(
        path.resolve(WORKSPACE_ROOT, packagePath, 'package.json'),
        'utf-8',
      ),
    );
  });

  test('package name matches folder name', () => {
    expect(packageJson.name).toEqual(path.basename(packagePath));
  });

  test('uses the root "engines" spec', () => {
    expect(packageJson.engines).toEqual(workspaceRootPackageJson.engines);
  });

  test('all metro dependencies are fixed to the main version', () => {
    const dependencies = packageJson.dependencies ?? {};
    for (const [name, version] of Object.entries(dependencies)) {
      if (PUBLIC_PACKAGE_BASENAMES.has(name)) {
        expect(version).toEqual(METRO_PACKAGE_VERSION);
      }
    }
  });

  test('has a src/ folder', () => {
    expect(
      fs
        .lstatSync(path.resolve(WORKSPACE_ROOT, packagePath, 'src'))
        .isDirectory(),
    ).toBe(true);
  });

  test('use package.json#exports, exporting a main and package.json', () => {
    expect(packageJson.exports).toEqual(
      expect.objectContaining({
        ...(typeof packageJson.main === 'string'
          ? {
              '.': packageJson.main.startsWith('./')
                ? packageJson.main
                : './' + packageJson.main,
            }
          : null),
        './package.json': './package.json',
        './private/*': './src/*.js',
      }),
    );
  });

  test('all .flow.js files have an adjacent babel-registering entry point', async () => {
    const absolutePackageRoot = path.resolve(WORKSPACE_ROOT, packagePath);
    const filePaths = [];
    for await (const relativeFlowFile of fs.promises.glob('src/**/*.flow.js', {
      cwd: absolutePackageRoot,
      exclude: basename => basename === 'node_modules',
    })) {
      const flowFilePath = path.resolve(absolutePackageRoot, relativeFlowFile);
      filePaths.push({
        entryFilePath: flowFilePath.replace(/\.flow\.js$/, '.js'),
        flowFilePath,
      });
    }

    const unmatchedFlowFiles = filePaths
      .filter(({flowFilePath, entryFilePath}) => !fs.existsSync(entryFilePath))
      .map(
        ({flowFilePath}) =>
          path.relative(WORKSPACE_ROOT, flowFilePath) +
          ' has no adjacent .js file',
      );

    expect(unmatchedFlowFiles).toEqual([]);

    const entryFiles = await Promise.all(
      filePaths.map(async ({entryFilePath}) => {
        const content = await fs.promises.readFile(entryFilePath, 'utf-8');
        return {
          content,
          entryFilePath,
        };
      }),
    );
    for (const {content, entryFilePath} of entryFiles) {
      const flowFileBaseName = path.basename(entryFilePath, '.js') + '.flow';
      const endOfHeader = content.indexOf('*/\n') + 3;
      expect(endOfHeader).toBeGreaterThan(3);
      expect(content.slice(endOfHeader)).toEqual(`
/* eslint-disable import/no-commonjs */

'use strict';

/*::
export type * from './${flowFileBaseName}';
*/

try {
  require('metro-babel-register').unstable_registerForMetroMonorepo();
} catch {}

module.exports = require('./${flowFileBaseName}');
`);
    }
  });

  if (!packagePath.startsWith('private' + path.sep)) {
    describe('public package constraints', () => {
      test('does not have "private" in package.json', () => {
        expect(packageJson.private).toBeUndefined();
      });

      test('has prepare-release and cleanup-release scripts', () => {
        expect(packageJson.scripts).toEqual(
          expect.objectContaining({
            'cleanup-release': expect.any(String),
            'prepare-release': expect.any(String),
          }),
        );
      });
    });

    test('version matches Metro version', () => {
      expect(packageJson.version).toEqual(METRO_PACKAGE_VERSION);
    });

    test('has an .npmignore with expected entries', () => {
      const npmIgnorePath = path.resolve(
        WORKSPACE_ROOT,
        packagePath,
        '.npmignore',
      );
      expect(fs.existsSync(npmIgnorePath)).toBe(true);
      const lines = fs.readFileSync(npmIgnorePath, 'utf-8').split('\n');
      expect(lines).toEqual(
        expect.arrayContaining([
          '**/__mocks__/',
          '**/__tests__/',
          '/build/',
          '/src.real/',
          '/types/',
          'yarn.lock',
        ]),
      );
    });

    test('has a repository field with correct format', () => {
      expect(packageJson.repository).toEqual({
        type: 'git',
        url: 'git+https://github.com/react/metro.git',
        directory: packagePath.split(path.sep).filter(Boolean).join('/'),
      });
    });
  } else {
    describe('private package constraints', () => {
      test('has "private" in package.json', () => {
        expect(packageJson.private).toBe(true);
      });

      test('does not have a prepare-release or cleanup-release scripts', () => {
        expect(packageJson.scripts ?? {}).not.toHaveProperty('prepare-release');
        expect(packageJson.scripts ?? {}).not.toHaveProperty('cleanup-release');
      });

      test('has version 0.0.0', () => {
        expect(packageJson.version).toBe('0.0.0');
      });
    });
  }
});
