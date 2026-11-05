/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 * @format
 * @oncall react_native
 */

import type {NodePath, Scope} from '@babel/traverse';
import type {
  Identifier,
  JSXIdentifier,
  JSXMemberExpression,
  JSXNamespacedName,
  Node,
  Program,
} from '@babel/types';

import {traverse} from '@babel/core';
import nullthrows from 'nullthrows';

export type Options = {
  reservedNames: ReadonlyArray<string>,
};

export default function normalizePseudoglobals(
  ast: Node,
  options?: Options,
): ReadonlyArray<string> {
  const reservedNames = new Set<
    | void
    | string
    | Identifier
    | JSXIdentifier
    | JSXMemberExpression
    | JSXNamespacedName,
  >(options?.reservedNames ?? []);
  const renamedParamNames = [];
  traverse(ast, {
    Program(path: NodePath<Program>): void {
      const params = path.get('body.0.expression.arguments.0.params');
      const body = path.get('body.0.expression.arguments.0.body');

      if (!body || Array.isArray(body) || !Array.isArray(params)) {
        path.stop();
        return;
      }

      const pseudoglobals: Array<string> = params
        .map(path => path.node.name)
        // $FlowFixMe[incompatible-type] Flow error uncovered by typing Babel more strictly
        .filter(name => !reservedNames.has(name));

      const usedShortNames = new Set<string>();
      const namePairs: Array<[string, string]> = pseudoglobals.map(fullName => [
        fullName,
        getShortName(fullName, usedShortNames),
      ]);

      for (const [fullName, shortName] of namePairs) {
        if (reservedNames.has(shortName)) {
          throw new ReferenceError(
            'Could not reserve the identifier ' +
              shortName +
              ' because it is the short name for ' +
              fullName,
          );
        }
        renamedParamNames.push(rename(fullName, shortName, body.scope));
      }

      path.stop();
    },
  });

  return renamedParamNames;
}

function getShortName(fullName: string, usedNames: Set<string>): string {
  // Try finding letters that are semantically relatable to the name
  // of the variable given. For instance, in XMLHttpRequest, it will
  // first match "X", then "H", then "R".
  const regexp = /^[^A-Za-z]*([A-Za-z])|([A-Z])[a-z]|([A-Z])[A-Z]+$/g;
  let match;

  while ((match = regexp.exec(fullName))) {
    const name = (match[1] || match[2] || match[3] || '').toLowerCase();

    if (!name) {
      throw new ReferenceError(
        'Could not identify any valid name for ' + fullName,
      );
    }

    if (!usedNames.has(name)) {
      usedNames.add(name);
      return name;
    }
  }

  throw new ReferenceError(
    `Unable to determine short name for ${fullName}. The variables are not unique: ${Array.from(
      usedNames,
    ).join(', ')}`,
  );
}

function rename(fullName: string, shortName: string, scope: Scope): string {
  let unusedName = shortName;

  // `generateUid` generates a name of the form name_ even if there was no conflict which we don't want.
  // Check if the desired name was never used and in that case proceed and only use `generateUid` if there's a
  // name clash.
  if (
    scope.hasLabel(shortName) ||
    scope.hasBinding(shortName) ||
    scope.hasGlobal(shortName) ||
    scope.hasReference(shortName)
  ) {
    unusedName = scope.generateUid(shortName);

    const programScope = scope.getProgramParent();
    nullthrows(programScope.references)[shortName] = true;
    nullthrows(programScope.uids)[shortName] = true;
  }

  scope.rename(fullName, unusedName);

  return unusedName;
}
