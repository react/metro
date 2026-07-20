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

'use strict';

import type {ResolverInputOptions} from '../../shared/types';
import type {TransformResultDependency} from '../types';
import type {InputConfigT} from 'metro-config';

const {getDefaultConfig, mergeConfig} = require('metro-config');
const {AmbiguousModuleResolutionError} = require('metro-core');
const {
  DuplicateHasteCandidatesError,
  default: {H: Haste},
} = require('metro-file-map');
const path = require('node:path');

const mockPlatform = process.platform;

jest.useRealTimers();
jest
  // It's noticeably faster to prevent running watchman from FileWatcher.
  .mock('node:child_process', () => ({}))
  .mock('node:os', () => ({
    ...jest.requireActual('node:os'),
    platform: () => 'test',
    tmpdir: () => (mockPlatform === 'win32' ? 'C:\\tmp' : '/tmp'),
    hostname: () => 'testhost',
    endianness: () => 'LE',
    release: () => '',
  }))
  .mock('graceful-fs', () => jest.requireMock('node:fs'))
  .spyOn(console, 'warn')
  .mockImplementation(() => {});

jest.setTimeout(10000);

let fs;
let resolver;

type MockFSDirContents = Readonly<{
  [name: string]: string | MockFSDirContents,
}>;

function dep(name: string): TransformResultDependency {
  return {
    name,
    data: {
      asyncType: null,
      isESMImport: false,
      key: name,
      locs: [],
    },
  };
}

['linux', 'win32'].forEach(osPlatform => {
  function setMockFileSystem(object: MockFSDirContents) {
    const root = p('/root');

    fs.mkdirSync(root);
    fs.mkdirSync(p('/tmp'));
    mockDir(root, object);
  }

  function mockFileImport(importStatement: string) {
    return `import foo from 'bar';\n${importStatement}\nimport bar from 'foo';`;
  }

  function mockDir(dirPath: string, desc: MockFSDirContents): void {
    for (const entName in desc) {
      const ent = desc[entName];

      const entPath = jest.requireMock('node:path').join(dirPath, entName);
      if (typeof ent === 'string') {
        fs.writeFileSync(entPath, ent);
        continue;
      }
      if (typeof ent !== 'object') {
        throw new Error(require('node:util').format('invalid entity:', ent));
      }
      fs.mkdirSync(entPath);
      mockDir(entPath, ent);
    }
  }

  const defaultConfig: InputConfigT = {
    resolver: {
      assetExts: ['png', 'jpg'],
      assetResolutions: ['1', '1.5', '2', '3', '4'],
      // This pattern is not expected to match anything.
      blockList: /.^/,
      nodeModulesPaths: [],
      platforms: ['ios', 'android'],
      resolverMainFields: ['react-native', 'browser', 'main'],
      sourceExts: ['js', 'json'],
      useWatchman: false,
    },
    watcher: {
      additionalExts: ['cjs', 'mjs'],
    },
    maxWorkers: 1,
    projectRoot: p('/root'),
    reporter: require('../../lib/reporting').nullReporter,
    transformer: {},
    watchFolders: [p('/root')],
  };

  async function createResolver(config: InputConfigT = {}, platform?: string) {
    const DependencyGraph = require('../../node-haste/DependencyGraph').default;
    const dependencyGraph = new DependencyGraph(
      mergeConfig(await getDefaultConfig(p('/root')), defaultConfig, config),
    );
    await dependencyGraph.ready();

    return {
      resolve: (
        from: string,
        dependency: TransformResultDependency,
        resolverOptions?: ResolverInputOptions = {dev: true},
        options: void | {assumeFlatNodeModules: boolean},
      ) =>
        dependencyGraph.resolveDependency(
          from,
          dependency,
          platform ?? null,
          resolverOptions,
          options,
        ),
      end: () => dependencyGraph.end(),
    };
  }

  function p(posixPath: string): string {
    if (osPlatform === 'win32') {
      return path.win32.join('C:\\', ...posixPath.split('/'));
    }

    return posixPath;
  }

  const joinPath = osPlatform === 'win32' ? path.win32.join : path.posix.join;

  describe(osPlatform, () => {
    let originalError = console.error;
    beforeEach(() => {
      jest.resetModules();

      Object.defineProperty(process, 'platform', {
        configurable: true,
        enumerable: true,
        value: osPlatform,
      });

      if (osPlatform === 'win32') {
        const mockPath = jest.requireActual<{win32: unknown}>('path');
        jest.mock('node:path', () => mockPath.win32);
        jest.mock(
          'node:fs',
          () => new (require('metro-memory-fs'))({platform: 'win32'}),
        );
      } else {
        jest.mock('node:path', () => jest.requireActual('node:path'));
        jest.mock('node:fs', () => new (require('metro-memory-fs'))());
      }

      // $FlowFixMe[cannot-write]
      jest.requireMock('node:os').tmpdir = () => p('/tmp');

      fs = jest.requireMock('node:fs');
      originalError = console.error;
      // $FlowFixMe[cannot-write]
      console.error = jest.fn((...args) => {
        // Silence expected errors that we assert on later
        if (
          typeof args[0] === 'string' &&
          args[0].startsWith('metro-file-map:')
        ) {
          return;
        }
        originalError(...args);
      });
    });

    afterEach(async () => {
      try {
        if (resolver) {
          await resolver.end();
        }
      } finally {
        // $FlowFixMe[cannot-write]
        console.error = originalError;
      }
    });

    describe('relative paths', () => {
      test('resolves standard relative paths with extension', async () => {
        setMockFileSystem({
          'index.js': '',
          'a.js': '',
        });

        resolver = await createResolver();

        expect(resolver.resolve(p('/root/index.js'), dep('./a.js'))).toEqual({
          type: 'sourceFile',
          filePath: p('/root/a.js'),
        });
      });

      test('resolves relative paths without extension', async () => {
        setMockFileSystem({
          'index.js': '',
          'a.js': '',
        });

        resolver = await createResolver();

        expect(resolver.resolve(p('/root/index.js'), dep('./a'))).toEqual({
          type: 'sourceFile',
          filePath: p('/root/a.js'),
        });
      });

      test('resolves extensions correctly', async () => {
        setMockFileSystem({
          'index.js': '',
          'a.js': '',
          'a.js.another': '',
        });

        resolver = await createResolver();

        expect(resolver.resolve(p('/root/index.js'), dep('./a'))).toEqual({
          type: 'sourceFile',
          filePath: p('/root/a.js'),
        });
      });

      test('resolves shorthand syntax for parent directory', async () => {
        setMockFileSystem({
          'index.js': '',
          'foo.js': '',
          folderA: {
            'foo.js': '',
            'index.js': '',
            folderB: {
              'foo.js': '',
              'index.js': '',
            },
          },
        });

        resolver = await createResolver();

        expect(
          resolver.resolve(p('/root/folderA/folderB/foo.js'), dep('..')),
        ).toEqual({type: 'sourceFile', filePath: p('/root/folderA/index.js')});
        expect(
          resolver.resolve(p('/root/folderA/folderB/index.js'), dep('..')),
        ).toEqual({type: 'sourceFile', filePath: p('/root/folderA/index.js')});
        expect(resolver.resolve(p('/root/folderA/foo.js'), dep('..'))).toEqual({
          type: 'sourceFile',
          filePath: p('/root/index.js'),
        });
      });

      test('resolves shorthand syntax for relative index module', async () => {
        setMockFileSystem({
          'index.js': '',
          'foo.js': '',
        });

        resolver = await createResolver();

        expect(resolver.resolve(p('/root/foo.js'), dep('.'))).toEqual({
          type: 'sourceFile',
          filePath: p('/root/index.js'),
        });
      });

      test('resolves shorthand syntax for nested relative index module with resolution cache', async () => {
        setMockFileSystem({
          'index.js': '',
          'foo.js': '',
          folderA: {
            'foo.js': '',
            'index.js': '',
          },
        });

        resolver = await createResolver();

        expect(resolver.resolve(p('/root/foo.js'), dep('.'))).toEqual({
          type: 'sourceFile',
          filePath: p('/root/index.js'),
        });
        expect(resolver.resolve(p('/root/folderA/foo.js'), dep('.'))).toEqual({
          type: 'sourceFile',
          filePath: p('/root/folderA/index.js'),
        });
      });

      test('resolves custom extensions in the correct order', async () => {
        setMockFileSystem({
          'index.js': '',
          'a.another': '',
          'a.js': '',
        });

        const {resolve, end} = await createResolver({
          resolver: {sourceExts: ['another', 'js']},
        });
        expect(resolve(p('/root/index.js'), dep('./a'))).toEqual({
          type: 'sourceFile',
          filePath: p('/root/a.another'),
        });
        await end();

        resolver = await createResolver({
          resolver: {sourceExts: ['js', 'another']},
        });
        expect(resolver.resolve(p('/root/index.js'), dep('./a'))).toEqual({
          type: 'sourceFile',
          filePath: p('/root/a.js'),
        });
      });

      test('fails when trying to implicitly require an extension not listed in sourceExts', async () => {
        setMockFileSystem({
          'index.js': mockFileImport("import root from './a.another';"),
          'a.another': '',
        });

        resolver = await createResolver();
        expect(() =>
          resolver.resolve(p('/root/index.js'), dep('./a.another')),
        ).toThrowErrorMatchingSnapshot();
      });

      test('resolves relative paths on different folders', async () => {
        setMockFileSystem({
          'index.js': '',
          folder: {
            'foo.js': '',
            'index.js': '',
          },
        });

        resolver = await createResolver();
        expect(
          resolver.resolve(p('/root/index.js'), dep('./folder/foo')),
        ).toEqual({
          type: 'sourceFile',
          filePath: p('/root/folder/foo.js'),
        });
        expect(resolver.resolve(p('/root/index.js'), dep('./folder'))).toEqual({
          type: 'sourceFile',
          filePath: p('/root/folder/index.js'),
        });
        expect(resolver.resolve(p('/root/index.js'), dep('./folder/'))).toEqual(
          {
            type: 'sourceFile',
            filePath: p('/root/folder/index.js'),
          },
        );
      });

      test('resolves files when there is a folder with the same name', async () => {
        setMockFileSystem({
          'index.js': '',
          folder: {
            'index.js': '',
          },
          'folder.js': '',
        });

        resolver = await createResolver();
        expect(resolver.resolve(p('/root/index.js'), dep('./folder'))).toEqual({
          type: 'sourceFile',
          filePath: p('/root/folder.js'),
        });
        expect(
          resolver.resolve(p('/root/index.js'), dep('./folder.js')),
        ).toEqual({
          type: 'sourceFile',
          filePath: p('/root/folder.js'),
        });
      });

      describe('with additional files included in the file map (watcher.additionalExts)', () => {
        test('resolves modules outside sourceExts when required explicitly', async () => {
          setMockFileSystem({
            'index.js': mockFileImport("import a from './a.cjs';"),
            'a.cjs': '',
          });

          resolver = await createResolver({
            resolver: {
              sourceExts: ['js', 'json'],
            },
            watcher: {
              additionalExts: ['cjs'],
            },
          });
          expect(resolver.resolve(p('/root/index.js'), dep('./a.cjs'))).toEqual(
            {
              type: 'sourceFile',
              filePath: p('/root/a.cjs'),
            },
          );
        });

        test('fails when implicitly requiring a file outside sourceExts', async () => {
          setMockFileSystem({
            'index.js': mockFileImport("import a from './a';"),
            'a.cjs': '',
          });

          resolver = await createResolver({
            resolver: {
              sourceExts: ['js', 'json'],
            },
            watcher: {
              additionalExts: ['cjs'],
            },
          });
          expect(() =>
            resolver.resolve(p('/root/index.js'), dep('./a')),
          ).toThrowErrorMatchingSnapshot();
        });
      });
    });

    describe('absolute paths', () => {
      test('supports requiring absolute paths', async () => {
        setMockFileSystem({
          'index.js': '',
          folder: {
            'index.js': '',
          },
        });

        resolver = await createResolver();
        expect(
          resolver.resolve(
            p('/root/index.js'),
            dep(p('/root/folder/index.js')),
          ),
        ).toEqual({type: 'sourceFile', filePath: p('/root/folder/index.js')});
      });
    });

    describe('packages in node_modules/', () => {
      test('resolves package.json files as normal modules', async () => {
        setMockFileSystem({
          'index.js': '',
          'package.json': JSON.stringify({name: 'package'}),
        });

        resolver = await createResolver();
        expect(
          resolver.resolve(p('/root/index.js'), dep('./package.json')),
        ).toEqual({type: 'sourceFile', filePath: p('/root/package.json')});
      });

      test('finds nested packages in node_modules', async () => {
        setMockFileSystem({
          'index.js': mockFileImport("import qux from 'qux';"),
          node_modules: {
            foo: {
              'package.json': JSON.stringify({name: 'foo'}),
              'index.js': '',
              node_modules: {
                bar: {
                  'package.json': JSON.stringify({name: 'bar'}),
                  'index.js': '',
                },
                qux: {
                  'package.json': JSON.stringify({name: 'bar'}),
                  'index.js': '',
                },
              },
            },
            bar: {
              'package.json': JSON.stringify({name: 'bar'}),
              'index.js': '',
            },
            baz: {
              'package.json': JSON.stringify({name: 'baz'}),
              'index.js': '',
            },
          },
        });

        resolver = await createResolver();
        expect(resolver.resolve(p('/root/index.js'), dep('bar'))).toEqual({
          type: 'sourceFile',
          filePath: p('/root/node_modules/bar/index.js'),
        });
        expect(() =>
          resolver.resolve(p('/root/index.js'), dep('qux')),
        ).toThrowErrorMatchingSnapshot();
        expect(
          resolver.resolve(p('/root/node_modules/foo/index.js'), dep('bar')),
        ).toEqual({
          type: 'sourceFile',
          filePath: p('/root/node_modules/foo/node_modules/bar/index.js'),
        });
        expect(
          resolver.resolve(p('/root/node_modules/foo/index.js'), dep('baz')),
        ).toEqual({
          type: 'sourceFile',
          filePath: p('/root/node_modules/baz/index.js'),
        });
      });

      test('can require specific files inside a package', async () => {
        setMockFileSystem({
          'index.js': '',
          node_modules: {
            foo: {
              'package.json': JSON.stringify({name: 'foo'}),
              'index.js': '',
              lib: {'foo.js': '', 'index.js': ''},
            },
          },
        });

        resolver = await createResolver();
        expect(
          resolver.resolve(p('/root/index.js'), dep('foo/lib/foo')),
        ).toEqual({
          type: 'sourceFile',
          filePath: p('/root/node_modules/foo/lib/foo.js'),
        });
        expect(resolver.resolve(p('/root/index.js'), dep('foo/lib'))).toEqual({
          type: 'sourceFile',
          filePath: p('/root/node_modules/foo/lib/index.js'),
        });
      });

      test('finds the appropiate node_modules folder', async () => {
        setMockFileSystem({
          node_modules: {
            foo: {
              'package.json': JSON.stringify({name: 'foo'}),
              'index.js': '',
            },
          },
          lib: {
            'index.js': '',
            subfolder: {
              anotherSubfolder: {'index.js': ''},
              node_modules: {
                foo: {
                  'package.json': JSON.stringify({name: 'foo'}),
                  'index.js': '',
                },
              },
            },
          },
        });

        resolver = await createResolver();
        expect(resolver.resolve(p('/root/lib/index.js'), dep('foo'))).toEqual({
          type: 'sourceFile',
          filePath: p('/root/node_modules/foo/index.js'),
        });
        expect(
          resolver.resolve(
            p('/root/lib/subfolder/anotherSubfolder/index.js'),
            dep('foo'),
          ),
        ).toEqual({
          type: 'sourceFile',
          filePath: p('/root/lib/subfolder/node_modules/foo/index.js'),
        });
      });

      test('caches the closest node_modules folder if a flat layout is assumed', async () => {
        setMockFileSystem({
          node_modules: {
            foo: {
              'package.json': JSON.stringify({name: 'foo'}),
              'index.js': '',
            },
          },
          lib: {
            'index.js': '',
            subfolder: {
              anotherSubfolder: {'index.js': ''},
              node_modules: {
                foo: {
                  'package.json': JSON.stringify({name: 'foo'}),
                  'index.js': '',
                },
              },
            },
          },
        });

        resolver = await createResolver();
        expect(
          resolver.resolve(p('/root/lib/index.js'), dep('foo'), undefined, {
            assumeFlatNodeModules: true,
          }),
        ).toEqual({
          type: 'sourceFile',
          filePath: p('/root/node_modules/foo/index.js'),
        });
        expect(
          resolver.resolve(
            p('/root/lib/subfolder/anotherSubfolder/index.js'),
            dep('foo'),
            undefined,
            {assumeFlatNodeModules: true},
          ),
        ).toEqual({
          type: 'sourceFile',
          filePath: p('/root/node_modules/foo/index.js'),
        });
      });

      test('works with packages with a .js extension', async () => {
        setMockFileSystem({
          'index.js': '',
          node_modules: {
            'sha.js': {
              'package.json': JSON.stringify({name: 'sha.js'}),
              'index.js': '',
            },
          },
        });

        resolver = await createResolver();
        expect(resolver.resolve(p('/root/index.js'), dep('sha.js'))).toEqual({
          type: 'sourceFile',
          filePath: p('/root/node_modules/sha.js/index.js'),
        });
      });

      test('works with one-character packages', async () => {
        setMockFileSystem({
          'index.js': '',
          node_modules: {
            Y: {
              'package.json': JSON.stringify({name: 'Y'}),
              'index.js': '',
            },
          },
        });

        resolver = await createResolver();
        expect(resolver.resolve(p('/root/index.js'), dep('Y'))).toEqual({
          type: 'sourceFile',
          filePath: p('/root/node_modules/Y/index.js'),
        });
      });

      test('uses the folder name and not the name in the package.json', async () => {
        setMockFileSystem({
          'index.js': mockFileImport(
            "import * as invalidName from 'invalidName';",
          ),
          node_modules: {
            foo: {
              'package.json': JSON.stringify({name: 'invalidName'}),
              'index.js': '',
            },
          },
        });

        resolver = await createResolver();

        // TODO: Should we fail here?
        expect(resolver.resolve(p('/root/index.js'), dep('foo'))).toEqual({
          type: 'sourceFile',
          filePath: p('/root/node_modules/foo/index.js'),
        });
        expect(() =>
          resolver.resolve(p('/root/index.js'), dep('invalidName')),
        ).toThrowErrorMatchingSnapshot();
      });

      test('fails if there is no package.json', async () => {
        setMockFileSystem({
          'index.js': '',
          node_modules: {
            foo: {
              'index.js': '',
            },
          },
        });

        resolver = await createResolver();

        // TODO: Is this behaviour correct?
        expect(resolver.resolve(p('/root/index.js'), dep('foo'))).toEqual({
          type: 'sourceFile',
          filePath: p('/root/node_modules/foo/index.js'),
        });
      });

      test('resolves main package module to index.js by default', async () => {
        setMockFileSystem({
          'index.js': '',
          node_modules: {
            aPackage: {
              'package.json': JSON.stringify({name: 'aPackage'}),
              'index.js': '',
            },
          },
        });

        resolver = await createResolver();
        expect(resolver.resolve(p('/root/index.js'), dep('aPackage'))).toEqual({
          type: 'sourceFile',
          filePath: p('/root/node_modules/aPackage/index.js'),
        });
      });

      test('resolves main field correctly if it is a folder', async () => {
        setMockFileSystem({
          'index.js': '',
          node_modules: {
            aPackage: {
              'package.json': JSON.stringify({
                name: 'aPackage',
                main: 'lib/',
              }),
              lib: {
                'index.js': '',
              },
            },
          },
        });

        resolver = await createResolver();
        expect(resolver.resolve(p('/root/index.js'), dep('aPackage'))).toEqual({
          type: 'sourceFile',
          filePath: p('/root/node_modules/aPackage/lib/index.js'),
        });
      });

      test('resolves main field correctly for a fully specified module included by watcher.additionalExts', async () => {
        setMockFileSystem({
          'index.js': '',
          node_modules: {
            foo: {
              'package.json': JSON.stringify({
                name: 'foo',
                main: './main.cjs',
              }),
              'main.cjs': '',
            },
          },
        });

        resolver = await createResolver({
          watcher: {
            additionalExts: ['cjs'],
          },
        });
        expect(resolver.resolve(p('/root/index.js'), dep('foo'))).toEqual({
          type: 'sourceFile',
          filePath: p('/root/node_modules/foo/main.cjs'),
        });
      });

      test('allows package names with dots', async () => {
        setMockFileSystem({
          'index.js': '',
          node_modules: {
            'leftpad.js': {
              'package.json': JSON.stringify({name: 'leftpad.js'}),
              'index.js': '',
            },
            'x.y.z': {
              'package.json': JSON.stringify({name: 'x.y.z'}),
              'index.js': '',
            },
          },
        });

        resolver = await createResolver();
        expect(
          resolver.resolve(p('/root/index.js'), dep('leftpad.js')),
        ).toEqual({
          type: 'sourceFile',
          filePath: p('/root/node_modules/leftpad.js/index.js'),
        });
        expect(resolver.resolve(p('/root/index.js'), dep('x.y.z'))).toEqual({
          type: 'sourceFile',
          filePath: p('/root/node_modules/x.y.z/index.js'),
        });
      });

      test('allows relative requires against packages', async () => {
        setMockFileSystem({
          'index.js': '',
          node_modules: {
            aPackage: {
              'package.json': JSON.stringify({
                name: 'aPackage',
                main: 'main',
              }),
              'main.js': '',
            },
          },
        });

        resolver = await createResolver();
        expect(
          resolver.resolve(p('/root/index.js'), dep('./node_modules/aPackage')),
        ).toEqual({
          type: 'sourceFile',
          filePath: p('/root/node_modules/aPackage/main.js'),
        });
      });

      test('allows to require package sub-dirs', async () => {
        // $FlowFixMe[cannot-write]
        console.warn = jest.fn();
        setMockFileSystem({
          'index.js': '',
          node_modules: {
            aPackage: {
              'package.json': JSON.stringify({name: 'aPackage'}),
              lib: {foo: {'bar.js': ''}},
            },
          },
        });

        resolver = await createResolver();
        expect(
          resolver.resolve(p('/root/index.js'), dep('aPackage/lib/foo/bar')),
        ).toEqual({
          type: 'sourceFile',
          filePath: p('/root/node_modules/aPackage/lib/foo/bar.js'),
        });
      });

      ['browser', 'react-native'].forEach(browserField => {
        describe(`${browserField} field in package.json`, () => {
          test('supports simple field', async () => {
            setMockFileSystem({
              'index.js': '',
              node_modules: {
                aPackage: {
                  'package.json': JSON.stringify({
                    name: 'aPackage',
                    // $FlowFixMe[invalid-computed-prop]
                    [browserField as string]: 'client.js',
                  }),
                  'client.js': '',
                },
              },
            });

            resolver = await createResolver();
            expect(
              resolver.resolve(p('/root/index.js'), dep('aPackage')),
            ).toEqual({
              type: 'sourceFile',
              filePath: p('/root/node_modules/aPackage/client.js'),
            });
          });

          test('overrides the main field', async () => {
            setMockFileSystem({
              'index.js': '',
              node_modules: {
                aPackage: {
                  'package.json': JSON.stringify({
                    name: 'aPackage',
                    main: 'another.js',
                    // $FlowFixMe[invalid-computed-prop]
                    [browserField as string]: 'client.js',
                  }),
                  'client.js': '',
                },
              },
            });

            resolver = await createResolver();
            expect(
              resolver.resolve(p('/root/index.js'), dep('aPackage')),
            ).toEqual({
              type: 'sourceFile',
              filePath: p('/root/node_modules/aPackage/client.js'),
            });
          });

          test('can omit file extension', async () => {
            setMockFileSystem({
              'index.js': '',
              node_modules: {
                aPackage: {
                  'package.json': JSON.stringify({
                    name: 'aPackage',
                    // $FlowFixMe[invalid-computed-prop]
                    [browserField as string]: 'client',
                  }),
                  'client.js': '',
                },
              },
            });

            resolver = await createResolver();
            expect(
              resolver.resolve(p('/root/index.js'), dep('aPackage')),
            ).toEqual({
              type: 'sourceFile',
              filePath: p('/root/node_modules/aPackage/client.js'),
            });
          });

          test('resolves mappings from external calls', async () => {
            setMockFileSystem({
              'index.js': '',
              node_modules: {
                aPackage: {
                  'package.json': JSON.stringify({
                    name: 'aPackage',
                    main: 'main.js',
                    // $FlowFixMe[invalid-computed-prop]
                    [browserField as string]: {'main.js': 'client.js'},
                  }),
                  'client.js': '',
                  'main.js': '',
                },
              },
            });

            resolver = await createResolver();
            expect(
              resolver.resolve(p('/root/index.js'), dep('aPackage')),
            ).toEqual({
              type: 'sourceFile',
              filePath: p('/root/node_modules/aPackage/client.js'),
            });
            // TODO: Is this behaviour correct?
            expect(
              resolver.resolve(p('/root/index.js'), dep('aPackage/main.js')),
            ).toEqual({
              type: 'sourceFile',
              filePath: p('/root/node_modules/aPackage/main.js'),
            });
          });

          test('resolves mappings without extensions', async () => {
            setMockFileSystem({
              'index.js': '',
              node_modules: {
                aPackage: {
                  'package.json': JSON.stringify({
                    name: 'aPackage',
                    main: 'main.js',
                    // $FlowFixMe[invalid-computed-prop]
                    [browserField as string]: {'./main': './client'},
                  }),
                  'client.js': '',
                  'main.js': '',
                },
              },
            });

            resolver = await createResolver();
            expect(
              resolver.resolve(p('/root/index.js'), dep('aPackage')),
            ).toEqual({
              type: 'sourceFile',
              filePath: p('/root/node_modules/aPackage/client.js'),
            });
            expect(
              resolver.resolve(p('/root/index.js'), dep('aPackage/main')),
            ).toEqual({
              type: 'sourceFile',
              filePath: p('/root/node_modules/aPackage/client.js'),
            });
          });

          test('resolves mappings from internal calls', async () => {
            setMockFileSystem({
              'index.js': '',
              node_modules: {
                aPackage: {
                  'package.json': JSON.stringify({
                    name: 'aPackage',
                    main: 'main.js',
                    // $FlowFixMe[invalid-computed-prop]
                    [browserField as string]: {
                      './main.js': 'main-client.js',
                      'foo.js': 'foo-client.js',
                      './dir/file.js': 'dir/file-client.js',
                      './dir': 'dir/file-client.js',
                    },
                  }),
                  'index.js': mockFileImport("import f from './foo.js';"),
                  'main-client.js': '',
                  'foo-client.js': '',
                  dir: {
                    'index.js': '',
                    'file-client.js': '',
                  },
                },
              },
            });

            resolver = await createResolver();

            expect(
              resolver.resolve(
                p('/root/node_modules/aPackage/index.js'),
                dep('./main.js'),
              ),
            ).toEqual({
              type: 'sourceFile',
              filePath: p('/root/node_modules/aPackage/main-client.js'),
            });
            // TODO: Is this behaviour correct?
            expect(() =>
              resolver.resolve(
                p('/root/node_modules/aPackage/index.js'),
                dep('./foo.js'),
              ),
            ).toThrowErrorMatchingSnapshot();
            expect(
              resolver.resolve(
                p('/root/node_modules/aPackage/index.js'),
                dep('./dir/file'),
              ),
            ).toEqual({
              type: 'sourceFile',
              filePath: p('/root/node_modules/aPackage/dir/file-client.js'),
            });
            expect(
              resolver.resolve(
                p('/root/node_modules/aPackage/index.js'),
                dep('./dir'),
              ),
            ).toEqual({
              type: 'sourceFile',
              filePath: p('/root/node_modules/aPackage/dir/file-client.js'),
            });
            // TODO: Is this behaviour correct?
            expect(
              resolver.resolve(
                p('/root/node_modules/aPackage/index.js'),
                dep('./dir/index'),
              ),
            ).toEqual({
              type: 'sourceFile',
              filePath: p('/root/node_modules/aPackage/dir/index.js'),
            });
            expect(
              resolver.resolve(
                p('/root/node_modules/aPackage/dir/index.js'),
                dep('../main'),
              ),
            ).toEqual({
              type: 'sourceFile',
              filePath: p('/root/node_modules/aPackage/main-client.js'),
            });
          });

          test('resolves mappings to other packages', async () => {
            setMockFileSystem({
              node_modules: {
                aPackage: {
                  'package.json': JSON.stringify({
                    name: 'aPackage',
                    // $FlowFixMe[invalid-computed-prop]
                    [browserField as string]: {
                      'left-pad': 'left-pad-browser',
                    },
                  }),
                  'index.js': mockFileImport(
                    "import main from 'left-pad/main';",
                  ),
                },
                'left-pad-browser': {
                  'package.json': JSON.stringify({
                    name: 'left-pad-browser',
                    // $FlowFixMe[invalid-computed-prop]
                    [browserField as string]: {'./main.js': 'main-client'},
                  }),
                  'index.js': '',
                  'main-client.js': '',
                },
              },
            });

            resolver = await createResolver();

            expect(
              resolver.resolve(
                p('/root/node_modules/aPackage/index.js'),
                dep('left-pad'),
              ),
            ).toEqual({
              type: 'sourceFile',
              filePath: p('/root/node_modules/left-pad-browser/index.js'),
            });
            // TODO: Is this behaviour expected?
            expect(() =>
              resolver.resolve(
                p('/root/node_modules/aPackage/index.js'),
                dep('left-pad/main'),
              ),
            ).toThrowErrorMatchingSnapshot();
          });

          test('supports mapping a package to a file', async () => {
            setMockFileSystem({
              node_modules: {
                aPackage: {
                  'package.json': JSON.stringify({
                    name: 'aPackage',
                    // $FlowFixMe[invalid-computed-prop]
                    [browserField as string]: {
                      'left-pad': './left-pad-browser',
                    },
                  }),
                  'index.js': '',
                  './left-pad-browser.js': '',
                },
              },
            });

            resolver = await createResolver();

            expect(
              resolver.resolve(
                p('/root/node_modules/aPackage/index.js'),
                dep('left-pad'),
              ),
            ).toEqual({
              type: 'sourceFile',
              filePath: p('/root/node_modules/aPackage/left-pad-browser.js'),
            });
          });

          test('supports excluding a package', async () => {
            setMockFileSystem({
              'emptyModule.js': '',
              'index.js': '',
              node_modules: {
                aPackage: {
                  'package.json': JSON.stringify({
                    name: 'aPackage',
                    // $FlowFixMe[invalid-computed-prop]
                    [browserField as string]: {
                      'left-pad': false,
                    },
                  }),
                  'index.js': '',
                },
                'left-pad': {
                  'package.json': JSON.stringify({
                    name: 'left-pad',
                  }),
                  'index.js': '',
                  'foo.js': '',
                },
              },
            });

            resolver = await createResolver({
              resolver: {emptyModulePath: p('/root/emptyModule.js')},
            });

            expect(
              resolver.resolve(
                p('/root/node_modules/aPackage/index.js'),
                dep('left-pad'),
              ),
            ).toEqual({
              type: 'sourceFile',
              filePath: p('/root/emptyModule.js'),
            });
            // Existing limitation: Subpaths of a package are not redirected by
            // a base package name redirection in "browser"
            expect(
              resolver.resolve(
                p('/root/node_modules/aPackage/index.js'),
                dep('left-pad/foo'),
              ),
            ).toEqual({
              type: 'sourceFile',
              filePath: p('/root/node_modules/left-pad/foo.js'),
            });
          });

          test('supports excluding a package when the empty module is a relative path', async () => {
            setMockFileSystem({
              'emptyModule.js': '',
              'index.js': '',
              node_modules: {
                aPackage: {
                  'package.json': JSON.stringify({
                    name: 'aPackage',
                    // $FlowFixMe[invalid-computed-prop]
                    [browserField as string]: {
                      './foo.js': false,
                    },
                  }),
                  'index.js': '',
                },
              },
            });

            resolver = await createResolver({
              resolver: {emptyModulePath: './emptyModule.js'},
            });

            expect(
              resolver.resolve(
                p('/root/node_modules/aPackage/index.js'),
                dep('./foo'),
              ),
            ).toEqual({
              type: 'sourceFile',
              filePath: p('/root/emptyModule.js'),
            });
            expect(
              resolver.resolve(p('/root/index.js'), dep('aPackage/foo')),
            ).toEqual({
              type: 'sourceFile',
              filePath: p('/root/emptyModule.js'),
            });
            expect(
              resolver.resolve(p('/root/index.js'), dep('aPackage/foo.js')),
            ).toEqual({
              type: 'sourceFile',
              filePath: p('/root/emptyModule.js'),
            });
          });
        });
      });

      test('uses react-native field before browser field', async () => {
        setMockFileSystem({
          node_modules: {
            aPackage: {
              'package.json': JSON.stringify({
                name: 'aPackage',
                'react-native': {'left-pad': './left-pad-react-native'},
                browser: {'left-pad': './left-pad-browser'},
              }),
              'index.js': '',
              './left-pad-react-native.js': '',
            },
          },
        });

        resolver = await createResolver();

        expect(
          resolver.resolve(
            p('/root/node_modules/aPackage/index.js'),
            dep('left-pad'),
          ),
        ).toEqual({
          type: 'sourceFile',
          filePath: p('/root/node_modules/aPackage/left-pad-react-native.js'),
        });
      });

      test('works with custom main fields', async () => {
        setMockFileSystem({
          node_modules: {
            aPackage: {
              'package.json': JSON.stringify({
                name: 'aPackage',
                'custom-field': {'left-pad': './left-pad-custom'},
                browser: {'left-pad': './left-pad-browser'},
              }),
              'index.js': '',
              './left-pad-custom.js': '',
            },
          },
        });

        resolver = await createResolver({
          resolver: {resolverMainFields: ['custom-field', 'browser']},
        });

        expect(
          resolver.resolve(
            p('/root/node_modules/aPackage/index.js'),
            dep('left-pad'),
          ),
        ).toEqual({
          type: 'sourceFile',
          filePath: p('/root/node_modules/aPackage/left-pad-custom.js'),
        });
      });

      test('merges custom main fields', async () => {
        setMockFileSystem({
          node_modules: {
            aPackage: {
              'package.json': JSON.stringify({
                name: 'aPackage',
                'custom-field': {'left-pad': './left-pad-custom'},
                browser: {jest: './jest-browser'},
              }),
              'index.js': '',
              './left-pad-custom.js': '',
              './jest-browser.js': '',
            },
          },
        });

        resolver = await createResolver({
          resolver: {resolverMainFields: ['custom-field', 'browser']},
        });

        expect(
          resolver.resolve(
            p('/root/node_modules/aPackage/index.js'),
            dep('left-pad'),
          ),
        ).toEqual({
          type: 'sourceFile',
          filePath: p('/root/node_modules/aPackage/left-pad-custom.js'),
        });
        expect(
          resolver.resolve(
            p('/root/node_modules/aPackage/index.js'),
            dep('jest'),
          ),
        ).toEqual({
          type: 'sourceFile',
          filePath: p('/root/node_modules/aPackage/jest-browser.js'),
        });
      });

      test('uses main attribute from custom main fields', async () => {
        setMockFileSystem({
          'index.js': '',
          node_modules: {
            aPackage: {
              'package.json': JSON.stringify({
                name: 'aPackage',
                'custom-field': './main-custom',
              }),
              './main-custom.js': '',
            },
          },
        });

        resolver = await createResolver({
          resolver: {resolverMainFields: ['custom-field']},
        });
        expect(
          resolver.resolve(p('/root/node_modules/index.js'), dep('aPackage')),
        ).toEqual({
          type: 'sourceFile',
          filePath: p('/root/node_modules/aPackage/main-custom.js'),
        });
      });
    });

    describe('platforms', () => {
      test('resolves platform-specific files', async () => {
        setMockFileSystem({
          'index.js': mockFileImport("import f from './foo.js';"),
          'foo.ios.js': '',
        });

        resolver = await createResolver({}, 'ios');

        expect(resolver.resolve(p('/root/index.js'), dep('./foo'))).toEqual({
          type: 'sourceFile',
          filePath: p('/root/foo.ios.js'),
        });
        // TODO: Is this behaviour expected?
        expect(() =>
          resolver.resolve(p('/root/index.js'), dep('./foo.js')),
        ).toThrowErrorMatchingSnapshot();
        expect(
          resolver.resolve(p('/root/index.js'), dep('./foo.ios.js')),
        ).toEqual({
          type: 'sourceFile',
          filePath: p('/root/foo.ios.js'),
        });
      });

      test('takes precedence over non-platform files', async () => {
        setMockFileSystem({
          'index.js': '',
          'foo.ios.js': '',
          'foo.js': '',
        });

        resolver = await createResolver({}, 'ios');

        expect(resolver.resolve(p('/root/index.js'), dep('./foo'))).toEqual({
          type: 'sourceFile',
          filePath: p('/root/foo.ios.js'),
        });
        // TODO: Is this behaviour expected?
        expect(resolver.resolve(p('/root/index.js'), dep('./foo.js'))).toEqual({
          type: 'sourceFile',
          filePath: p('/root/foo.js'),
        });
        expect(
          resolver.resolve(p('/root/index.js'), dep('./foo.ios.js')),
        ).toEqual({
          type: 'sourceFile',
          filePath: p('/root/foo.ios.js'),
        });
      });

      test('resolves platforms on folder index files', async () => {
        setMockFileSystem({
          'index.js': '',
          dir: {
            'index.ios.js': '',
          },
        });

        resolver = await createResolver({}, 'ios');
        expect(
          resolver.resolve(p('/root/index.js'), dep('./dir/index')),
        ).toEqual({
          type: 'sourceFile',
          filePath: p('/root/dir/index.ios.js'),
        });
        expect(resolver.resolve(p('/root/index.js'), dep('./dir'))).toEqual({
          type: 'sourceFile',
          filePath: p('/root/dir/index.ios.js'),
        });
      });

      test('resolves platforms on the main field of node_modules packages', async () => {
        setMockFileSystem({
          'index.js': '',
          node_modules: {
            foo: {
              'package.json': JSON.stringify({
                name: 'foo',
                main: './main',
              }),
              'main.ios.js': '',
            },
          },
        });

        resolver = await createResolver({}, 'ios');
        expect(resolver.resolve(p('/root/index.js'), dep('foo'))).toEqual({
          type: 'sourceFile',
          filePath: p('/root/node_modules/foo/main.ios.js'),
        });
      });

      test('does not resolve when the main field of node_modules packages when it has the extension', async () => {
        setMockFileSystem({
          'index.js': '',
          node_modules: {
            foo: {
              'package.json': JSON.stringify({
                name: 'foo',
                main: './main.js',
              }),
              'main.ios.js': '',
            },
          },
        });

        resolver = await createResolver({}, 'ios');

        // TODO: Is this behaviour expected?
        expect(() =>
          resolver.resolve(p('/root/index.js'), dep('foo')),
        ).toThrow();
      });

      test('does not resolve when the browser mappings of node_modules packages', async () => {
        setMockFileSystem({
          'index.js': '',
          node_modules: {
            foo: {
              'package.json': JSON.stringify({
                name: 'foo',
                browser: {
                  bar: './bar-client',
                },
              }),
              'bar-client.ios.js': '',
            },
          },
        });

        resolver = await createResolver({}, 'ios');

        // TODO: Is this behaviour expected?
        expect(() =>
          resolver.resolve(p('/root/index.js'), dep('foo/bar')),
        ).toThrow();
      });

      test('supports custom platforms even if they are not configured', async () => {
        setMockFileSystem({
          'index.js': '',
          'foo.playstation.js': '',
          'foo.xbox.js': '',
        });

        const {resolve, end} = await createResolver(
          {resolver: {platforms: ['playstation']}},
          'playstation',
        );
        expect(resolve(p('/root/index.js'), dep('./foo'))).toEqual({
          type: 'sourceFile',
          filePath: p('/root/foo.playstation.js'),
        });
        await end();

        resolver = await createResolver(
          {resolver: {platforms: ['playstation']}},
          'xbox',
        );
        // TODO: Is this behaviour expected?
        expect(resolver.resolve(p('/root/index.js'), dep('./foo'))).toEqual({
          type: 'sourceFile',
          filePath: p('/root/foo.xbox.js'),
        });
      });
    });

    describe('assets', () => {
      test('resolves a standard asset', async () => {
        setMockFileSystem({
          'index.js': '',
          'asset.png': '',
        });

        resolver = await createResolver();
        expect(
          resolver.resolve(p('/root/index.js'), dep('./asset.png')),
        ).toEqual({
          type: 'sourceFile',
          filePath: p('/root/asset.png'),
        });
      });

      test('resolves asset files with resolution suffixes (matching size)', async () => {
        setMockFileSystem({
          'index.js': mockFileImport("import a from './a@1.5x.png';"),
          'a@1.5x.png': '',
          'c.png': '',
          'c@2x.png': '',
        });

        resolver = await createResolver();

        expect(resolver.resolve(p('/root/index.js'), dep('./a.png'))).toEqual({
          type: 'sourceFile',
          filePath: p('/root/a@1.5x.png'),
        });
        expect(() =>
          resolver.resolve(p('/root/index.js'), dep('./a@1.5x.png')),
        ).toThrowErrorMatchingSnapshot();
      });

      test('resolves asset files with resolution suffixes (matching exact)', async () => {
        setMockFileSystem({
          'index.js': mockFileImport("import a from './c@2x.png';"),
          'a@1.5x.png': '',
          'c.png': '',
          'c@2x.png': '',
        });

        resolver = await createResolver();

        expect(resolver.resolve(p('/root/index.js'), dep('./c.png'))).toEqual({
          type: 'sourceFile',
          filePath: p('/root/c.png'),
        });
        expect(() =>
          resolver.resolve(p('/root/index.js'), dep('./c@2x.png')),
        ).toThrowErrorMatchingSnapshot();
      });

      test('checks asset extensions case insensitively', async () => {
        setMockFileSystem({
          'index.js': mockFileImport("import a from './asset.PNG';"),
          'asset.PNG': '',
        });

        resolver = await createResolver();

        // TODO: Is this behaviour correct?
        expect(() =>
          resolver.resolve(p('/root/index.js'), dep('./asset.PNG')),
        ).toThrowErrorMatchingSnapshot();
      });

      test('resolves custom asset extensions when overriding assetExts', async () => {
        setMockFileSystem({
          'index.js': mockFileImport("import a from './asset2.png';"),
          'asset1.ast': '',
          'asset2.png': '',
        });

        resolver = await createResolver({resolver: {assetExts: ['ast']}});

        expect(
          resolver.resolve(p('/root/index.js'), dep('./asset1.ast')),
        ).toEqual({
          type: 'sourceFile',
          filePath: p('/root/asset1.ast'),
        });
        expect(() =>
          resolver.resolve(p('/root/index.js'), dep('./asset2.png')),
        ).toThrowErrorMatchingSnapshot();
      });

      test('resolves assets from packages in node_modules', async () => {
        setMockFileSystem({
          folder: {'index.js': ''},
          node_modules: {
            foo: {
              'package.json': JSON.stringify({name: 'foo'}),
              'asset.png': '',
            },
          },
        });

        resolver = await createResolver();

        expect(
          resolver.resolve(p('/root/folder/index.js'), dep('foo/asset.png')),
        ).toEqual({
          type: 'sourceFile',
          filePath: p('/root/node_modules/foo/asset.png'),
        });
      });
    });

    describe('global packages', () => {
      describe('explicitly enabled', () => {
        const config = {
          resolver: {
            enableGlobalPackages: true,
          },
        };
        test('treats any folder with a package.json as a global package', async () => {
          setMockFileSystem({
            'index.js': '',
            aPackage: {
              'package.json': JSON.stringify({
                name: 'aPackage',
                main: 'main.js',
              }),
              'main.js': '',
              'other.js': '',
            },
          });

          resolver = await createResolver(config);
          expect(
            resolver.resolve(p('/root/index.js'), dep('aPackage')),
          ).toEqual({
            type: 'sourceFile',
            filePath: p('/root/aPackage/main.js'),
          });
          expect(
            resolver.resolve(p('/root/index.js'), dep('aPackage/')),
          ).toEqual({
            type: 'sourceFile',
            filePath: p('/root/aPackage/main.js'),
          });
          expect(
            resolver.resolve(p('/root/index.js'), dep('aPackage/other')),
          ).toEqual({
            type: 'sourceFile',
            filePath: p('/root/aPackage/other.js'),
          });
        });

        test('resolves main package module to index.js by default', async () => {
          setMockFileSystem({
            'index.js': '',
            aPackage: {
              'package.json': JSON.stringify({name: 'aPackage'}),
              'index.js': '',
            },
          });

          resolver = await createResolver(config);
          expect(
            resolver.resolve(p('/root/index.js'), dep('aPackage')),
          ).toEqual({
            type: 'sourceFile',
            filePath: p('/root/aPackage/index.js'),
          });
        });

        test('uses the name in the package.json as the package name', async () => {
          setMockFileSystem({
            'index.js': mockFileImport("import a from 'aPackage';"),
            aPackage: {
              'package.json': JSON.stringify({}),
              'index.js': '',
            },
            randomFolderName: {
              'package.json': JSON.stringify({name: 'bPackage'}),
              'index.js': '',
            },
          });

          resolver = await createResolver(config);
          expect(() =>
            resolver.resolve(p('/root/index.js'), dep('aPackage')),
          ).toThrowErrorMatchingSnapshot();
          expect(
            resolver.resolve(p('/root/index.js'), dep('bPackage')),
          ).toEqual({
            type: 'sourceFile',
            filePath: p('/root/randomFolderName/index.js'),
          });
        });

        test('uses main field from the package.json', async () => {
          setMockFileSystem({
            'index.js': '',
            aPackage: {
              'package.json': JSON.stringify({name: 'aPackage', main: 'lib/'}),
              lib: {
                'index.js': '',
              },
            },
          });

          resolver = await createResolver(config);
          expect(
            resolver.resolve(p('/root/index.js'), dep('aPackage')),
          ).toEqual({
            type: 'sourceFile',
            filePath: p('/root/aPackage/lib/index.js'),
          });
        });

        test('supports package names with dots', async () => {
          setMockFileSystem({
            'index.js': '',
            'leftpad.js': {
              'package.json': JSON.stringify({name: 'leftpad.js'}),
              'index.js': '',
            },
            'x.y.z': {
              'package.json': JSON.stringify({name: 'x.y.z'}),
              'index.js': '',
            },
          });

          resolver = await createResolver(config);
          expect(
            resolver.resolve(p('/root/index.js'), dep('leftpad.js')),
          ).toEqual({
            type: 'sourceFile',
            filePath: p('/root/leftpad.js/index.js'),
          });
          expect(resolver.resolve(p('/root/index.js'), dep('x.y.z'))).toEqual({
            type: 'sourceFile',
            filePath: p('/root/x.y.z/index.js'),
          });
        });

        test('allows relative requires against packages', async () => {
          setMockFileSystem({
            'index.js': '',
            aPackage: {
              'package.json': JSON.stringify({name: 'aPackage', main: 'main'}),
              'main.js': '',
            },
            anotherPackage: {
              'package.json': JSON.stringify({name: 'bPackage', main: 'main'}),
              'main.js': '',
            },
          });

          resolver = await createResolver(config);
          expect(
            resolver.resolve(p('/root/index.js'), dep('./aPackage')),
          ).toEqual({
            type: 'sourceFile',
            filePath: p('/root/aPackage/main.js'),
          });
          expect(
            resolver.resolve(
              p('/root/aPackage/index.js'),
              dep('../anotherPackage'),
            ),
          ).toEqual({
            type: 'sourceFile',
            filePath: p('/root/anotherPackage/main.js'),
          });
        });

        test('resolution throws on multiple packages with the same name', async () => {
          setMockFileSystem({
            'index.js': '',
            aPackage: {
              'package.json': JSON.stringify({name: 'aPackage'}),
            },
            anotherPackage: {
              'package.json': JSON.stringify({name: 'aPackage', main: 'main'}),
              'main.js': '',
            },
          });

          resolver = await createResolver(config);

          expect(console.warn).toHaveBeenCalledWith(
            [
              'metro-file-map: Haste module naming collision: aPackage',
              '  The following files share their name; please adjust your hasteImpl:',
              `    * ${joinPath('<rootDir>', 'aPackage', 'package.json')}`,
              `    * ${joinPath(
                '<rootDir>',
                'anotherPackage',
                'package.json',
              )}`,
              '',
            ].join('\n'),
          );

          expect(() =>
            resolver.resolve(p('/root/index.js'), dep('aPackage')),
          ).toThrowError(
            new AmbiguousModuleResolutionError(
              p('/root/index.js'),
              new DuplicateHasteCandidatesError(
                'aPackage',
                Haste.GENERIC_PLATFORM,
                false,
                new Map([
                  [p('/root/aPackage/package.json'), Haste.PACKAGE],
                  [p('/root/anotherPackage/package.json'), Haste.PACKAGE],
                ]),
              ),
            ).message,
          );
        });

        test('resolution throws on multiple global packages for different platforms', async () => {
          setMockFileSystem({
            'index.js': '',
            'aPackage.android.js': {
              'package.json': JSON.stringify({name: 'aPackage'}),
              'index.js': '',
            },
            'aPackage.ios.js': {
              'package.json': JSON.stringify({name: 'aPackage'}),
              'index.js': '',
            },
          });

          resolver = await createResolver(config, 'ios');

          expect(console.warn).toHaveBeenCalledWith(
            [
              'metro-file-map: Haste module naming collision: aPackage',
              '  The following files share their name; please adjust your hasteImpl:',
              `    * ${joinPath(
                '<rootDir>',
                'aPackage.android.js',
                'package.json',
              )}`,
              `    * ${joinPath(
                '<rootDir>',
                'aPackage.ios.js',
                'package.json',
              )}`,
              '',
            ].join('\n'),
          );

          expect(() =>
            resolver.resolve(p('/root/index.js'), dep('aPackage')),
          ).toThrowError(
            new AmbiguousModuleResolutionError(
              p('/root/index.js'),
              new DuplicateHasteCandidatesError(
                'aPackage',
                Haste.GENERIC_PLATFORM,
                false,
                new Map([
                  [p('/root/aPackage.android.js/package.json'), Haste.PACKAGE],
                  [p('/root/aPackage.ios.js/package.json'), Haste.PACKAGE],
                ]),
              ),
            ).message,
          );
        });

        test('resolves global packages before node_modules packages', async () => {
          setMockFileSystem({
            'index.js': '',
            node_modules: {
              foo: {
                'package.json': JSON.stringify({name: 'foo'}),
                'index.js': '',
              },
            },
            foo: {
              'package.json': JSON.stringify({name: 'foo'}),
              'index.js': '',
            },
          });

          resolver = await createResolver(config);
          expect(resolver.resolve(p('/root/index.js'), dep('foo'))).toEqual({
            type: 'sourceFile',
            filePath: p('/root/foo/index.js'),
          });
        });

        test('allows to require global package sub-dirs', async () => {
          // $FlowFixMe[cannot-write]
          console.warn = jest.fn();
          setMockFileSystem({
            'index.js': '',
            aPackage: {
              'package.json': JSON.stringify({name: 'aPackage'}),
              lib: {foo: {'bar.js': ''}},
            },
          });

          resolver = await createResolver(config);
          expect(
            resolver.resolve(p('/root/index.js'), dep('aPackage/lib/foo/bar')),
          ).toEqual({
            type: 'sourceFile',
            filePath: p('/root/aPackage/lib/foo/bar.js'),
          });
        });

        ['browser', 'react-native'].forEach(browserField => {
          describe(`${browserField} field in global packages`, () => {
            test('supports simple field', async () => {
              setMockFileSystem({
                'index.js': '',
                aPackage: {
                  'package.json': JSON.stringify({
                    name: 'aPackage',
                    // $FlowFixMe[invalid-computed-prop]
                    [browserField as string]: 'client.js',
                  }),
                  'client.js': '',
                },
              });

              resolver = await createResolver(config);
              expect(
                resolver.resolve(p('/root/index.js'), dep('aPackage')),
              ).toEqual({
                type: 'sourceFile',
                filePath: p('/root/aPackage/client.js'),
              });
            });

            test('resolves mappings without extensions', async () => {
              setMockFileSystem({
                'index.js': '',
                aPackage: {
                  'package.json': JSON.stringify({
                    name: 'aPackage',
                    main: 'main.js',
                    // $FlowFixMe[invalid-computed-prop]
                    [browserField as string]: {'./main': './client'},
                  }),
                  'client.js': '',
                  'main.js': '',
                },
              });

              resolver = await createResolver(config);
              expect(
                resolver.resolve(p('/root/index.js'), dep('aPackage')),
              ).toEqual({
                type: 'sourceFile',
                filePath: p('/root/aPackage/client.js'),
              });
              expect(
                resolver.resolve(p('/root/index.js'), dep('aPackage/main')),
              ).toEqual({
                type: 'sourceFile',
                filePath: p('/root/aPackage/client.js'),
              });
            });
          });
        });

        test('works with custom main fields', async () => {
          setMockFileSystem({
            aPackage: {
              'package.json': JSON.stringify({
                name: 'aPackage',
                'custom-field': {'left-pad': './left-pad-custom'},
                browser: {'left-pad': './left-pad-browser'},
              }),
              'index.js': '',
              './left-pad-custom.js': '',
            },
          });

          resolver = await createResolver(
            mergeConfig(defaultConfig, config, {
              resolver: {resolverMainFields: ['custom-field', 'browser']},
            }),
          );

          expect(
            resolver.resolve(p('/root/aPackage/index.js'), dep('left-pad')),
          ).toEqual({
            type: 'sourceFile',
            filePath: p('/root/aPackage/left-pad-custom.js'),
          });
        });
      });

      describe.each([
        {name: 'default config', config: {}},
        {
          name: 'explicitly disabled',
          config: {
            resolver: {
              enableGlobalPackages: false,
            },
          },
        },
      ])('$name', ({config}) => {
        test('does not resolve global packages', async () => {
          setMockFileSystem({
            'index.js': '',
            aPackage: {
              'package.json': JSON.stringify({
                name: 'aPackage',
                main: 'main.js',
              }),
              'main.js': '',
              'other.js': '',
            },
          });

          resolver = await createResolver(config);
          expect(() =>
            resolver.resolve(p('/root/index.js'), dep('aPackage')),
          ).toThrowErrorMatchingSnapshot();
          expect(() =>
            resolver.resolve(p('/root/index.js'), dep('aPackage/')),
          ).toThrowErrorMatchingSnapshot();
          expect(() =>
            resolver.resolve(p('/root/index.js'), dep('aPackage/other')),
          ).toThrowErrorMatchingSnapshot();
        });

        test('does not report duplicates', async () => {
          setMockFileSystem({
            'index.js': '',
            'aPackage.android.js': {
              'package.json': JSON.stringify({name: 'aPackage'}),
              'index.js': '',
            },
            'aPackage.ios.js': {
              'package.json': JSON.stringify({name: 'aPackage'}),
              'index.js': '',
            },
          });

          resolver = await createResolver(config);
          expect(console.error).not.toHaveBeenCalled();
        });
      });
    });

    describe('hasteImpl config param', () => {
      let config;

      beforeEach(() => {
        config = {
          resolver: {
            hasteImplModulePath: path.join(
              __dirname,
              '../__fixtures__/hasteImpl.js',
            ),
            enableGlobalPackages: true,
          },
        };
      });

      test('resolves haste names globally', async () => {
        setMockFileSystem({
          'index.js': '',
          'hasteModule.js': '@providesModule hasteModule',
        });

        resolver = await createResolver(config);
        expect(
          resolver.resolve(p('/root/index.js'), dep('hasteModule')),
        ).toEqual({
          type: 'sourceFile',
          filePath: p('/root/hasteModule.js'),
        });
      });

      test('does not take file name or extension into account', async () => {
        setMockFileSystem({
          'index.js': mockFileImport("import module from 'hasteModule.js';"),
          'lib.js': mockFileImport("import invalid from 'invalidName';"),
          'hasteModule.js': '@providesModule hasteModule',
          'invalidName.js': '@providesModule anotherHasteModule',
        });

        resolver = await createResolver(config);
        expect(() =>
          resolver.resolve(p('/root/index.js'), dep('hasteModule.js')),
        ).toThrowErrorMatchingSnapshot();
        expect(() =>
          resolver.resolve(p('/root/lib.js'), dep('invalidName')),
        ).toThrowErrorMatchingSnapshot();
      });

      test('checks for haste modules in different folder', async () => {
        setMockFileSystem({
          'index.js': '',
          dir: {subdir: {'hasteModule.js': '@providesModule hasteModule'}},
        });

        resolver = await createResolver(config);
        expect(
          resolver.resolve(p('/root/index.js'), dep('hasteModule')),
        ).toEqual({
          type: 'sourceFile',
          filePath: p('/root/dir/subdir/hasteModule.js'),
        });
      });

      test('resolution throws when there are duplicated haste names', async () => {
        setMockFileSystem({
          'index.js': '',
          'hasteModule.js': '@providesModule hasteModule',
          'anotherHasteModule.js': '@providesModule hasteModule',
        });

        resolver = await createResolver(config);

        expect(console.warn).toHaveBeenCalledWith(
          [
            'metro-file-map: Haste module naming collision: hasteModule',
            '  The following files share their name; please adjust your hasteImpl:',
            `    * ${joinPath('<rootDir>', 'hasteModule.js')}`,
            `    * ${joinPath('<rootDir>', 'anotherHasteModule.js')}`,
            '',
          ].join('\n'),
        );

        expect(() =>
          resolver.resolve(p('/root/index.js'), dep('hasteModule')),
        ).toThrowError(
          new AmbiguousModuleResolutionError(
            p('/root/index.js'),
            new DuplicateHasteCandidatesError(
              'hasteModule',
              Haste.GENERIC_PLATFORM,
              false,
              new Map([
                [p('/root/anotherHasteModule.js'), Haste.MODULE],
                [p('/root/hasteModule.js'), Haste.MODULE],
              ]),
            ),
          ).message,
        );
      });

      test('resolves a haste module before a package in node_modules', async () => {
        setMockFileSystem({
          'index.js': '',
          'hasteModule.js': '@providesModule hasteModule',
          node_modules: {
            hasteModule: {
              'package.json': JSON.stringify({name: 'hasteModule'}),
              'index.js': '',
            },
          },
        });

        resolver = await createResolver(config);
        expect(
          resolver.resolve(p('/root/index.js'), dep('hasteModule')),
        ).toEqual({
          type: 'sourceFile',
          filePath: p('/root/hasteModule.js'),
        });
      });

      test('resolution throws when a haste module collides with a global package', async () => {
        setMockFileSystem({
          'index.js': '',
          'hasteModule.js': '@providesModule hasteModule',
          aPackage: {
            'package.json': JSON.stringify({name: 'hasteModule'}),
          },
        });

        resolver = await createResolver(config);

        expect(console.warn).toHaveBeenCalledWith(
          [
            'metro-file-map: Haste module naming collision: hasteModule',
            '  The following files share their name; please adjust your hasteImpl:',
            `    * ${joinPath('<rootDir>', 'hasteModule.js')}`,
            `    * ${joinPath('<rootDir>', 'aPackage', 'package.json')}`,
            '',
          ].join('\n'),
        );

        expect(() =>
          resolver.resolve(p('/root/index.js'), dep('hasteModule')),
        ).toThrowError(
          new AmbiguousModuleResolutionError(
            p('/root/index.js'),
            new DuplicateHasteCandidatesError(
              'hasteModule',
              Haste.GENERIC_PLATFORM,
              false,
              new Map([
                [p('/root/aPackage/package.json'), Haste.PACKAGE],
                [p('/root/hasteModule.js'), Haste.MODULE],
              ]),
            ),
          ).message,
        );
      });

      test('supports collisions between haste names and global packages if they have different platforms', async () => {
        setMockFileSystem({
          'index.js': '',
          'hasteModule.ios.js': '@providesModule hasteModule',
          aPackage: {
            'package.json': JSON.stringify({name: 'hasteModule'}),
            'index.js': '',
          },
        });

        const {resolve, end} = await createResolver(config, 'ios');
        expect(resolve(p('/root/index.js'), dep('hasteModule'))).toEqual({
          type: 'sourceFile',
          filePath: p('/root/hasteModule.ios.js'),
        });
        await end();

        resolver = await createResolver(config, 'android');
        expect(
          resolver.resolve(p('/root/index.js'), dep('hasteModule')),
        ).toEqual({
          type: 'sourceFile',
          filePath: p('/root/aPackage/index.js'),
        });
      });

      test('resolves duplicated haste names when the filenames have different platforms', async () => {
        setMockFileSystem({
          'index.js': '',
          'hasteModule.js': '@providesModule hasteModule',
          'hasteModule.ios.js': '@providesModule hasteModule',
        });

        const {resolve, end} = await createResolver(config, 'ios');
        expect(resolve(p('/root/index.js'), dep('hasteModule'))).toEqual({
          type: 'sourceFile',
          filePath: p('/root/hasteModule.ios.js'),
        });
        await end();

        resolver = await createResolver(config, 'android');
        expect(
          resolver.resolve(p('/root/index.js'), dep('hasteModule')),
        ).toEqual({
          type: 'sourceFile',
          filePath: p('/root/hasteModule.js'),
        });
      });

      test('warns when a filename uses a non-supported platform and there are collisions', async () => {
        setMockFileSystem({
          'index.js': '',
          'hasteModule.js': '@providesModule hasteModule',
          'hasteModule.invalid.js': '@providesModule hasteModule',
        });

        resolver = await createResolver(config);

        expect(console.warn).toHaveBeenCalledWith(
          [
            'metro-file-map: Haste module naming collision: hasteModule',
            '  The following files share their name; please adjust your hasteImpl:',
            `    * ${joinPath('<rootDir>', 'hasteModule.js')}`,
            `    * ${joinPath('<rootDir>', 'hasteModule.invalid.js')}`,
            '',
          ].join('\n'),
        );
      });

      test('does not resolve haste names in node_modules folders', async () => {
        setMockFileSystem({
          'index.js': mockFileImport("import hasteModule from 'hasteModule';"),
          node_modules: {
            aPackage: {
              'package.json': JSON.stringify({name: 'aPackage'}),
              'hasteModule.js': '@providesModule hasteModule',
            },
          },
        });

        resolver = await createResolver(config);
        expect(() =>
          resolver.resolve(p('/root/index.js'), dep('hasteModule')),
        ).toThrowErrorMatchingSnapshot();
      });

      test('does not cause collision with haste modules in node_modules', async () => {
        setMockFileSystem({
          'index.js': '',
          'hasteModule.js': '@providesModule hasteModule',
          node_modules: {
            aPackage: {
              'package.json': JSON.stringify({name: 'aPackage'}),
              'hasteModule.js': '@providesModule hasteModule',
            },
          },
        });

        resolver = await createResolver(config);
        expect(
          resolver.resolve(p('/root/index.js'), dep('hasteModule')),
        ).toEqual({
          type: 'sourceFile',
          filePath: p('/root/hasteModule.js'),
        });
      });

      test('respects package.json replacements for global (Haste) packages', async () => {
        setMockFileSystem({
          node_modules: {
            aPackage: {
              'package.json': JSON.stringify({
                name: 'aPackage',
                browser: {hastePackage: './hastePackage-local-override'},
              }),
              'index.js': '',
              './hastePackage-local-override.js': '',
            },
          },
          hastePackage: {
            'package.json': JSON.stringify({
              name: 'hastePackage',
            }),
            'index.js': '',
          },
        });

        resolver = await createResolver(config);

        expect(
          resolver.resolve(
            p('/root/node_modules/aPackage/index.js'),
            dep('hastePackage'),
          ),
        ).toEqual({
          type: 'sourceFile',
          filePath: p(
            '/root/node_modules/aPackage/hastePackage-local-override.js',
          ),
        });
      });

      test('respects package.json replacements for Haste modules', async () => {
        setMockFileSystem({
          node_modules: {
            aPackage: {
              'package.json': JSON.stringify({
                name: 'aPackage',
                browser: {hasteModule: './hasteModule-local-override'},
              }),
              'index.js': '',
              './hasteModule-local-override.js': '',
            },
          },
          'hasteModule.js': '@providesModule hasteModule',
        });

        resolver = await createResolver(config);

        expect(
          resolver.resolve(
            p('/root/node_modules/aPackage/index.js'),
            dep('hasteModule'),
          ),
        ).toEqual({
          type: 'sourceFile',
          filePath: p(
            '/root/node_modules/aPackage/hasteModule-local-override.js',
          ),
        });
      });
    });

    describe('extraNodeModules config param', () => {
      test('works when it points to folders or packages', async () => {
        setMockFileSystem({
          folder: {'index.js': ''},
          providesFoo: {
            'package.json': JSON.stringify({main: 'lib/bar'}),
            lib: {'bar.js': ''},
          },
          providesBar: {'index.js': ''},
        });

        resolver = await createResolver({
          resolver: {
            extraNodeModules: {
              foo: p('/root/providesFoo'),
              bar: p('/root/providesBar'),
            },
          },
        });

        expect(
          resolver.resolve(p('/root/folder/index.js'), dep('foo')),
        ).toEqual({
          type: 'sourceFile',
          filePath: p('/root/providesFoo/lib/bar.js'),
        });
        expect(
          resolver.resolve(p('/root/folder/index.js'), dep('bar')),
        ).toEqual({
          type: 'sourceFile',
          filePath: p('/root/providesBar/index.js'),
        });
      });

      test('uses extraNodeModules only after checking all possible filesystem locations', async () => {
        setMockFileSystem({
          folder: {'index.js': ''},
          providesFoo: {
            'package.json': '{}',
            'index.js': '',
          },
          node_modules: {
            foo: {
              'package.json': JSON.stringify({name: 'foo'}),
              lib: {'bar.js': ''},
              'index.js': '',
            },
          },
        });

        resolver = await createResolver({
          resolver: {extraNodeModules: {foo: p('/root/providesFoo')}},
        });

        expect(
          resolver.resolve(p('/root/folder/index.js'), dep('foo')),
        ).toEqual({
          type: 'sourceFile',
          filePath: p('/root/node_modules/foo/index.js'),
        });
        expect(
          resolver.resolve(p('/root/folder/index.js'), dep('foo/lib/bar')),
        ).toEqual({
          type: 'sourceFile',
          filePath: p('/root/node_modules/foo/lib/bar.js'),
        });
      });

      test('supports scoped `extraNodeModules`', async () => {
        setMockFileSystem({
          folder: {'index.js': ''},
          providesFoo: {
            'package.json': '{}',
            lib: {'bar.js': ''},
            'index.js': '',
          },
        });

        resolver = await createResolver({
          resolver: {extraNodeModules: {'@foo/bar': p('/root/providesFoo')}},
        });

        expect(
          resolver.resolve(p('/root/folder/index.js'), dep('@foo/bar')),
        ).toEqual({
          type: 'sourceFile',
          filePath: p('/root/providesFoo/index.js'),
        });
        expect(
          resolver.resolve(p('/root/folder/index.js'), dep('@foo/bar/lib/bar')),
        ).toEqual({
          type: 'sourceFile',
          filePath: p('/root/providesFoo/lib/bar.js'),
        });
      });

      test('supports browser mappings in its package.json', async () => {
        setMockFileSystem({
          folder: {'index.js': ''},
          providesFoo: {
            'package.json': JSON.stringify({
              browser: {'index.js': 'index-client.js'},
            }),
            'index.js': '',
            'index-client.js': '',
          },
        });

        resolver = await createResolver({
          resolver: {extraNodeModules: {foo: p('/root/providesFoo')}},
        });

        expect(
          resolver.resolve(p('/root/folder/index.js'), dep('foo')),
        ).toEqual({
          type: 'sourceFile',
          filePath: p('/root/providesFoo/index-client.js'),
        });
      });

      test('resolves assets', async () => {
        setMockFileSystem({
          folder: {'index.js': ''},
          providesFoo: {'asset.png': ''},
        });

        resolver = await createResolver({
          resolver: {extraNodeModules: {foo: p('/root/providesFoo')}},
        });

        expect(
          resolver.resolve(p('/root/folder/index.js'), dep('foo/asset.png')),
        ).toEqual({
          type: 'sourceFile',
          filePath: p('/root/providesFoo/asset.png'),
        });
      });
    });

    describe('resolveRequest config param', () => {
      let resolveRequest;

      beforeEach(() => {
        resolveRequest = jest.fn().mockReturnValue({
          type: 'sourceFile',
          filePath: p('/root/overriden.js'),
        });
      });

      test('overrides relative paths', async () => {
        setMockFileSystem({
          'index.js': '',
          myFolder: {'foo.js': ''},
          'overriden.js': '',
        });

        resolver = await createResolver({resolver: {resolveRequest}});

        expect(
          resolver.resolve(p('/root/index.js'), dep('./myFolder/foo')),
        ).toEqual({type: 'sourceFile', filePath: p('/root/overriden.js')});
        expect(resolver.resolve(p('/root/index.js'), dep('./invalid'))).toEqual(
          {
            type: 'sourceFile',
            filePath: p('/root/overriden.js'),
          },
        );
      });

      test('overrides node_modules package resolutions', async () => {
        setMockFileSystem({
          'index.js': '',
          node_modules: {
            aPackage: {
              'package.json': JSON.stringify({name: 'aPackage'}),
              'index.js': '',
            },
          },
          'overriden.js': '',
        });

        resolver = await createResolver({resolver: {resolveRequest}});

        expect(resolver.resolve(p('/root/index.js'), dep('aPackage'))).toEqual({
          type: 'sourceFile',
          filePath: p('/root/overriden.js'),
        });
      });

      test('overrides global package resolutions', async () => {
        setMockFileSystem({
          'index.js': '',
          aPackage: {
            'package.json': JSON.stringify({name: 'aPackage'}),
            'index.js': '',
          },
          'overriden.js': '',
        });

        resolver = await createResolver({resolver: {resolveRequest}});

        expect(resolver.resolve(p('/root/index.js'), dep('aPackage'))).toEqual({
          type: 'sourceFile',
          filePath: p('/root/overriden.js'),
        });
      });

      test('overrides haste names', async () => {
        setMockFileSystem({
          'index.js': '',
          'aPackage.js': '@providesModule aPackage',
          'overriden.js': '',
        });

        resolver = await createResolver({
          resolver: {
            resolveRequest,
            hasteImplModulePath: path.join(
              __dirname,
              '../__fixtures__/hasteImpl.js',
            ),
          },
        });

        expect(resolver.resolve(p('/root/index.js'), dep('aPackage'))).toEqual({
          type: 'sourceFile',
          filePath: p('/root/overriden.js'),
        });
      });

      test('calls resolveRequest with the correct arguments', async () => {
        setMockFileSystem({
          'index.js': '',
          'foo.js': '',
          'overriden.js': '',
        });

        resolver = await createResolver({resolver: {resolveRequest}}, 'ios');

        resolver.resolve(p('/root/index.js'), dep('./foo'));

        const [context, request, platform] = resolveRequest.mock.calls[0];

        expect(context.originModulePath).toEqual(p('/root/index.js'));
        expect(request).toEqual('./foo');
        expect(platform).toEqual('ios');
      });

      test('caches resolutions by origin folder', async () => {
        setMockFileSystem({
          root1: {
            dir: {
              'a.js': '',
              'b.js': '',
            },
          },
          root2: {
            dir: {
              'a.js': '',
              'b.js': '',
            },
          },
          'target1.js': {},
          'target2.js': {},
        });
        resolver = await createResolver({resolver: {resolveRequest}});

        resolveRequest.mockReturnValue({
          type: 'sourceFile',
          filePath: p('/target1.js'),
        });
        expect(resolver.resolve(p('/root1/dir/a.js'), dep('target'))).toEqual({
          type: 'sourceFile',
          filePath: p('/target1.js'),
        });
        expect(resolver.resolve(p('/root1/dir/b.js'), dep('target'))).toEqual({
          type: 'sourceFile',
          filePath: p('/target1.js'),
        });
        expect(resolveRequest).toHaveBeenCalledTimes(1);
        expect(resolver.resolve(p('/root1/fake.js'), dep('target'))).toEqual({
          type: 'sourceFile',
          filePath: p('/target1.js'),
        });
        expect(resolveRequest).toHaveBeenCalledTimes(2);

        resolveRequest.mockReturnValue({
          type: 'sourceFile',
          filePath: p('/target2.js'),
        });
        expect(resolver.resolve(p('/root2/dir/a.js'), dep('target'))).toEqual({
          type: 'sourceFile',
          filePath: p('/target2.js'),
        });
        expect(resolver.resolve(p('/root2/dir/b.js'), dep('target'))).toEqual({
          type: 'sourceFile',
          filePath: p('/target2.js'),
        });
        expect(resolveRequest).toHaveBeenCalledTimes(3);
        expect(resolver.resolve(p('/root2/fake.js'), dep('target'))).toEqual({
          type: 'sourceFile',
          filePath: p('/target2.js'),
        });
        expect(resolveRequest).toHaveBeenCalledTimes(4);
      });

      test('caches resolutions globally if assumeFlatNodeModules=true', async () => {
        setMockFileSystem({
          root1: {
            dir: {
              'a.js': '',
              'b.js': '',
            },
          },
          root2: {
            dir: {
              'a.js': '',
              'b.js': '',
            },
          },
          'target-always.js': {},
          'target-never.js': {},
        });
        resolver = await createResolver({resolver: {resolveRequest}});

        resolveRequest.mockReturnValue({
          type: 'sourceFile',
          filePath: p('/target-always.js'),
        });
        expect(
          resolver.resolve(p('/root1/dir/a.js'), dep('target'), undefined, {
            assumeFlatNodeModules: true,
          }),
        ).toEqual({type: 'sourceFile', filePath: p('/target-always.js')});
        expect(
          resolver.resolve(p('/root1/dir/b.js'), dep('target'), undefined, {
            assumeFlatNodeModules: true,
          }),
        ).toEqual({type: 'sourceFile', filePath: p('/target-always.js')});

        resolveRequest.mockReturnValue({
          type: 'sourceFile',
          filePath: p('/target-never.js'),
        });
        expect(
          resolver.resolve(p('/root2/dir/a.js'), dep('target'), undefined, {
            assumeFlatNodeModules: true,
          }),
        ).toEqual({type: 'sourceFile', filePath: p('/target-always.js')});
        expect(
          resolver.resolve(p('/root2/dir/b.js'), dep('target'), undefined, {
            assumeFlatNodeModules: true,
          }),
        ).toEqual({type: 'sourceFile', filePath: p('/target-always.js')});

        expect(resolveRequest).toHaveBeenCalledTimes(1);
      });

      test('forks the cache by customResolverOptions', async () => {
        setMockFileSystem({
          root1: {
            dir: {
              'a.js': '',
              'b.js': '',
            },
          },
          root2: {
            dir: {
              'a.js': '',
              'b.js': '',
            },
          },
          'target1.js': {},
          'target2.js': {},
        });
        resolver = await createResolver({resolver: {resolveRequest}});

        resolveRequest.mockReturnValue({
          type: 'sourceFile',
          filePath: p('/target1.js'),
        });
        expect(
          resolver.resolve(p('/root1/dir/a.js'), dep('target'), {
            dev: true,
            customResolverOptions: {
              foo: 'bar',
              key: 'value',
            },
          }),
        ).toEqual({type: 'sourceFile', filePath: p('/target1.js')});
        expect(
          resolver.resolve(p('/root1/dir/b.js'), dep('target'), {
            dev: true,
            customResolverOptions: {
              // NOTE: reverse order from what we passed above
              key: 'value',
              foo: 'bar',
            },
          }),
        ).toEqual({type: 'sourceFile', filePath: p('/target1.js')});
        expect(resolveRequest).toHaveBeenCalledTimes(1);

        resolveRequest.mockClear();
        expect(
          resolver.resolve(p('/root1/dir/b.js'), dep('target'), {
            dev: true,
            customResolverOptions: {
              // NOTE: only a subset of the options passed above
              foo: 'bar',
            },
          }),
        ).toEqual({type: 'sourceFile', filePath: p('/target1.js')});
        expect(resolveRequest).toHaveBeenCalledTimes(1);

        resolveRequest.mockClear();
        expect(
          resolver.resolve(p('/root1/dir/b.js'), dep('target'), {
            dev: true,
            customResolverOptions: {
              something: 'else',
            },
          }),
        ).toEqual({type: 'sourceFile', filePath: p('/target1.js')});
        expect(resolveRequest).toHaveBeenCalledTimes(1);
      });
    });
  });
});
