/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

import type {Binding, NodePath} from '@babel/traverse';
import type {
  CallExpression,
  File,
  Identifier,
  Node,
  Program,
} from '@babel/types';
import type {TransformResultDependency as Dependency} from 'metro/private/DeltaBundler/types';

import traverseFile from './traverseFile';
import invariant from 'invariant';
import nullthrows from 'nullthrows';

export type IRFile = Readonly<{
  ast: File,
  dependencies: ReadonlyArray<Dependency>,
  // The original code that locations in `ast` refer to.
  sourceCode: string,
  globalPrefix: string,
}>;

/**
 * `visitDependencyUses` is a generic utility for statically analysing /
 * meta-evaluating references to dependencies in the body of a module compiled
 * by Metro. We pass a file in "Metro IR" form, a dependency filter and a set of
 * visitors, which are invoked synchronously as appropriate.
 *
 * # Metro IR
 *
 * The form of IR that we analyse here consists of:
 *
 * * The AST after transformation (**and possibly minification**), including
 *   wrapping in a module factory and a call to `__d()`.
 * * The (unresolved) dependency list extracted by the transformer.
 * * The source code of the module (for error reporting).
 * * The `globalPrefix` config setting (so we can detect calls to the global
 *   `__d` function if there is a prefix set).
 *
 * # Visitors
 *
 * Each visitor takes a Babel AST node path and, where applicable, a Metro
 * dependency descriptor.
 *
 * A *dependency reference* is an expression that evaluates to a value imported
 * from a dependency that passes the filter. The respective dependency is
 * described by the `dep` parameter.
 *
 * * `visitCall(path, dep)`: `path` is a call expression, where the callee is a
 *   dependency reference to a default export (ESM or CommonJS).
 * * `visitOther(path, dep)`: `path` is a dependency reference that does not
 *   fall into any other analysable bucket (i.e. it's not a call). Most
 *   analysers will want to throw an error here.
 * * `visitNonAnalyzableRequire(path)`: `path` is a reference to the `require`
 *   function itself (or one of the other Metro builtins e.g. `importAll`,
 *   `importDefault`) that is used in some way that cannot be analysed - e.g.
 *   mutated or stored in a variable. Most analysers will want to throw an error
 *   here. Note that this will only be called if any dependencies pass the
 *   filter (or if there is no filter).
 */
export default function visitDependencyUses(
  file: IRFile,
  visitors: Readonly<{
    dependencyFilter?: (dep: Dependency) => boolean,
    visitCall: (path: NodePath<CallExpression>, dep: Dependency) => void,
    visitOther: (path: NodePath<>, dep: Dependency) => void,
    visitNonAnalyzableRequire: (path: NodePath<>) => void,
  }>,
): void {
  const {
    dependencyFilter,
    visitNonAnalyzableRequire = (_path: NodePath<>) => {},
    visitCall = (_path: NodePath<CallExpression>, _dep: Dependency) => {},
    visitOther = (_path: NodePath<>, _dep: Dependency) => {},
  } = visitors;
  if (
    dependencyFilter != null &&
    !file.dependencies.some(dep => dependencyFilter(dep))
  ) {
    return;
  }
  const {
    requireParamBinding,
    importDefaultParamBinding,
    importAllParamBinding,
    depMapParamBinding,
  } = bindModuleIRElements(file);
  for (const path of requireParamBinding.referencePaths.concat(
    importDefaultParamBinding.referencePaths,
  )) {
    const req = bindRequireCallElements(path, {depMapParamBinding});
    if (!req) {
      visitNonAnalyzableRequire(path);
      continue;
    }
    const dep = file.dependencies[req.depIndex];
    if (dependencyFilter != null && !dependencyFilter(dep)) {
      continue;
    }
    for (const {path: referencePath} of walkReferences(req.exprPath)) {
      if (
        referencePath.parentPath &&
        referencePath.parentPath.node.type === 'CallExpression' &&
        referencePath.parentPath.node.callee === referencePath.node
      ) {
        // $FlowFixMe[incompatible-type] parentPath is narrowed to a CallExpression above
        visitCall(referencePath.parentPath, dep);
      } else {
        visitOther(referencePath, dep);
      }
    }
  }
  for (const path of importAllParamBinding.referencePaths) {
    const req = bindRequireCallElements(path, {depMapParamBinding});
    if (!req) {
      visitNonAnalyzableRequire(path);
      continue;
    }
    const dep = file.dependencies[req.depIndex];
    if (dependencyFilter != null && !dependencyFilter(dep)) {
      continue;
    }
    for (const {path: referencePath} of walkReferences(req.exprPath)) {
      visitOther(referencePath, dep);
    }
  }
}

function* walkReferences(
  initialCandidateUse: NodePath<>,
): Iterable<{path: NodePath<>}> {
  const candidateUses = new Map<Node, NodePath<>>([
    [initialCandidateUse.node, initialCandidateUse],
  ]);
  for (const p of candidateUses.values()) {
    const parentPath = nullthrows(p.parentPath);
    if (
      parentPath.node.type === 'VariableDeclarator' &&
      parentPath.node.init === p.node &&
      parentPath.node.id.type === 'Identifier'
    ) {
      const varIdNode = parentPath.node.id;
      const depBinding = nullthrows(
        parentPath.scope.getBinding(varIdNode.name),
      );
      if (depBinding.constant) {
        for (const depRefPath of depBinding.referencePaths) {
          if (depRefPath.node === varIdNode) {
            continue;
          }
          if (candidateUses.has(depRefPath.node)) {
            continue;
          }
          candidateUses.set(depRefPath.node, depRefPath);
        }
        continue;
      }
    }
    yield {path: p};
  }
}

function bindRequireCallElements(
  path: NodePath<>,
  {depMapParamBinding}: Readonly<{depMapParamBinding: ?Binding}>,
): ?Readonly<{depIndex: number, exprPath: NodePath<CallExpression>}> {
  const requireCallPath = nullthrows(path.parentPath);
  if (
    requireCallPath.node.type === 'CallExpression' &&
    requireCallPath.node.callee === path.node &&
    requireCallPath.node.arguments.length > 0
  ) {
    const depMapReferencePath = requireCallPath.get('arguments.0');
    invariant(!Array.isArray(depMapReferencePath), 'Invalid Metro module IR');
    if (!(
      depMapReferencePath.node.type === 'MemberExpression' &&
      depMapReferencePath.node.computed &&
      depMapReferencePath.node.object.type === 'Identifier' &&
      depMapReferencePath.scope.getBinding(
        depMapReferencePath.node.object.name,
      ) === depMapParamBinding
    )) {
      // Non-analyzable argument to require
      return null;
    }
  } else {
    // Non-analyzable use of require
    return null;
  }
  const depIndexPath = requireCallPath.get('arguments.0.property');
  invariant(!Array.isArray(depIndexPath), 'Invalid Metro module IR');
  const depIndex = depIndexPath.evaluate();
  invariant(
    depIndex.confident && typeof depIndex.value === 'number',
    'Invalid Metro Module IR',
  );
  // $FlowFixMe[incompatible-type] requireCallPath is narrowed to a CallExpression above
  return {depIndex: depIndex.value, exprPath: requireCallPath};
}

function bindModuleIRElements(file: IRFile): Readonly<{
  requireParamBinding: Binding,
  importDefaultParamBinding: Binding,
  importAllParamBinding: Binding,
  depMapParamBinding: ?Binding,
}> {
  let maybeState: ?{
    requireParamPath: NodePath<Identifier>,
    importDefaultParamPath: NodePath<Identifier>,
    importAllParamPath: NodePath<Identifier>,
    depMapParamPath?: NodePath<Identifier>,
  };
  traverseFile(
    file,
    {
      Program(path: NodePath<Program>) {
        invariant(path.node.body.length === 1, 'Invalid Metro module IR');
        invariant(
          path.node.body[0].type === 'ExpressionStatement',
          'Invalid Metro module IR',
        );
        const moduleDefinerFnCall = path.node.body[0].expression;
        invariant(
          moduleDefinerFnCall.type === 'CallExpression',
          'Invalid Metro module IR',
        );
        invariant(
          moduleDefinerFnCall.callee.type === 'Identifier',
          'Invalid Metro module IR',
        );
        invariant(
          moduleDefinerFnCall.callee.name === file.globalPrefix + '__d',
          'Invalid Metro module IR',
        );
        invariant(
          moduleDefinerFnCall.arguments.length >= 1,
          'Invalid Metro module IR',
        );
        const moduleDefinerFn = moduleDefinerFnCall.arguments[0];
        invariant(
          moduleDefinerFn.type === 'FunctionExpression',
          'Invalid Metro module IR',
        );
        const allParamPaths = path.get('body.0.expression.arguments.0.params');
        invariant(Array.isArray(allParamPaths), 'Invalid Metro module IR');
        invariant(allParamPaths.length >= 2, 'Invalid Metro module IR');
        const requireParamPath = allParamPaths[1];
        invariant(
          requireParamPath.node.type === 'Identifier',
          'Invalid Metro module IR',
        );

        invariant(allParamPaths.length >= 3, 'Invalid Metro module IR');
        const importDefaultParamPath = allParamPaths[2];
        invariant(
          importDefaultParamPath.node.type === 'Identifier',
          'Invalid Metro module IR',
        );

        invariant(allParamPaths.length >= 4, 'Invalid Metro module IR');
        const importAllParamPath = allParamPaths[3];
        invariant(
          importAllParamPath.node.type === 'Identifier',
          'Invalid Metro module IR',
        );

        invariant(allParamPaths.length >= 5, 'Invalid Metro module IR');
        const depMapParamPath = allParamPaths[allParamPaths.length - 1];
        invariant(
          depMapParamPath.node.type === 'Identifier',
          'Invalid Metro module IR',
        );

        maybeState = {
          // $FlowFixMe[incompatible-type] narrowed to Identifier above
          requireParamPath,
          // $FlowFixMe[incompatible-type] narrowed to Identifier above
          importDefaultParamPath,
          // $FlowFixMe[incompatible-type] narrowed to Identifier above
          importAllParamPath,
          // $FlowFixMe[incompatible-type] narrowed to Identifier above
          depMapParamPath,
        };

        path.skip();
      },
    },
    null,
  );
  const state = nullthrows(
    maybeState,
    'Failed to bind Metro module IR elements',
  );
  return {
    get requireParamBinding(): Binding {
      return nullthrows(
        state.requireParamPath.scope.getBinding(
          state.requireParamPath.node.name,
        ),
      );
    },
    get importDefaultParamBinding(): Binding {
      return nullthrows(
        state.importDefaultParamPath.scope.getBinding(
          state.importDefaultParamPath.node.name,
        ),
      );
    },
    get importAllParamBinding(): Binding {
      return nullthrows(
        state.importAllParamPath.scope.getBinding(
          state.importAllParamPath.node.name,
        ),
      );
    },
    get depMapParamBinding(): ?Binding {
      return state.depMapParamPath?.scope.getBinding(
        state.depMapParamPath.node.name,
      );
    },
  };
}
