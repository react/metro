/**
 * Portions Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 * @format
 * @oncall react_native
 */

// Portions Copyright (c) 2015-present 650 Industries, Inc. (aka Expo), under MIT.

import type {PluginObj} from '@babel/core';
import type {NodePath} from '@babel/traverse';
import type {
  ExportAllDeclaration,
  ExportDefaultDeclaration,
  ExportNamedDeclaration,
  Expression,
  ImportDeclaration,
  Node,
  Program,
  SourceLocation,
  SourceLocation as BabelNodeSourceLocation,
  Statement,
} from '@babel/types';
// Type only dependency. This is not a runtime dependency
// eslint-disable-next-line import/no-extraneous-dependencies
import typeof * as Types from '@babel/types';

import template from '@babel/template';
import nullthrows from 'nullthrows';

export type Options = Readonly<{
  importDefault: string,
  importAll: string,
  liveBindings?: boolean,
  resolve: boolean,
  out?: {isESModule: boolean, ...},
}>;

type State = {
  exportAll: Array<{file: string, loc: ?SourceLocation, ...}>,
  exportAllLive: Array<{source: Node, loc: ?SourceLocation, ...}>,
  exportDefault: Array<{local: string, loc: ?SourceLocation, ...}>,
  exportGetters: Array<{
    remote: string,
    value: Expression,
    loc: ?SourceLocation,
    ...
  }>,
  exportNamed: Array<{
    local: string,
    remote: string,
    loc: ?SourceLocation,
    ...
  }>,
  imports: Array<{node: Statement}>,
  importDefault: Node,
  importAll: Node,
  opts: Options,
  ...
};

/**
 * Produces a Babel template that transforms an "import * as x from ..." or an
 * "import x from ..." call into a "const x = importAll(...)" call with the
 * corresponding id in it.
 */
const importTemplate = template.statement(`
  var LOCAL = IMPORT(FILE);
`);

/**
 * Produces a Babel template that transforms an "import {x as y} from ..." into
 * "const y = require(...).x" call with the corresponding id in it.
 */
const importNamedTemplate = template.statement(`
  var LOCAL = require(FILE).REMOTE;
`);

/**
 * Produces a Babel template that transforms an "import ..." into
 * "require(...)", which is considered a side-effect call.
 */
const importSideEffectTemplate = template.statement(`
  require(FILE);
`);

/**
 * Produces an "export all" template that traverses all exported symbols and
 * re-exposes them.
 */
const exportAllTemplate = template.statements(`
  var REQUIRED = require(FILE);

  for (var KEY in REQUIRED) {
    if (KEY === "default") continue;
    exports[KEY] = REQUIRED[KEY];
  }
`);

/**
 * Produces a "named export" or "default export" template to export a single
 * symbol.
 */
const exportTemplate = template.statement(`
  exports.REMOTE = LOCAL;
`);

/**
 * Live re-export forwarding ("export {x} from '...'"): defines a getter on
 * exports so that reads observe the current value in the source module, which
 * may change after this module is evaluated.
 */
const exportGetterTemplate = template.statement(`
  Object.defineProperty(exports, REMOTE, {
    enumerable: true,
    configurable: true,
    get: function () {
      return VALUE;
    },
  });
`);

/**
 * Reads a named binding from a required module, used inside a live re-export
 * getter.
 */
const requireMemberTemplate = template.expression(`
  require(FILE).REMOTE
`);

/**
 * Calls an import helper, used inside a live default re-export getter.
 */
const importCallTemplate = template.expression(`
  IMPORT(FILE)
`);

/**
 * Live "export all" ("export * from '...'"): defines a getter for each of the
 * source module's own enumerable names, except "default"/"__esModule" and names
 * already exported by this module (explicit exports take precedence). Reads stay
 * live.
 */
const exportAllLiveTemplate = template.statements(`
  var REQUIRED = require(FILE);

  Object.keys(REQUIRED).forEach(function (KEY) {
    if (
      KEY === "default" ||
      KEY === "__esModule" ||
      Object.prototype.hasOwnProperty.call(exports, KEY)
    ) {
      return;
    }

    Object.defineProperty(exports, KEY, {
      enumerable: true,
      configurable: true,
      get: function () {
        return REQUIRED[KEY];
      },
    });
  });
`);

/**
 * Flags the exported module as a transpiled ES module. Needs to be kept in 1:1
 * compatibility with Babel.
 */
const esModuleExportTemplate = template.statement(`
  Object.defineProperty(exports, '__esModule', {value: true});
`);

/**
 * Resolution template in case it is requested.
 */
const resolveTemplate = template.expression(`
  require.resolve(NODE)
`);

/**
 * Enforces the resolution of a path to a fully-qualified one, if set.
 */
function resolvePath<TNode extends Node>(
  node: TNode,
  resolve: boolean,
): Expression | TNode {
  if (!resolve) {
    return node;
  }

  return resolveTemplate({
    NODE: node,
  });
}

declare function withLocation<TNode extends Node>(
  node: TNode,
  loc: ?SourceLocation,
): TNode;

// eslint-disable-next-line no-redeclare
declare function withLocation<TNode extends Node>(
  node: ReadonlyArray<TNode>,
  loc: ?SourceLocation,
): Array<TNode>;

// eslint-disable-next-line no-redeclare
function withLocation(
  node: Node | ReadonlyArray<Node>,
  loc: ?BabelNodeSourceLocation,
): Array<Node> | Node {
  if (Array.isArray(node)) {
    return node.map(n => withLocation(n, loc));
  }
  if (!node.loc) {
    return {...node, loc};
  }
  return node;
}

export default function importExportPlugin({
  types: t,
}: {
  types: Types,
  ...
}): PluginObj<State> {
  const {isDeclaration, isVariableDeclaration} = t;

  return {
    visitor: {
      ExportAllDeclaration(
        path: NodePath<ExportAllDeclaration>,
        state: State,
      ): void {
        const loc = path.node.loc;
        const file = path.node.source;

        state.exportAll.push({
          file: file.value,
          loc,
        });

        if (state.opts.liveBindings === true) {
          // Defer emission to Program.exit so explicit exports (which take
          // precedence) are already defined on `exports` when the live getters
          // are installed.
          state.exportAllLive.push({
            source: resolvePath(t.cloneNode(file), state.opts.resolve),
            loc,
          });
        } else {
          withLocation(
            exportAllTemplate({
              FILE: resolvePath(t.cloneNode(file), state.opts.resolve),
              REQUIRED: path.scope.generateUidIdentifier(file.value),
              KEY: path.scope.generateUidIdentifier('key'),
            }),
            loc,
          ).forEach(node => state.imports.push({node}));
        }

        path.remove();
      },

      ExportDefaultDeclaration(
        path: NodePath<ExportDefaultDeclaration>,
        state: State,
      ): void {
        const declaration = path.node.declaration;
        const id =
          declaration.id || path.scope.generateUidIdentifier('default');

        // $FlowFixMe[prop-missing] Flow error uncovered by typing Babel more strictly
        declaration.id = id;

        const loc = path.node.loc;

        state.exportDefault.push({
          local: id.name,
          loc,
        });

        if (isDeclaration(declaration)) {
          path.insertBefore(withLocation(declaration, loc));
        } else {
          path.insertBefore(
            withLocation(
              t.variableDeclaration('var', [
                t.variableDeclarator(id, declaration),
              ]),
              loc,
            ),
          );
        }

        path.remove();
      },

      ExportNamedDeclaration(
        path: NodePath<ExportNamedDeclaration>,
        state: State,
      ): void {
        if (path.node.exportKind && path.node.exportKind !== 'value') {
          return;
        }

        const declaration = path.node.declaration;
        const loc = path.node.loc;

        if (declaration) {
          if (isVariableDeclaration(declaration)) {
            const bindings = t.getBindingIdentifiers(declaration);
            Object.keys(bindings).forEach(name => {
              state.exportNamed.push({local: name, remote: name, loc});
            });
          } else {
            const id = declaration.id || path.scope.generateUidIdentifier();
            const name = id.name;

            // $FlowFixMe[incompatible-type] Flow error uncovered by typing Babel more strictly
            // $FlowFixMe[prop-missing]
            declaration.id = id;
            // $FlowFixMe[incompatible-type]
            state.exportNamed.push({local: name, remote: name, loc});
          }

          path.insertBefore(declaration);
        }

        const specifiers = path.node.specifiers;
        if (specifiers) {
          specifiers.forEach(s => {
            const remote = s.exported;

            if (remote.type === 'StringLiteral') {
              // https://babeljs.io/docs/en/babel-plugin-syntax-module-string-names
              throw path.buildCodeFrameError<$FlowFixMe>(
                'Module string names are not supported',
              );
            }

            if (s.type === 'ExportNamespaceSpecifier') {
              const source = nullthrows(path.node.source);
              const temp = path.scope.generateUidIdentifier(remote.name);

              state.imports.push({
                node: withLocation(
                  importTemplate({
                    IMPORT: t.cloneNode(state.importAll),
                    FILE: resolvePath(t.cloneNode(source), state.opts.resolve),
                    LOCAL: temp,
                  }),
                  loc,
                ),
              });

              state.exportNamed.push({
                local: temp.name,
                remote: remote.name,
                loc,
              });
              return;
            }

            const local = s.local;

            if (path.node.source) {
              const source = nullthrows(path.node.source);

              if (state.opts.liveBindings === true) {
                // Re-export forwarding must be live: the source binding can be
                // reassigned after this module is evaluated, so we install a
                // getter rather than snapshotting the value.
                const value: Expression =
                  // $FlowFixMe[incompatible-use]
                  local.name === 'default'
                    ? importCallTemplate({
                        IMPORT: t.cloneNode(state.importDefault),
                        FILE: resolvePath(
                          t.cloneNode(source),
                          state.opts.resolve,
                        ),
                      })
                    : requireMemberTemplate({
                        FILE: resolvePath(
                          t.cloneNode(source),
                          state.opts.resolve,
                        ),
                        // $FlowFixMe[incompatible-call]
                        REMOTE: t.cloneNode(local),
                      });

                state.exportGetters.push({
                  remote: remote.name,
                  value,
                  loc,
                });
                return;
              }

              // $FlowFixMe[incompatible-use]
              const temp = path.scope.generateUidIdentifier(local.name);

              // $FlowFixMe[incompatible-type]
              // $FlowFixMe[incompatible-use]
              if (local.name === 'default') {
                state.imports.push({
                  node: withLocation(
                    importTemplate({
                      IMPORT: t.cloneNode(state.importDefault),
                      FILE: resolvePath(
                        t.cloneNode(nullthrows(path.node.source)),
                        state.opts.resolve,
                      ),
                      LOCAL: temp,
                    }),
                    loc,
                  ),
                });

                state.exportNamed.push({
                  local: temp.name,
                  remote: remote.name,
                  loc,
                });
              } else if (remote.name === 'default') {
                state.imports.push({
                  node: withLocation(
                    importNamedTemplate({
                      FILE: resolvePath(
                        t.cloneNode(nullthrows(path.node.source)),
                        state.opts.resolve,
                      ),
                      LOCAL: temp,
                      REMOTE: local,
                    }),
                    loc,
                  ),
                });

                state.exportDefault.push({local: temp.name, loc});
              } else {
                state.imports.push({
                  node: withLocation(
                    importNamedTemplate({
                      FILE: resolvePath(
                        t.cloneNode(nullthrows(path.node.source)),
                        state.opts.resolve,
                      ),
                      LOCAL: temp,
                      REMOTE: local,
                    }),
                    loc,
                  ),
                });

                state.exportNamed.push({
                  local: temp.name,
                  remote: remote.name,
                  loc,
                });
              }
            } else {
              if (remote.name === 'default') {
                // $FlowFixMe[incompatible-use]
                state.exportDefault.push({local: local.name, loc});
              } else {
                state.exportNamed.push({
                  // $FlowFixMe[incompatible-use]
                  local: local.name,
                  remote: remote.name,
                  loc,
                });
              }
            }
          });
        }

        path.remove();
      },

      ImportDeclaration(path: NodePath<ImportDeclaration>, state: State): void {
        if (path.node.importKind && path.node.importKind !== 'value') {
          return;
        }

        const file = path.node.source;
        const specifiers = path.node.specifiers;
        const loc = path.node.loc;

        if (!specifiers.length) {
          state.imports.push({
            node: withLocation(
              importSideEffectTemplate({
                FILE: resolvePath(t.cloneNode(file), state.opts.resolve),
              }),
              loc,
            ),
          });
        } else {
          let sharedModuleImport;
          let sharedModuleVariableDeclaration = null;
          if (
            specifiers.filter(
              s =>
                s.type === 'ImportSpecifier' &&
                (s.imported.type === 'StringLiteral' ||
                  s.imported.name !== 'default'),
            ).length > 1
          ) {
            sharedModuleImport =
              path.scope.generateUidIdentifierBasedOnNode(file);
            sharedModuleVariableDeclaration = withLocation(
              t.variableDeclaration('var', [
                t.variableDeclarator(
                  t.cloneNode(sharedModuleImport),
                  t.callExpression(t.identifier('require'), [
                    resolvePath(t.cloneNode(file), state.opts.resolve),
                  ]),
                ),
              ]),
              loc,
            );
            state.imports.push({node: sharedModuleVariableDeclaration});
          }

          specifiers.forEach(s => {
            const imported = s.imported;
            const local = s.local;

            switch (s.type) {
              case 'ImportNamespaceSpecifier':
                state.imports.push({
                  node: withLocation(
                    importTemplate({
                      IMPORT: t.cloneNode(state.importAll),
                      FILE: resolvePath(t.cloneNode(file), state.opts.resolve),
                      LOCAL: t.cloneNode(local),
                    }),
                    loc,
                  ),
                });
                break;

              case 'ImportDefaultSpecifier':
                state.imports.push({
                  node: withLocation(
                    importTemplate({
                      IMPORT: t.cloneNode(state.importDefault),
                      FILE: resolvePath(t.cloneNode(file), state.opts.resolve),
                      LOCAL: t.cloneNode(local),
                    }),
                    loc,
                  ),
                });
                break;

              case 'ImportSpecifier':
                // $FlowFixMe[incompatible-type]
                // $FlowFixMe[incompatible-use]
                if (imported.name === 'default') {
                  state.imports.push({
                    node: withLocation(
                      importTemplate({
                        IMPORT: t.cloneNode(state.importDefault),
                        FILE: resolvePath(
                          t.cloneNode(file),
                          state.opts.resolve,
                        ),
                        LOCAL: t.cloneNode(local),
                      }),
                      loc,
                    ),
                  });
                } else if (sharedModuleVariableDeclaration != null) {
                  sharedModuleVariableDeclaration.declarations.push(
                    withLocation(
                      t.variableDeclarator(
                        t.cloneNode(local),
                        t.memberExpression(
                          t.cloneNode(sharedModuleImport),
                          // $FlowFixMe[incompatible-type]
                          t.cloneNode(imported),
                        ),
                      ),
                      loc,
                    ),
                  );
                } else {
                  state.imports.push({
                    node: withLocation(
                      importNamedTemplate({
                        FILE: resolvePath(
                          t.cloneNode(file),
                          state.opts.resolve,
                        ),
                        LOCAL: t.cloneNode(local),
                        REMOTE: t.cloneNode(imported),
                      }),
                      loc,
                    ),
                  });
                }
                break;

              default:
                throw new TypeError('Unknown import type: ' + s.type);
            }
          });
        }

        path.remove();
      },

      Program: {
        enter(path: NodePath<Program>, state: State): void {
          state.exportAll = [];
          state.exportAllLive = [];
          state.exportDefault = [];
          state.exportGetters = [];
          state.exportNamed = [];

          state.imports = [];
          state.importAll = t.identifier(state.opts.importAll);
          state.importDefault = t.identifier(state.opts.importDefault);

          // Rename declarations at module scope that might otherwise conflict
          // with arguments we inject into the module factory.
          // Note that it isn't necessary to rename importAll/importDefault
          // because Metro already uses generateUid to generate unused names.
          ['module', 'global', 'exports', 'require'].forEach(name =>
            path.scope.rename(name),
          );
        },

        exit(path: NodePath<Program>, state: State): void {
          const body = path.node.body;

          // state.imports = [node1, node2, node3, ...nodeN]
          state.imports.reverse().forEach((e: {node: Statement}) => {
            // import nodes are added to the top of the program body
            body.unshift(e.node);
          });

          state.exportNamed.forEach(
            (e: {local: string, remote: string, loc: ?SourceLocation, ...}) => {
              body.push(
                withLocation(
                  exportTemplate({
                    LOCAL: t.identifier(e.local),
                    REMOTE: t.identifier(e.remote),
                  }),
                  e.loc,
                ),
              );
            },
          );

          state.exportDefault.forEach(
            (e: {local: string, loc: ?SourceLocation, ...}) => {
              body.push(
                withLocation(
                  exportTemplate({
                    LOCAL: t.identifier(e.local),
                    REMOTE: t.identifier('default'),
                  }),
                  e.loc,
                ),
              );
            },
          );

          // Live re-export forwarding getters (named/default `export … from`).
          // Emitted after the explicit data-property exports above so that, by
          // the time the live `export *` loops below run, `exports` already owns
          // every explicitly-exported name.
          state.exportGetters.forEach(
            (e: {
              remote: string,
              value: Expression,
              loc: ?SourceLocation,
              ...
            }) => {
              body.push(
                withLocation(
                  exportGetterTemplate({
                    REMOTE: t.stringLiteral(e.remote),
                    VALUE: e.value,
                  }),
                  e.loc,
                ),
              );
            },
          );

          // Live `export * from` forwarding loops.
          state.exportAllLive.forEach(
            (e: {source: Node, loc: ?SourceLocation, ...}) => {
              withLocation(
                exportAllLiveTemplate({
                  REQUIRED: path.scope.generateUidIdentifier('exportAll'),
                  FILE: e.source,
                  KEY: path.scope.generateUidIdentifier('key'),
                }),
                e.loc,
              ).forEach(node => body.push(node));
            },
          );

          if (
            state.exportDefault.length ||
            state.exportAll.length ||
            state.exportNamed.length ||
            state.exportGetters.length
          ) {
            body.unshift(esModuleExportTemplate());
            if (state.opts.out) {
              state.opts.out.isESModule = true;
            }
          } else if (state.opts.out) {
            state.opts.out.isESModule = false;
          }

          if (state.opts.liveBindings === true) {
            // Recompute scope information now that import/export declarations
            // have been rewritten, so that `constantViolations` reflect the
            // final tree.
            path.scope.crawl();

            // Map each exported local binding to the remote name(s) it is
            // exposed as.
            const localToRemotes: Map<string, Array<string>> = new Map();
            const addLocalRemote = (local: string, remote: string): void => {
              const remotes = localToRemotes.get(local);
              if (remotes != null) {
                remotes.push(remote);
              } else {
                localToRemotes.set(local, [remote]);
              }
            };
            state.exportNamed.forEach(e => addLocalRemote(e.local, e.remote));
            state.exportDefault.forEach(e =>
              addLocalRemote(e.local, 'default'),
            );

            const exportsMember = (remote: string) =>
              t.memberExpression(t.identifier('exports'), t.identifier(remote));

            // value  ->  exports.r1 = exports.r2 = ... = value
            const mirrorInto = (
              remotes: Array<string>,
              value: Expression,
            ): Expression => {
              let expr: Expression = value;
              for (const remote of remotes) {
                expr = t.assignmentExpression('=', exportsMember(remote), expr);
              }
              return expr;
            };

            // True where the update expression's own value cannot be observed,
            // so a postfix update may be rewritten without preserving it.
            const isValueDiscarded = (violation: NodePath<>): boolean => {
              const parent = violation.parentPath;
              if (parent == null) {
                return false;
              }
              return (
                parent.isExpressionStatement() ||
                (parent.isForStatement() &&
                  parent.node.update === violation.node)
              );
            };

            for (const [local, remotes] of localToRemotes) {
              const binding = path.scope.getBinding(local);
              if (binding == null) {
                continue;
              }
              for (const violation of binding.constantViolations) {
                const vnode = violation.node;
                if (t.isAssignmentExpression(vnode)) {
                  if (!t.isIdentifier(vnode.left, {name: local})) {
                    // Deferred: destructuring / non-identifier assignment
                    // targets.
                    continue;
                  }
                  // x <op>= v  ->  exports.r1 = exports.r2 = (x <op>= v)
                  violation.replaceWith(mirrorInto(remotes, vnode));
                  violation.skip();
                } else if (t.isUpdateExpression(vnode)) {
                  if (!t.isIdentifier(vnode.argument, {name: local})) {
                    continue;
                  }
                  if (vnode.prefix === true || isValueDiscarded(violation)) {
                    // ++x  ->  exports.r1 = ++x
                    //
                    // Postfix takes this path too where its value is
                    // unobservable: prefix and postfix have identical side
                    // effects, so switching form avoids needing a temporary.
                    violation.replaceWith(
                      mirrorInto(
                        remotes,
                        t.updateExpression(
                          vnode.operator,
                          vnode.argument,
                          true,
                        ),
                      ),
                    );
                    violation.skip();
                    continue;
                  }
                  // x++  ->  (t = x++, exports.r1 = x, t)
                  //
                  // Postfix evaluates to the *old* value, so it must be held in
                  // a temporary: mirroring reads the new value, and the outer
                  // expression has to keep yielding the old one.
                  const temp = path.scope.generateUidIdentifier(local);
                  path.scope.push({id: t.cloneNode(temp)});
                  violation.replaceWith(
                    t.sequenceExpression([
                      t.assignmentExpression('=', t.cloneNode(temp), vnode),
                      mirrorInto(remotes, t.identifier(local)),
                      t.cloneNode(temp),
                    ]),
                  );
                  violation.skip();
                }
              }
            }
          }
        },
      },
    },
  };
}
