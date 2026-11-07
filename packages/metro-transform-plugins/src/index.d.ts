/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type constantFoldingPlugin from './constant-folding-plugin';
import type importExportPlugin from './import-export-plugin';
import type inlinePlugin from './inline-plugin';
import type inlineRequiresPlugin from './inline-requires-plugin';
import type normalizePseudoGlobals from './normalizePseudoGlobals';

interface TransformPlugins {
  addParamsToDefineCall(code: string, ...params: unknown[]): string;
  constantFoldingPlugin: typeof constantFoldingPlugin;
  importExportPlugin: typeof importExportPlugin;
  inlinePlugin: typeof inlinePlugin;
  inlineRequiresPlugin: typeof inlineRequiresPlugin;
  normalizePseudoGlobals: typeof normalizePseudoGlobals;
  getTransformPluginCacheKeyFiles(): ReadonlyArray<string>;
}

declare const transformPlugins: TransformPlugins;
export = transformPlugins;
