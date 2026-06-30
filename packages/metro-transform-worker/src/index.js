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

import type {PluginEntry, Plugins} from '@babel/core';
import type {
  BabelTransformer,
  BabelTransformerArgs,
  CustomTransformOptions,
  TransformProfile,
} from 'metro-babel-transformer';
import type {
  BasicSourceMap,
  FBSourceFunctionMap,
  MetroSourceMapSegmentTuple,
  VlqMap,
} from 'metro-source-map';
import type {
  ImportExportPluginOptions,
  InlinePluginOptions,
  InlineRequiresPluginOptions,
} from 'metro-transform-plugins';
import type {TransformResultDependency} from 'metro/private/DeltaBundler';
import type {AllowOptionalDependencies} from 'metro/private/DeltaBundler/types';
import type {
  DependencyTransformer,
  DynamicRequiresBehavior,
} from 'metro/private/ModuleGraph/worker/collectDependencies';

import * as assetTransformer from './utils/assetTransformer';
import getMinifier from './utils/getMinifier';
import {transformFromAstSync} from '@babel/core';
import generate from '@babel/generator';
import * as babylon from '@babel/parser';
import * as types from '@babel/types';
import {stableHash} from 'metro-cache';
import {getCacheKey as metroGetCacheKey} from 'metro-cache-key';
import {
  fromRawMappings,
  functionMapBabelPlugin,
  toBabelSegments,
  toSegmentTuple,
  tuplesFromBabelDecodedMap,
  vlqMapFromBabelDecodedMap,
  vlqMapFromTuples,
} from 'metro-source-map';
import metroTransformPlugins from 'metro-transform-plugins';
import collectDependencies from 'metro/private/ModuleGraph/worker/collectDependencies';
import generateImportNames from 'metro/private/ModuleGraph/worker/generateImportNames';
import {
  importLocationsPlugin,
  locToKey,
} from 'metro/private/ModuleGraph/worker/importLocationsPlugin';
import * as JsFileWrapping from 'metro/private/ModuleGraph/worker/JsFileWrapping';
import nullthrows from 'nullthrows';

const InternalInvalidRequireCallError =
  collectDependencies.InvalidRequireCallError;

type MinifierConfig = Readonly<{[string]: unknown, ...}>;

export type MinifierOptions = {
  code: string,
  map: ?BasicSourceMap,
  filename: string,
  reserved: ReadonlyArray<string>,
  config: MinifierConfig,
  ...
};

export type MinifierResult = {
  code: string,
  map?: BasicSourceMap,
  ...
};

export type Minifier = MinifierOptions =>
  | MinifierResult
  | Promise<MinifierResult>;

export type Type = 'script' | 'module' | 'asset';

export type JsTransformerConfig = Readonly<{
  assetPlugins: ReadonlyArray<string>,
  assetRegistryPath: string,
  asyncRequireModulePath: string,
  babelTransformerPath: string,
  dynamicDepsInPackages: DynamicRequiresBehavior,
  enableBabelRCLookup: boolean,
  enableBabelRuntime: boolean | string,
  globalPrefix: string,
  hermesParser: boolean,
  minifierConfig: MinifierConfig,
  minifierPath: string,
  optimizationSizeLimit: number,
  publicPath: string,
  allowOptionalDependencies: AllowOptionalDependencies,
  unstable_dependencyMapReservedName: ?string,
  unstable_disableModuleWrapping: boolean,
  unstable_disableNormalizePseudoGlobals: boolean,
  unstable_compactOutput: boolean,
  /** Enable `require.context` statements which can be used to import multiple files in a directory. */
  unstable_allowRequireContext: boolean,
  /** With inlineRequires, enable a module-scope memo var and inline as (v || v=require('foo')) */
  unstable_memoizeInlineRequires?: boolean,
  /** With inlineRequires, do not memoize these module specifiers */
  unstable_nonMemoizedInlineRequires?: ReadonlyArray<string>,
  /** Whether to rename scoped `require` functions to `_$$_REQUIRE`, usually an extraneous operation when serializing to iife (default). */
  unstable_renameRequire?: boolean,
  /** Store source maps as compact VLQ-encoded strings (`VlqMap`) instead of decoded tuple arrays. Reduces source-map memory ~51% on the heap. Opt-in; changes `JsOutput.data.map` for consumers. */
  unstable_compactSourceMaps?: boolean,
}>;

export type {CustomTransformOptions} from 'metro-babel-transformer';

export type JsTransformOptions = Readonly<{
  customTransformOptions?: CustomTransformOptions,
  dev: boolean,
  experimentalImportSupport?: boolean,
  inlinePlatform: boolean,
  inlineRequires: boolean,
  minify: boolean,
  nonInlinedRequires?: ReadonlyArray<string>,
  platform: ?string,
  type: Type,
  unstable_memoizeInlineRequires?: boolean,
  unstable_nonMemoizedInlineRequires?: ReadonlyArray<string>,
  unstable_staticHermesOptimizedRequire?: boolean,
  unstable_transformProfile: TransformProfile,
}>;

opaque type Path = string;

type BaseFile = Readonly<{
  code: string,
  filename: Path,
  inputFileSize: number,
}>;

type AssetFile = Readonly<{
  ...BaseFile,
  type: 'asset',
}>;

type JSFileType = 'js/script' | 'js/module' | 'js/module/asset';

type JSFile = Readonly<{
  ...BaseFile,
  ast?: ?BabelNodeFile,
  type: JSFileType,
  functionMap: FBSourceFunctionMap | null,
  unstable_importDeclarationLocs?: ?ReadonlySet<string>,
}>;

type JSONFile = {
  ...BaseFile,
  type: Type,
};

type TransformationContext = Readonly<{
  config: JsTransformerConfig,
  projectRoot: Path,
  options: JsTransformOptions,
}>;

export type JsOutput = Readonly<{
  data: Readonly<{
    code: string,
    lineCount: number,
    map: Array<MetroSourceMapSegmentTuple> | VlqMap,
    functionMap: ?FBSourceFunctionMap,
  }>,
  type: JSFileType,
}>;

type TransformResponse = Readonly<{
  dependencies: ReadonlyArray<TransformResultDependency>,
  output: ReadonlyArray<JsOutput>,
}>;

function getDynamicDepsBehavior(
  inPackages: DynamicRequiresBehavior,
  filename: string,
): DynamicRequiresBehavior {
  switch (inPackages) {
    case 'reject':
      return 'reject';
    case 'throwAtRuntime':
      const isPackage = /(?:^|[/\\])node_modules[/\\]/.test(filename);
      return isPackage ? inPackages : 'reject';
    default:
      inPackages as empty;
      throw new Error(
        `invalid value for dynamic deps behavior: \`${inPackages}\``,
      );
  }
}

const minifyCode = async (
  config: JsTransformerConfig,
  projectRoot: string,
  filename: string,
  code: string,
  source: string,
  map: Array<MetroSourceMapSegmentTuple>,
  reserved?: ReadonlyArray<string> = [],
): Promise<{
  code: string,
  map: Array<MetroSourceMapSegmentTuple>,
  ...
}> => {
  const sourceMap = fromRawMappings([
    {
      code,
      // functionMap is overridden by the serializer
      functionMap: null,
      // isIgnored is overridden by the serializer
      isIgnored: false,
      map,
      path: filename,
      source,
    },
  ]).toMap(undefined, {});

  const minify = getMinifier(config.minifierPath);

  try {
    const minified = await minify({
      code,
      config: config.minifierConfig,
      filename,
      map: sourceMap,
      reserved,
    });

    return {
      code: minified.code,
      map: minified.map
        ? toBabelSegments(minified.map).map(toSegmentTuple)
        : [],
    };
  } catch (error) {
    if (error.constructor.name === 'JS_Parse_Error') {
      throw new Error(
        `${error.message} in file ${filename} at ${error.line}:${error.col}`,
      );
    }

    throw error;
  }
};

const disabledDependencyTransformer: DependencyTransformer = {
  transformIllegalDynamicRequire: () => void 0,
  transformImportCall: () => void 0,
  transformImportMaybeSyncCall: () => void 0,
  transformPrefetch: () => void 0,
  transformSyncRequire: () => void 0,
};

class InvalidRequireCallError extends Error {
  innerError: InternalInvalidRequireCallError;
  filename: string;

  constructor(innerError: InternalInvalidRequireCallError, filename: string) {
    super(`${filename}:${innerError.message}`);
    this.innerError = innerError;
    this.filename = filename;
  }
}

async function transformJS(
  file: JSFile,
  {config, options, projectRoot}: TransformationContext,
): Promise<TransformResponse> {
  // Transformers can output null ASTs (if they ignore the file). In that case
  // we need to parse the module source code to get their AST.
  let ast = file.ast ?? babylon.parse(file.code, {sourceType: 'unambiguous'});

  const {importDefault, importAll} = generateImportNames(ast);

  // Add "use strict" if the file was parsed as a module, and the directive did
  // not exist yet.
  const {directives} = ast.program;

  if (
    ast.program.sourceType === 'module' &&
    directives != null &&
    directives.findIndex(d => d.value.value === 'use strict') === -1
  ) {
    directives.push(types.directive(types.directiveLiteral('use strict')));
  }

  // Perform the import-export transform (in case it's still needed), then
  // fold requires and perform constant folding (if in dev).
  const plugins: Array<PluginEntry> = [];

  if (options.experimentalImportSupport === true) {
    plugins.push([
      metroTransformPlugins.importExportPlugin,
      {
        importAll,
        importDefault,
        resolve: false,
      } as ImportExportPluginOptions,
    ]);
  }

  if (options.inlineRequires) {
    plugins.push([
      metroTransformPlugins.inlineRequiresPlugin,
      {
        ignoredRequires: options.nonInlinedRequires,
        inlineableCalls: [importDefault, importAll],
        memoizeCalls:
          // $FlowFixMe[incompatible-type] is this always (?boolean)?
          options.customTransformOptions?.unstable_memoizeInlineRequires ??
          options.unstable_memoizeInlineRequires,
        nonMemoizedModules: options.unstable_nonMemoizedInlineRequires,
      } as InlineRequiresPluginOptions,
    ]);
  }

  plugins.push([
    metroTransformPlugins.inlinePlugin,
    {
      dev: options.dev,
      inlinePlatform: options.inlinePlatform,
      isWrapped: false,
      // $FlowFixMe[incompatible-type] expects a string if inlinePlatform
      platform: options.platform,
    } as InlinePluginOptions,
  ]);

  ast = nullthrows(
    transformFromAstSync(ast, '', {
      ast: true,
      babelrc: false,
      // Not-Cloning the input AST here should be safe because other code paths above this call
      // are mutating the AST as well and no code is depending on the original AST.
      // However, switching the flag to false caused issues with ES Modules if `experimentalImportSupport` isn't used https://github.com/facebook/metro/issues/641
      // either because one of the plugins is doing something funky or Babel messes up some caches.
      // Make sure to test the above mentioned case before flipping the flag back to false.
      cloneInputAst: true,
      code: false,
      comments: true,
      configFile: false,
      filename: file.filename,
      plugins,
      sourceMaps: false,
    }).ast,
  );

  if (!options.dev) {
    // Run the constant folding plugin in its own pass, avoiding race conditions
    // with other plugins that have exit() visitors on Program (e.g. the ESM
    // transform).
    ast = nullthrows(
      transformFromAstSync(ast, '', {
        ast: true,
        babelrc: false,
        cloneInputAst: false,
        code: false,
        comments: true,
        configFile: false,
        filename: file.filename,
        plugins: [metroTransformPlugins.constantFoldingPlugin],
        sourceMaps: false,
      }).ast,
    );
  }

  let dependencyMapName = '';
  let dependencies;
  let wrappedAst;

  // If the module to transform is a script (meaning that is not part of the
  // dependency graph and its code will just be prepended to the bundle modules),
  // we need to wrap it differently than a commonJS module (also, scripts do
  // not have dependencies).
  if (file.type === 'js/script') {
    dependencies = [];
    wrappedAst = JsFileWrapping.wrapPolyfill(ast);
  } else {
    try {
      const importDeclarationLocs = file.unstable_importDeclarationLocs ?? null;
      const opts = {
        allowOptionalDependencies: config.allowOptionalDependencies,
        asyncRequireModulePath: config.asyncRequireModulePath,
        dependencyMapName: config.unstable_dependencyMapReservedName,
        dependencyTransformer:
          config.unstable_disableModuleWrapping === true
            ? disabledDependencyTransformer
            : undefined,
        dynamicRequires: getDynamicDepsBehavior(
          config.dynamicDepsInPackages,
          file.filename,
        ),
        inlineableCalls: [importDefault, importAll],
        keepRequireNames: options.dev,
        unstable_allowRequireContext: config.unstable_allowRequireContext,
        unstable_isESMImportAtSource:
          importDeclarationLocs != null
            ? (loc: BabelSourceLocation) =>
                importDeclarationLocs.has(locToKey(loc))
            : null,
      };
      ({ast, dependencies, dependencyMapName} = collectDependencies(ast, opts));
    } catch (error) {
      if (error instanceof InternalInvalidRequireCallError) {
        throw new InvalidRequireCallError(error, file.filename);
      }
      throw error;
    }

    if (config.unstable_disableModuleWrapping === true) {
      wrappedAst = ast;
    } else {
      ({ast: wrappedAst} = JsFileWrapping.wrapModule(
        ast,
        importDefault,
        importAll,
        dependencyMapName,
        config.globalPrefix,
        // TODO: This config is optional to allow its introduction in a minor
        // release. It should be made non-optional in ConfigT or removed in
        // future.
        config.unstable_renameRequire === false,
        {
          unstable_useStaticHermesModuleFactory: Boolean(
            options.customTransformOptions
              ?.unstable_staticHermesOptimizedRequire,
          ),
        },
      ));
    }
  }

  const minify =
    options.minify &&
    options.unstable_transformProfile !== 'hermes-canary' &&
    options.unstable_transformProfile !== 'hermes-stable';

  const reserved = [];
  if (config.unstable_dependencyMapReservedName != null) {
    reserved.push(config.unstable_dependencyMapReservedName);
  }
  if (
    minify &&
    file.inputFileSize <= config.optimizationSizeLimit &&
    !config.unstable_disableNormalizePseudoGlobals
  ) {
    reserved.push(
      ...metroTransformPlugins.normalizePseudoGlobals(wrappedAst, {
        reservedNames: reserved,
      }),
    );
  }

  const result = generate(
    wrappedAst,
    {
      comments: true,
      compact: config.unstable_compactOutput,
      filename: file.filename,
      retainLines: false,
      sourceFileName: file.filename,
      sourceMaps: true,
    },
    file.code,
  );

  let code = result.code;
  let map: Array<MetroSourceMapSegmentTuple> | VlqMap;
  let lineCount: number;

  if (config.unstable_compactSourceMaps === true && !minify) {
    // Dominant path (e.g. Hermes, which doesn't minify): encode the compact VLQ
    // map straight from Babel's eagerly-computed decoded map, never
    // materialising tuples. Byte-identical to the tuple path below.
    const {lineCount: lines, lastLineColumn} = countLines(code);
    lineCount = lines;
    map = vlqMapFromBabelDecodedMap(
      result.decodedMap ?? {mappings: [], names: []},
      [lines, lastLineColumn],
    );
  } else {
    // Derive tuples from Babel's eagerly-computed decoded map rather than
    // `result.rawMappings`, which would trigger a second, more expensive decode
    // (`allMappings`). Byte-identical to `result.rawMappings.map(toSegmentTuple)`.
    let tuples = result.decodedMap
      ? tuplesFromBabelDecodedMap(result.decodedMap)
      : [];

    if (minify) {
      // The minifier returns its own map (not Babel's `decodedMap`), so the
      // fast path above can't apply; re-encode the resulting tuples if compact.
      ({map: tuples, code} = await minifyCode(
        config,
        projectRoot,
        file.filename,
        result.code,
        file.code,
        tuples,
        reserved,
      ));
    }

    ({lineCount, map: tuples} = countLinesAndTerminateMap(code, tuples));
    map =
      config.unstable_compactSourceMaps === true
        ? vlqMapFromTuples(tuples)
        : tuples;
  }

  const output: Array<JsOutput> = [
    {
      data: {
        code,
        functionMap: file.functionMap,
        lineCount,
        map,
      },
      type: file.type,
    },
  ];

  return {
    dependencies,
    output,
  };
}

/**
 * Transforms an asset file
 */
async function transformAsset(
  file: AssetFile,
  context: TransformationContext,
): Promise<TransformResponse> {
  const {assetRegistryPath, assetPlugins} = context.config;

  const result = await assetTransformer.transform(
    getBabelTransformArgs(file, context),
    assetRegistryPath,
    assetPlugins,
  );

  const jsFile = {
    ...file,
    ast: result.ast,
    functionMap: null,
    type: 'js/module/asset' as const,
  };

  return transformJS(jsFile, context);
}

/**
 * Transforms a JavaScript file with Babel before processing the file with
 * the generic JavaScript transformation.
 */
async function transformJSWithBabel(
  file: JSFile,
  context: TransformationContext,
): Promise<TransformResponse> {
  const {babelTransformerPath} = context.config;
  // $FlowFixMe[unsupported-syntax] dynamic require
  const mod = require(babelTransformerPath);
  const transformer: BabelTransformer =
    mod.__esModule === true && 'default' in mod ? mod.default : mod;

  const transformResult = await transformer.transform(
    getBabelTransformArgs(file, context, [
      // functionMapBabelPlugin populates metadata.metro.functionMap
      functionMapBabelPlugin,
      // importLocationsPlugin populates metadata.metro.unstable_importDeclarationLocs
      importLocationsPlugin,
    ]),
  );

  const jsFile: JSFile = {
    ...file,
    ast: transformResult.ast,
    functionMap:
      transformResult.metadata?.metro?.functionMap ??
      // Fallback to deprecated explicitly-generated `functionMap`
      transformResult.functionMap ??
      null,
    unstable_importDeclarationLocs:
      transformResult.metadata?.metro?.unstable_importDeclarationLocs,
  };

  return await transformJS(jsFile, context);
}

async function transformJSON(
  file: JSONFile,
  {options, config, projectRoot}: TransformationContext,
): Promise<TransformResponse> {
  let code =
    config.unstable_disableModuleWrapping === true
      ? JsFileWrapping.jsonToCommonJS(file.code)
      : JsFileWrapping.wrapJson(
          file.code,
          config.globalPrefix,
          Boolean(
            options.customTransformOptions
              ?.unstable_staticHermesOptimizedRequire,
          ),
        );
  let map: Array<MetroSourceMapSegmentTuple> = [];

  // TODO: When we can reuse transformJS for JSON, we should not derive `minify` separately.
  const minify =
    options.minify &&
    options.unstable_transformProfile !== 'hermes-canary' &&
    options.unstable_transformProfile !== 'hermes-stable';

  if (minify) {
    ({map, code} = await minifyCode(
      config,
      projectRoot,
      file.filename,
      code,
      file.code,
      map,
    ));
  }

  let jsType: JSFileType;

  if (file.type === 'asset') {
    jsType = 'js/module/asset';
  } else if (file.type === 'script') {
    jsType = 'js/script';
  } else {
    jsType = 'js/module';
  }

  let lineCount;
  ({lineCount, map} = countLinesAndTerminateMap(code, map));
  // The JSON path builds tuples directly (no Babel `decodedMap`), so when
  // compact we re-encode the finished tuples to VLQ.
  const outputMap =
    config.unstable_compactSourceMaps === true ? vlqMapFromTuples(map) : map;
  const output: Array<JsOutput> = [
    {
      data: {code, functionMap: null, lineCount, map: outputMap},
      type: jsType,
    },
  ];

  return {
    dependencies: [],
    output,
  };
}

function getBabelTransformArgs(
  file: Readonly<{filename: Path, code: string, ...}>,
  {options, config, projectRoot}: TransformationContext,
  plugins?: Plugins = [],
): BabelTransformerArgs {
  const {inlineRequires: _, ...babelTransformerOptions} = options;
  return {
    filename: file.filename,
    options: {
      ...babelTransformerOptions,
      enableBabelRCLookup: config.enableBabelRCLookup,
      enableBabelRuntime: config.enableBabelRuntime,
      globalPrefix: config.globalPrefix,
      hermesParser: config.hermesParser,
      projectRoot,
      publicPath: config.publicPath,
    },
    plugins,
    src: file.code,
  };
}

export const transform = async (
  config: JsTransformerConfig,
  projectRoot: string,
  filename: string,
  data: Buffer,
  options: JsTransformOptions,
): Promise<TransformResponse> => {
  const context: TransformationContext = {
    config,
    options,
    projectRoot,
  };
  const sourceCode = data.toString('utf8');

  const reservedStrings = [];
  if (
    options.customTransformOptions?.unstable_staticHermesOptimizedRequire ==
    true
  ) {
    reservedStrings.push('_$$_METRO_MODULE_ID');
  }
  if (config.unstable_dependencyMapReservedName != null) {
    reservedStrings.push(config.unstable_dependencyMapReservedName);
  }
  for (const reservedString of reservedStrings) {
    const position = sourceCode.indexOf(reservedString);
    if (position > -1) {
      throw new SyntaxError(
        'Source code contains the reserved string `' +
          reservedString +
          '` at character offset ' +
          position,
      );
    }
  }

  if (filename.endsWith('.json')) {
    const jsonFile: JSONFile = {
      code: sourceCode,
      filename,
      inputFileSize: data.length,
      type: options.type,
    };

    return await transformJSON(jsonFile, context);
  }

  if (options.type === 'asset') {
    const file: AssetFile = {
      code: sourceCode,
      filename,
      inputFileSize: data.length,
      type: options.type,
    };

    return await transformAsset(file, context);
  }

  const file: JSFile = {
    code: sourceCode,
    filename,
    functionMap: null,
    inputFileSize: data.length,
    type: options.type === 'script' ? 'js/script' : 'js/module',
  };

  return await transformJSWithBabel(file, context);
};

export const getCacheKey = (
  config: JsTransformerConfig,
  opts?: Readonly<{projectRoot: string, ...}>,
): string => {
  const {babelTransformerPath, minifierPath, ...remainingConfig} = config;

  const filesKey = metroGetCacheKey([
    __filename,
    require.resolve(babelTransformerPath),
    require.resolve(minifierPath),
    require.resolve('./utils/getMinifier'),
    require.resolve('./utils/assetTransformer'),
    require.resolve('metro/private/ModuleGraph/worker/generateImportNames'),
    require.resolve('metro/private/ModuleGraph/worker/JsFileWrapping'),
    ...metroTransformPlugins.getTransformPluginCacheKeyFiles(),
  ]);

  // $FlowFixMe[unsupported-syntax]
  const babelTransformer = require(babelTransformerPath) as BabelTransformer;

  // Get cache key from babel transformer, which may include user's babel config files
  const babelTransformerCacheKey = babelTransformer.getCacheKey
    ? babelTransformer.getCacheKey({
        projectRoot: opts?.projectRoot,
        enableBabelRCLookup: config.enableBabelRCLookup,
      })
    : '';

  return [
    filesKey,
    stableHash(remainingConfig).toString('hex'),
    babelTransformerCacheKey,
  ].join('$');
};

function countLines(code: string): {
  lineCount: number,
  lastLineColumn: number,
} {
  const NEWLINE = /\r\n?|\n|\u2028|\u2029/g;
  let lineCount = 1;
  let lastLineStart = 0;

  // Count lines and keep track of where the last line starts
  for (const match of code.matchAll(NEWLINE)) {
    lineCount++;
    lastLineStart = match.index + match[0].length;
  }
  return {lineCount, lastLineColumn: code.length - lastLineStart};
}

function countLinesAndTerminateMap(
  code: string,
  map: ReadonlyArray<MetroSourceMapSegmentTuple>,
): {
  lineCount: number,
  map: Array<MetroSourceMapSegmentTuple>,
} {
  const {lineCount, lastLineColumn} = countLines(code);
  const lastLineIndex1Based = lineCount;
  const lastLineNextColumn0Based = lastLineColumn;

  // If there isn't a mapping at one-past-the-last column of the last line,
  // add one that maps to nothing. This ensures out-of-bounds lookups hit the
  // null mapping rather than aliasing to whichever mapping happens to be last.
  // ASSUMPTION: Mappings are generated in order of increasing line and column.
  const lastMapping = map[map.length - 1];
  const terminatingMapping = [lastLineIndex1Based, lastLineNextColumn0Based];
  if (
    !lastMapping ||
    lastMapping[0] !== terminatingMapping[0] ||
    lastMapping[1] !== terminatingMapping[1]
  ) {
    return {
      lineCount,
      map: map.concat([terminatingMapping]),
    };
  }
  return {lineCount, map: [...map]};
}
