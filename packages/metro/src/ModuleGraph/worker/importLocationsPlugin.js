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

import type {ReadonlySourceLocation} from '../../shared/types';
import type {PluginObj} from '@babel/core';
import typeof * as Types from '@babel/types';
import type {MetroBabelFileMetadata} from 'metro-babel-transformer';

type ImportDeclarationLocs = Set<string>;

type State = {
  importDeclarationLocs: ImportDeclarationLocs,
  file: {
    metadata?: MetroBabelFileMetadata,
    ...
  },
  ...
};

function importLocationsPlugin({
  types: t,
}: {
  types: Types,
  ...
}): PluginObj<State> {
  return {
    visitor: {
      ImportDeclaration(path, {importDeclarationLocs}) {
        if (
          // Ignore type imports
          path.node.importKind !== 'type' &&
          // loc may not be set if this plugin runs alongside others which
          // inject imports - eg Babel runtime helpers. We don't regard these
          // as source import declarations.
          path.node.loc != null
        ) {
          importDeclarationLocs.add(locToKey(path.node.loc));
        }
      },
      ExportDeclaration(path, {importDeclarationLocs}) {
        if (
          // If `source` is set, this is a re-export, so it declares an ESM
          // dependency.
          path.node.source != null &&
          // Ignore type exports
          path.node.exportKind !== 'type' &&
          // As above, ignore injected imports.
          path.node.loc != null
        ) {
          importDeclarationLocs.add(locToKey(path.node.loc));
        }
      },
      Program(path, state) {
        // Initialise state
        state.importDeclarationLocs = new Set();

        // $FlowFixMe[incompatible-type] Babel `File` is not generically typed
        const metroMetadata: MetroBabelFileMetadata = state.file.metadata;

        // Set the result on a metadata property
        if (!metroMetadata.metro) {
          metroMetadata.metro = {
            unstable_importDeclarationLocs: state.importDeclarationLocs,
          };
        } else {
          metroMetadata.metro.unstable_importDeclarationLocs =
            state.importDeclarationLocs;
        }
      },
    },
  };
}

// Very simple serialisation of a source location. This should remain opaque to
// the caller.
const MISSING_LOC = {line: -1, column: -1};
function locToKey(loc: ReadonlySourceLocation): string {
  const {start = MISSING_LOC, end = MISSING_LOC} = loc;
  return `${start.line},${start.column}:${end.line},${end.column}`;
}

export {importLocationsPlugin, locToKey};
