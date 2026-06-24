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
import path from 'path';

export type Options = Readonly<{
  createModuleId: string => number | string,
  dev: boolean,
  includeAsyncPaths: boolean,
  projectRoot: string,
  serverRoot: string,
  sourceUrl: ?string,
  ...
}>;

export function wrapModule(module: Module<>, options: Options): string {
  const output = getJsOutput(module);

  if (output.type.startsWith('js/script')) {
    return output.data.code;
  }

  const params = getModuleParams(module, options);
  return addParamsToDefineCall(output.data.code, ...params);
}

export function getModuleParams(
  module: Module<>,
  options: Options,
): Array<unknown> {
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

        let searchParamsString = '';
        if (options.dev) {
          const {searchParams} = new URL(
            jscSafeUrl.toNormalUrl(options.sourceUrl),
          );
          searchParams.set('modulesOnly', 'true');
          searchParams.set('runModule', 'false');
          searchParamsString = '?' + searchParams.toString();
        }

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
          '.bundle' +
          searchParamsString;
      }
      return id;
    },
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
    // Add the relative path of the module to make debugging easier.
    // This is mapped to `module.verboseName` in `require.js`.
    params.push(
      normalizePathSeparatorsToPosix(
        path.relative(options.projectRoot, module.path),
      ),
    );
  }

  return params;
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
