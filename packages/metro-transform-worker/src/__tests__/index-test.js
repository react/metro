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

jest
  .mock('../utils/getMinifier', () => () => ({code, map, config}) => {
    const trimmed = config.output.comments
      ? code
      : code.replace('/*#__PURE__*/', '');
    return {
      code: trimmed.replace('arbitrary(code)', 'minified(code)'),
      map,
    };
  })
  .mock('metro-transform-plugins', () => ({
    ...jest.requireActual('metro-transform-plugins'),
    inlinePlugin: () => ({}),
    constantFoldingPlugin: () => ({}),
  }))
  .mock('metro-minify-terser');

import type {JsTransformerConfig, JsTransformOptions} from '../index';
import typeof * as TransformerType from '../index';
import typeof FSType from 'fs';

const {Buffer} = require('buffer');
const path = require('path');

const babelTransformerPath = require.resolve(
  '@react-native/metro-babel-transformer',
);

const transformerContents = (() =>
  require('fs').readFileSync(babelTransformerPath))();

const HEADER_DEV =
  '__d(function (global, _$$_REQUIRE, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {';
const HEADER_PROD = '__d(function (g, r, i, a, m, e, d) {';

let fs: FSType;
let Transformer: TransformerType;

const baseConfig: JsTransformerConfig = {
  allowOptionalDependencies: false,
  assetPlugins: [],
  assetRegistryPath: '',
  asyncRequireModulePath: 'asyncRequire',
  babelTransformerPath,
  dynamicDepsInPackages: 'reject',
  enableBabelRCLookup: false,
  enableBabelRuntime: true,
  globalPrefix: '',
  hermesParser: false,
  minifierConfig: {output: {comments: false}},
  minifierPath: 'minifyModulePath',
  optimizationSizeLimit: 100000,
  publicPath: '/assets',
  unstable_dependencyMapReservedName: null,
  unstable_compactOutput: false,
  unstable_disableModuleWrapping: false,
  unstable_disableNormalizePseudoGlobals: false,
  unstable_allowRequireContext: false,
};

const baseTransformOptions: JsTransformOptions = {
  dev: true,
  inlinePlatform: false,
  inlineRequires: false,
  minify: false,
  platform: 'ios',
  type: 'module',
  unstable_transformProfile: 'default',
};

beforeEach(() => {
  jest.resetModules();

  jest.mock('fs', () => new (require('metro-memory-fs'))());

  fs = require('fs');
  Transformer = require('../');
  // $FlowFixMe[prop-missing] Cannot call `fs.reset` because property `reset` is missing in  module `fs`
  fs.reset();

  fs.mkdirSync('/root/local', {recursive: true});
  fs.mkdirSync(path.dirname(babelTransformerPath), {recursive: true});
  fs.writeFileSync(babelTransformerPath, transformerContents);
});

test('transforms a simple script', async () => {
  const result = await Transformer.transform(
    baseConfig,
    '/root',
    'local/file.js',
    Buffer.from('someReallyArbitrary(code)', 'utf8'),
    {...baseTransformOptions, type: 'script'},
  );

  expect(result.output[0].type).toBe('js/script');
  expect(result.output[0].data.code).toBe(
    [
      '(function (global) {',
      '  someReallyArbitrary(code);',
      "})(typeof globalThis !== 'undefined' ? globalThis : typeof global !== 'undefined' ? global : typeof window !== 'undefined' ? window : this);",
    ].join('\n'),
  );
  expect(result.output[0].data.map).toMatchSnapshot();
  expect(result.output[0].data.functionMap).toMatchSnapshot();
  expect(result.dependencies).toEqual([]);
});

test('transforms a simple module', async () => {
  const result = await Transformer.transform(
    baseConfig,
    '/root',
    'local/file.js',
    Buffer.from('arbitrary(code)', 'utf8'),
    baseTransformOptions,
  );

  expect(result.output[0].type).toBe('js/module');
  expect(result.output[0].data.code).toBe(
    [HEADER_DEV, '  arbitrary(code);', '});'].join('\n'),
  );
  expect(result.output[0].data.map).toMatchSnapshot();
  expect(result.output[0].data.functionMap).toMatchSnapshot();
  expect(result.dependencies).toEqual([]);
});

test('transforms a module with dependencies', async () => {
  const contents = [
    '"use strict";',
    'require("./a");',
    'arbitrary(code);',
    'const b = require("b");',
    'import c from "./c";',
  ].join('\n');

  const result = await Transformer.transform(
    baseConfig,
    '/root',
    'local/file.js',
    Buffer.from(contents, 'utf8'),
    baseTransformOptions,
  );

  expect(result.output[0].type).toBe('js/module');
  expect(result.output[0].data.code).toBe(
    [
      HEADER_DEV,
      '  "use strict";',
      '',
      '  var _interopRequireDefault = _$$_REQUIRE(_dependencyMap[0], "@babel/runtime/helpers/interopRequireDefault");',
      '  var _c = _interopRequireDefault(_$$_REQUIRE(_dependencyMap[1], "./c"));',
      '  _$$_REQUIRE(_dependencyMap[2], "./a");',
      '  arbitrary(code);',
      '  var b = _$$_REQUIRE(_dependencyMap[3], "b");',
      '});',
    ].join('\n'),
  );
  expect(result.output[0].data.map).toMatchSnapshot();
  expect(result.output[0].data.functionMap).toMatchSnapshot();
  expect(result.dependencies).toEqual([
    {
      data: expect.objectContaining({asyncType: null}),
      name: '@babel/runtime/helpers/interopRequireDefault',
    },
    {data: expect.objectContaining({asyncType: null}), name: './c'},
    {data: expect.objectContaining({asyncType: null}), name: './a'},
    {data: expect.objectContaining({asyncType: null}), name: 'b'},
  ]);
});

test('transforms an es module with asyncToGenerator', async () => {
  const result = await Transformer.transform(
    baseConfig,
    '/root',
    'local/file.js',
    Buffer.from('export async function test() {}', 'utf8'),
    baseTransformOptions,
  );

  expect(result.output[0].type).toBe('js/module');
  expect(result.output[0].data.code).toMatchSnapshot();
  expect(result.output[0].data.map).toHaveLength(34);
  expect(result.output[0].data.functionMap).toMatchSnapshot();
  expect(result.dependencies).toEqual([
    {
      data: expect.objectContaining({asyncType: null}),
      name: '@babel/runtime/helpers/interopRequireDefault',
    },
    {
      data: expect.objectContaining({asyncType: null}),
      name: '@babel/runtime/helpers/asyncToGenerator',
    },
  ]);
});

test('transforms async generators', async () => {
  const result = await Transformer.transform(
    baseConfig,
    '/root',
    'local/file.js',
    Buffer.from('export async function* test() { yield "ok"; }', 'utf8'),
    baseTransformOptions,
  );

  expect(result.output[0].data.code).toMatchSnapshot();
  expect(result.dependencies).toEqual([
    {
      data: expect.objectContaining({asyncType: null}),
      name: '@babel/runtime/helpers/interopRequireDefault',
    },
    {
      data: expect.objectContaining({asyncType: null}),
      name: '@babel/runtime/helpers/awaitAsyncGenerator',
    },
    {
      data: expect.objectContaining({asyncType: null}),
      name: '@babel/runtime/helpers/wrapAsyncGenerator',
    },
  ]);
});

test('transforms import/export syntax when experimental flag is on', async () => {
  const contents = ['import c from "./c";'].join('\n');

  const result = await Transformer.transform(
    baseConfig,
    '/root',
    'local/file.js',
    Buffer.from(contents, 'utf8'),
    {...baseTransformOptions, experimentalImportSupport: true},
  );

  expect(result.output[0].type).toBe('js/module');
  expect(result.output[0].data.code).toBe(
    [
      HEADER_DEV,
      '  "use strict";',
      '',
      '  var c = _$$_IMPORT_DEFAULT(_dependencyMap[0], "./c");',
      '});',
    ].join('\n'),
  );
  expect(result.output[0].data.map).toMatchSnapshot();
  expect(result.output[0].data.functionMap).toMatchSnapshot();
  expect(result.dependencies).toEqual([
    {
      data: expect.objectContaining({
        asyncType: null,
      }),
      name: './c',
    },
  ]);
});

test('does not add "use strict" on non-modules', async () => {
  const result = await Transformer.transform(
    baseConfig,
    '/root',
    'node_modules/local/file.js',
    Buffer.from('module.exports = {};', 'utf8'),
    {...baseTransformOptions, experimentalImportSupport: true},
  );

  expect(result.output[0].type).toBe('js/module');
  expect(result.output[0].data.code).toBe(
    [HEADER_DEV, '  module.exports = {};', '});'].join('\n'),
  );
});

test('preserves require() calls when module wrapping is disabled', async () => {
  const contents = ['require("./c");'].join('\n');

  const result = await Transformer.transform(
    {
      ...baseConfig,
      unstable_disableModuleWrapping: true,
    },
    '/root',
    'local/file.js',
    Buffer.from(contents, 'utf8'),
    baseTransformOptions,
  );

  expect(result.output[0].type).toBe('js/module');
  expect(result.output[0].data.code).toBe('require("./c");');
});

test('reports filename when encountering unsupported dynamic dependency', async () => {
  const contents = [
    'require("./a");',
    'let a = arbitrary(code);',
    'const b = require(a);',
  ].join('\n');

  try {
    await Transformer.transform(
      baseConfig,
      '/root',
      'local/file.js',
      Buffer.from(contents, 'utf8'),
      baseTransformOptions,
    );
    throw new Error('should not reach this');
  } catch (error) {
    expect(error.message).toMatchSnapshot();
  }
});

test('supports dynamic dependencies from within `node_modules`', async () => {
  expect(
    (
      await Transformer.transform(
        {
          ...baseConfig,
          dynamicDepsInPackages: 'throwAtRuntime',
        },
        '/root',
        'node_modules/foo/bar.js',
        Buffer.from('require(foo.bar);', 'utf8'),
        baseTransformOptions,
      )
    ).output[0].data.code,
  ).toBe(
    [
      HEADER_DEV,
      '  (function (line) {',
      "    throw new Error('Dynamic require defined at line ' + line + '; not supported by Metro');",
      '  })(1);',
      '});',
    ].join('\n'),
  );
});

test('minifies the code correctly', async () => {
  expect(
    (
      await Transformer.transform(
        baseConfig,
        '/root',
        'local/file.js',
        Buffer.from('arbitrary(code);', 'utf8'),
        {...baseTransformOptions, minify: true},
      )
    ).output[0].data.code,
  ).toBe([HEADER_PROD, '  minified(code);', '});'].join('\n'));
});

test('minifies a JSON file', async () => {
  expect(
    (
      await Transformer.transform(
        baseConfig,
        '/root',
        'local/file.json',
        Buffer.from('arbitrary(code);', 'utf8'),
        {...baseTransformOptions, minify: true},
      )
    ).output[0].data.code,
  ).toBe(
    [
      '__d(function(global, require, _importDefaultUnused, _importAllUnused, module, exports, _dependencyMapUnused) {',
      '  module.exports = minified(code);;',
      '});',
    ].join('\n'),
  );
});

test('does not wrap a JSON file when disableModuleWrapping is enabled', async () => {
  expect(
    (
      await Transformer.transform(
        {
          ...baseConfig,
          unstable_disableModuleWrapping: true,
        },
        '/root',
        'local/file.json',
        Buffer.from('arbitrary(code);', 'utf8'),
        baseTransformOptions,
      )
    ).output[0].data.code,
  ).toBe('module.exports = arbitrary(code);;');
});

test('uses a reserved dependency map name and prevents it from being minified', async () => {
  const result = await Transformer.transform(
    {...baseConfig, unstable_dependencyMapReservedName: 'THE_DEP_MAP'},
    '/root',
    'local/file.js',
    Buffer.from('arbitrary(code);', 'utf8'),
    {...baseTransformOptions, dev: false, minify: true},
  );
  expect(result.output[0].data.code).toMatchInlineSnapshot(`
    "__d(function (g, r, i, a, m, e, THE_DEP_MAP) {
      minified(code);
    });"
  `);
});

test('throws if the reserved dependency map name appears in the input', async () => {
  await expect(
    Transformer.transform(
      {...baseConfig, unstable_dependencyMapReservedName: 'THE_DEP_MAP'},
      '/root',
      'local/file.js',
      Buffer.from(
        'arbitrary(code); /* the code is not allowed to mention THE_DEP_MAP, even in a comment */',
        'utf8',
      ),
      {...baseTransformOptions, dev: false, minify: true},
    ),
  ).rejects.toThrowErrorMatchingInlineSnapshot(
    `"Source code contains the reserved string \`THE_DEP_MAP\` at character offset 55"`,
  );
});

test('allows disabling the normalizePseudoGlobals pass when minifying', async () => {
  const result = await Transformer.transform(
    {...baseConfig, unstable_disableNormalizePseudoGlobals: true},
    '/root',
    'local/file.js',
    Buffer.from('arbitrary(code);', 'utf8'),
    {...baseTransformOptions, dev: false, minify: true},
  );
  expect(result.output[0].data.code).toMatchInlineSnapshot(`
    "__d(function (global, _$$_REQUIRE, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
      minified(code);
    });"
  `);
});

test('allows emitting compact code when not minifying', async () => {
  const result = await Transformer.transform(
    {...baseConfig, unstable_compactOutput: true},
    '/root',
    'local/file.js',
    Buffer.from('arbitrary(code);', 'utf8'),
    {...baseTransformOptions, dev: false, minify: false},
  );
  expect(result.output[0].data.code).toMatchInlineSnapshot(
    `"__d(function(global,_$$_REQUIRE,_$$_IMPORT_DEFAULT,_$$_IMPORT_ALL,module,exports,_dependencyMap){arbitrary(code);});"`,
  );
});

test('skips minification in Hermes stable transform profile', async () => {
  const result = await Transformer.transform(
    baseConfig,
    '/root',
    'local/file.js',
    Buffer.from('arbitrary(code);', 'utf8'),
    {
      ...baseTransformOptions,
      dev: false,
      minify: true,
      unstable_transformProfile: 'hermes-canary',
    },
  );
  expect(result.output[0].data.code).toMatchInlineSnapshot(`
    "__d(function (global, _$$_REQUIRE, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
      arbitrary(code);
    });"
  `);
});

test('skips minification in Hermes canary transform profile', async () => {
  const result = await Transformer.transform(
    baseConfig,
    '/root',
    'local/file.js',
    Buffer.from('arbitrary(code);', 'utf8'),
    {
      ...baseTransformOptions,
      dev: false,
      minify: true,
      unstable_transformProfile: 'hermes-canary',
    },
  );
  expect(result.output[0].data.code).toMatchInlineSnapshot(`
    "__d(function (global, _$$_REQUIRE, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
      arbitrary(code);
    });"
  `);
});

test('counts all line endings correctly', async () => {
  const transformStr = (str: string) =>
    Transformer.transform(
      baseConfig,
      '/root',
      'local/file.js',
      Buffer.from(str, 'utf8'),
      {...baseTransformOptions, dev: false, minify: false},
    );

  const differentEndingsResult = await transformStr(
    'one\rtwo\r\nthree\nfour\u2028five\u2029six',
  );

  const standardEndingsResult = await transformStr(
    'one\ntwo\nthree\nfour\nfive\nsix',
  );

  expect(differentEndingsResult.output[0].data.lineCount).toEqual(
    standardEndingsResult.output[0].data.lineCount,
  );
});

test('outputs comments when `minify: false`', async () => {
  const result = await Transformer.transform(
    baseConfig,
    '/root',
    'local/file.js',
    Buffer.from('/*#__PURE__*/arbitrary(code);', 'utf8'),
    {...baseTransformOptions, dev: false, minify: false},
  );
  expect(result.output[0].data.code).toMatchInlineSnapshot(`
    "__d(function (global, _$$_REQUIRE, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
      /*#__PURE__*/arbitrary(code);
    });"
  `);
});

test('omits comments when `minify: true`', async () => {
  const result = await Transformer.transform(
    baseConfig,
    '/root',
    'local/file.js',
    Buffer.from('/*#__PURE__*/arbitrary(code);', 'utf8'),
    {...baseTransformOptions, dev: false, minify: true},
  );
  expect(result.output[0].data.code).toMatchInlineSnapshot(`
    "__d(function (g, r, i, a, m, e, d) {
      minified(code);
    });"
  `);
});

test('allows outputting comments when `minify: true`', async () => {
  const result = await Transformer.transform(
    {...baseConfig, minifierConfig: {output: {comments: true}}},
    '/root',
    'local/file.js',
    Buffer.from('/*#__PURE__*/arbitrary(code);', 'utf8'),
    {...baseTransformOptions, dev: false, minify: true},
  );
  expect(result.output[0].data.code).toMatchInlineSnapshot(`
    "__d(function (g, r, i, a, m, e, d) {
      /*#__PURE__*/minified(code);
    });"
  `);
});
