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

import type {MixedOutput, Module} from '../../types';
import type {JsOutput} from 'metro-transform-worker';

import {isResolvedDependency} from '../../../lib/isResolvedDependency';
import {normalizePathSeparatorsToPosix} from '../../../lib/pathUtils';
import invariant from 'invariant';
import * as jscSafeUrl from 'jsc-safe-url';
import {addParamsToDefineCall} from 'metro-transform-plugins';
import path from 'node:path';

export type Options = Readonly<{
  createModuleId: string => number | string,
  dev: boolean,
  includeAsyncPaths: boolean,
  projectRoot: string,
  serverRoot: string,
  sourceUrl: ?string,
  // When set (and `unstable_inlineDependencyMap` is true), resolved module IDs are
  // inlined into each module body in place of `<dependencyMapReservedName>[i]`
  // references, instead of being appended as a dependency-map array argument.
  dependencyMapReservedName?: ?string,
  unstable_inlineDependencyMap?: boolean,
  ...
}>;

export function wrapModule(module: Module<>, options: Options): string {
  const output = getJsOutput(module);

  if (output.type.startsWith('js/script')) {
    return output.data.code;
  }

  if (
    options.unstable_inlineDependencyMap === true &&
    options.dependencyMapReservedName != null
  ) {
    return wrapModuleWithInlinedDependencyIds(
      module,
      output.data.code,
      options.dependencyMapReservedName,
      options,
    );
  }

  const params = getModuleParams(module, options);
  return addParamsToDefineCall(output.data.code, ...params);
}

function getModuleVerboseName(module: Module<>, options: Options): string {
  // The relative path of the module, to make debugging easier. This is mapped
  // to `module.verboseName` in `require.js`.
  return normalizePathSeparatorsToPosix(
    path.relative(options.projectRoot, module.path),
  );
}

function getModuleDependencies(
  module: Module<>,
  options: Options,
): {
  moduleId: number | string,
  dependencyMapArray: Array<number | string | null>,
  paths: {[moduleID: number | string]: unknown},
  hasPaths: boolean,
} {
  const moduleId = options.createModuleId(module.path);

  const paths: {[moduleID: number | string]: unknown} = {};
  let hasPaths = false;
  const dependencyMapArray = Array.from(module.dependencies.values()).map(
    dependency => {
      if (!isResolvedDependency(dependency)) {
        // An unresolved dependency, which should cause a runtime error
        // when required.
        return null;
      }
      const id = options.createModuleId(dependency.absolutePath);
      if (options.includeAsyncPaths && dependency.data.data.asyncType != null) {
        hasPaths = true;
        invariant(
          options.sourceUrl != null,
          'sourceUrl is required when includeAsyncPaths is true',
        );

        // TODO: Only include path if the target is not in the bundle

        // Construct a server-relative URL for the split bundle, propagating
        // most parameters from the main bundle's URL.

        const {searchParams} = new URL(
          jscSafeUrl.toNormalUrl(options.sourceUrl),
        );
        searchParams.set('modulesOnly', 'true');
        searchParams.set('runModule', 'false');

        const bundlePath = path.relative(
          options.serverRoot,
          dependency.absolutePath,
        );
        paths[id] =
          '/' +
          path.join(
            // TODO: This is not the proper Metro URL encoding of a file path
            path.dirname(bundlePath),
            // Strip the file extension
            path.basename(bundlePath, path.extname(bundlePath)),
          ) +
          '.bundle?' +
          searchParams.toString();
      }
      return id;
    },
  );

  return {moduleId, dependencyMapArray, paths, hasPaths};
}

export function getModuleParams(
  module: Module<>,
  options: Options,
): Array<unknown> {
  const {moduleId, dependencyMapArray, paths, hasPaths} = getModuleDependencies(
    module,
    options,
  );

  const params = [
    moduleId,
    hasPaths
      ? {
          // $FlowFixMe[not-an-object] Intentionally spreading an array into an object
          ...dependencyMapArray,
          paths,
        }
      : dependencyMapArray,
  ];

  if (options.dev) {
    params.push(getModuleVerboseName(module, options));
  }

  return params;
}

// Wraps a module after inlining resolved module IDs into its body (via
// `inlineModuleIdReferences`). Because synchronous `<dependencyMap>[i]`
// references are replaced with literal IDs, the dependency-map array argument is
// redundant and dropped. Async requires still read `<dependencyMap>.paths`, so a
// `{paths}` object is passed in the dependency-map argument slot when needed. In
// dev, an empty array keeps that slot occupied so the verbose-name argument
// stays in position.
function wrapModuleWithInlinedDependencyIds(
  module: Module<>,
  code: string,
  dependencyMapReservedName: string,
  options: Options,
): string {
  const {moduleId, dependencyMapArray, paths, hasPaths} = getModuleDependencies(
    module,
    options,
  );

  const inlinedCode = inlineModuleIdReferences(
    code,
    dependencyMapReservedName,
    dependencyMapArray.map(id => (id == null ? 'null' : id)),
  );

  const params: Array<unknown> = [moduleId];
  if (hasPaths) {
    params.push({paths});
  } else if (options.dev) {
    params.push(null);
  }
  if (options.dev) {
    params.push(getModuleVerboseName(module, options));
  }

  return addParamsToDefineCall(inlinedCode, ...params);
}

/**
 * Fast path for inlining module IDs as a cheap string operation, requiring
 * neither parsing nor any adjustment to the source map.
 *
 * Assumptions:
 * 1. `dependencyMapReservedName` is a globally reserved string; there are
 *    no false positives.
 * 2. The longest module ID in the bundle does not exceed a length of
 *    `dependencyMapReservedName.length + 3`. (We assert this below.)
 * 3. False negatives (failing to inline occasionally if an assumption
 *    isn't met) are rare to nonexistent, but safe if they do occur.
 *
 * Syntax definitions:
 * 1. A dependency map reference is a member expression which, if parsed,
 *    would have the form:
 *      MemberExpression
 *      ├──object: Identifier (name = dependencyMapReservedName)
 *      ├──property: NumericLiteral (value = some integer)
 *      └──computed: true
 * 2. The concrete form of a dependency map reference may contain embedded
 *    tabs or spaces, but no newlines (which would complicate source maps),
 *    parens (which would complicate detection) or comments (likewise).
 * 3. The numeric literal in a dependency map reference is a base-10
 *    integer printed as a simple sequence of digits.
 */
export function inlineModuleIdReferences(
  code: string,
  dependencyMapReservedName: string,
  dependencyIds: ReadonlyArray<number | string>,
  {
    ignoreMissingDependencyMapReference = false,
  }: Readonly<{ignoreMissingDependencyMapReference?: boolean}> = {},
): string {
  if (!dependencyIds.length) {
    // Nothing to inline in this module.
    return code;
  }

  if (!code.includes(dependencyMapReservedName)) {
    if (ignoreMissingDependencyMapReference) {
      return code;
    }

    // If we're here, the module was probably generated by some code that
    // doesn't make the dependency map name externally configurable, or a
    // mock that needs to be updated.
    throw new Error(
      `Module has dependencies but does not use the preconfigured dependency map name '${dependencyMapReservedName}'\n` +
        'This is an internal error in Metro.',
    );
  }
  const WS = '[\t ]*';
  const depMapReferenceRegex = new RegExp(
    escapeRegex(dependencyMapReservedName) + `${WS}\\[${WS}([0-9]+)${WS}\\]`,
    'g',
  );
  const inlinedCode = code.replace(depMapReferenceRegex, (match, depIndex) => {
    const idStr = dependencyIds[Number.parseInt(depIndex, 10)].toString();
    if (idStr.length > match.length) {
      // Stop the build rather than silently emit an incorrect source map.
      throw new Error(
        `Module ID doesn't fit in available space; add ${
          idStr.length - match.length
        } more characters to 'dependencyMapReservedName'.`,
      );
    }
    return idStr.padEnd(match.length);
  });
  return inlinedCode;
}

function escapeRegex(str: string): string {
  // From http://stackoverflow.com/questions/14076210/
  return str.replace(/([.?*+^$[\]\\(){}|-])/g, '\\$1');
}

export function getJsOutput(
  module: Readonly<{
    output: ReadonlyArray<MixedOutput>,
    path?: string,
    ...
  }>,
): JsOutput {
  const jsModules = module.output.filter(({type}) => type.startsWith('js/'));

  invariant(
    jsModules.length === 1,
    `Modules must have exactly one JS output, but ${
      module.path ?? 'unknown module'
    } has ${jsModules.length} JS outputs.`,
  );

  const jsOutput: JsOutput = jsModules[0] as any;

  invariant(
    Number.isFinite(jsOutput.data.lineCount),
    `JS output must populate lineCount, but ${
      module.path ?? 'unknown module'
    } has ${jsOutput.type} output with lineCount '${jsOutput.data.lineCount}'`,
  );

  return jsOutput;
}

export function isJsModule(module: Module<>): boolean {
  return module.output.filter(isJsOutput).length > 0;
}

function isJsOutput(output: MixedOutput): boolean {
  return output.type.startsWith('js/');
}
