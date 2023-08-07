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

import type {TransformResultDependency} from './types';

export type DependencyStackNode = Readonly<{
  // If `dependency` is null, this is a dependency whose origin isn't known
  // at the time we produced this stack. This happens in most incremental
  // traversals: since we can throw before we've finished processing
  // updates, all dependencies outside the immediate call stack are
  // potentially out of date, so we don't try to return them.
  dependency: null | TransformResultDependency,
  // Absolute path of the origin module if this is a concrete dependency,
  // or of the next known module in the chain if dependency is `null`.
  absolutePath: null | string,
  // The parent node in the dependency tree.
  parent: null | DependencyStackNode,
}>;

export function addImportStackToError(
  dependencyStack: DependencyStackNode,
  error: Error,
) {
  let importStackString = '';
  let node: ?DependencyStackNode = dependencyStack;
  let printedEllipsis = false;
  while (node) {
    if (node.dependency == null || node.absolutePath == null) {
      // Make sure we don't print multiple consecutive ellipses.
      if (!printedEllipsis) {
        if (importStackString !== '') {
          importStackString += '\n';
        }
        importStackString += '    (...)';
        printedEllipsis = true;
      }
    }

    if (node.absolutePath != null) {
      if (importStackString !== '') {
        importStackString += '\n';
      }
      const loc = node.dependency?.data.locs[0];

      importStackString +=
        // TODO: @nocommit Absolute paths are too verbose - relativize them (here / outside of Graph?)
        '    at ' +
        node.absolutePath +
        (loc ? `:${loc.start.line}:${loc.start.column + 1}` : '');
      printedEllipsis = false;
    }
    node = node.parent;
  }
  try {
    error.message += '\nImport stack:\n' + importStackString;

    // $FlowFixMe[prop-missing] Expando property for error reporters.
    error.metroImportStack = importStackString;
  } catch {
    // Mutating the error object might fail, so swallow any inner errors.
  }
}
