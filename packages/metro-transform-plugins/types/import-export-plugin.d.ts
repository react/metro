/**
 * Portions Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<587cbe7792cfd21ce4abb4bfb5bac2f8>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-transform-plugins/src/import-export-plugin.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {PluginObj} from '@babel/core';
import type * as $$IMPORT_TYPEOF_1$$ from '@babel/types';
import type {Node, SourceLocation, Statement} from '@babel/types';

type Types = typeof $$IMPORT_TYPEOF_1$$;
export type Options = Readonly<{
  importDefault: string;
  importAll: string;
  resolve: boolean;
  out?: {isESModule: boolean};
}>;
type State = {
  exportAll: Array<{file: string; loc: null | undefined | SourceLocation}>;
  exportDefault: Array<{
    local: string;
    loc: null | undefined | SourceLocation;
  }>;
  exportNamed: Array<{
    local: string;
    remote: string;
    loc: null | undefined | SourceLocation;
  }>;
  imports: Array<{node: Statement}>;
  importDefault: Node;
  importAll: Node;
  opts: Options;
};
declare function importExportPlugin($$PARAM_0$$: {
  types: Types;
}): PluginObj<State>;
export default importExportPlugin;
