/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow strict-local
 */

'use strict';

/*::
// $FlowExpectedError[untyped-type-import] - eslint not typed in OSS
import type {RuleModule, SuggestionReportDescriptor} from 'eslint';
import type {StringLiteral} from 'flow-estree';
*/

/**
 * Lint against imports from the `src` directory of Metro packages. These are
 * deprecated in favour of package root (semver public) exports, and explicitly
 * /private/ deep imports.
 *
 * We make an exception for `metro-runtime`, because:
 *  1) Runtime modules and polyfills must be imported as single files, so they
 *     may be selectively bundled and so unwanted side-effects are not
 *     evaluated - so some kind of subpath import is essential.
 *  2) While we do have a `package.json#exports` map in metro-runtime, we can't
 *     currently enforce the use of it because `exports` resolution may be
 *     opted-out in Metro resolver.
 */

const METRO_DEEP_IMPORT_RE = /^(metro(?!-runtime)(?:-[a-z\-]+)?)\/src\//;
const messageId = 'METRO_DEEP_IMPORT';

// $FlowExpectedError[value-as-type] - eslint not typed in OSS
const rule /*: RuleModule */ = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Deep imports from Metro must use explicitly-private subpaths',
    },
    messages: {
      METRO_DEEP_IMPORT:
        "Metro deep imports from src ('{{originalImport}}') are deprecated. Prefer top level imports, or replace '/src/' with '/private/'.",
    },
    schema: [],
    fixable: 'code',
  },

  create(context) {
    return {
      ImportDeclaration(node) {
        if (
          typeof node.source.value !== 'string' ||
          !METRO_DEEP_IMPORT_RE.test(node.source.value)
        ) {
          return;
        }
        const stringNode = node.source;
        context.report({
          node: node.source,
          messageId,
          data: {originalImport: stringNode.value},
          fix: getFix(stringNode),
        });
      },
      CallExpression(node) {
        if (
          node.callee.type !== 'Identifier' ||
          node.callee.name !== 'require' ||
          node.arguments.length < 1 ||
          node.arguments[0].type !== 'Literal' ||
          node.arguments[0].literalType !== 'string' ||
          !METRO_DEEP_IMPORT_RE.test(node.arguments[0].value)
        ) {
          return;
        }
        const stringNode = node.arguments[0];
        context.report({
          node,
          messageId,
          data: {originalImport: stringNode.value},
          fix: getFix(stringNode),
        });
      },
    };
  },
};

module.exports = rule;

function getFix(
  nodeToReplace /*: StringLiteral */,
  // $FlowExpectedError[value-as-type] - eslint not typed in OSS
) /*: SuggestionReportDescriptor['fix'] */ {
  return fixer =>
    fixer.replaceText(
      nodeToReplace,
      `'${nodeToReplace.value.replace(METRO_DEEP_IMPORT_RE, '$1/private/')}'`,
    );
}
