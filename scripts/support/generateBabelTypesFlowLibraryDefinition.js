/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

'use strict';
// This file shouldn't be hard enforced because it's purpose is to generate types for @babel/types
// But to be able to run it from flow-node, the below line tricks it into being a flow file
// @flow

const t = require('@babel/types');

// This file is a copy of https://raw.githubusercontent.com/MichaReiser/babel/babel-types-flow-types/packages/babel-types/scripts/generators/flow.js
// The goal is to remove this file after the PR has been merged into the babel repository.
// Disable eslint since this code isn't owned by us.
/* eslint-disable */
const NODE_PREFIX = 'BabelNode';
const AT = '@';

const TEMPLATE = `/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 * ${AT}generated
 * See <metro>/scripts/updateBabelTypesFlowTypes.js.
 * ${AT}flow strict
 */

declare type ${NODE_PREFIX}BaseComment = {
  value: string;
  start: number;
  end: number;
  loc: ${NODE_PREFIX}SourceLocation;
};

declare type ${NODE_PREFIX}CommentBlock = {
  ...${NODE_PREFIX}BaseComment;
  type: "CommentBlock";
};

declare type ${NODE_PREFIX}CommentLine ={
  ...${NODE_PREFIX}BaseComment,
  type: "CommentLine";
};

declare type ${NODE_PREFIX}Comment = ${NODE_PREFIX}CommentBlock | ${NODE_PREFIX}CommentLine;

declare type ${NODE_PREFIX}SourceLocation = {
  start: {
    line: number;
    column: number;
  };

  end: {
    line: number;
    column: number;
  };
};
\n\n`;

function main() {
  let code = TEMPLATE;

  const lines = [];

  for (const type in t.NODE_FIELDS) {
    const fields = t.NODE_FIELDS[type];

    const struct = ['type: "' + type + '";'];
    const args = [];
    const builderNames = t.BUILDER_KEYS[type];

    Object.keys(t.NODE_FIELDS[type])
      .sort((fieldA, fieldB) => {
        const indexA = t.BUILDER_KEYS[type].indexOf(fieldA);
        const indexB = t.BUILDER_KEYS[type].indexOf(fieldB);
        if (indexA === indexB) return fieldA < fieldB ? -1 : 1;
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        return indexA - indexB;
      })
      .forEach(fieldName => {
        const field = fields[fieldName];

        let suffix = '';
        if (field.optional || field.default != null) suffix += '?';

        let typeAnnotation = 'any';

        const validate = field.validate;
        if (validate) {
          typeAnnotation = stringifyValidator(validate, NODE_PREFIX);
        }

        if (typeAnnotation) {
          suffix += ': ' + typeAnnotation;
        }
        if (builderNames.includes(fieldName)) {
          args.push(t.toBindingIdentifierName(fieldName) + suffix);
        }

        if (t.isValidIdentifier(fieldName, /* filter reserved words */ false)) {
          struct.push(fieldName + suffix + ';');
        }
      });

    // Flow seems to deoptimize the union type if another type is spread into the node declaration.
    // Defining the base props over and over again significantely speeds up the type checking.
    code += `declare type ${NODE_PREFIX}${type} = {
  leadingComments?: Array<${NODE_PREFIX}Comment>;
  innerComments?: Array<${NODE_PREFIX}Comment>;
  trailingComments?: Array<${NODE_PREFIX}Comment>;
  start: ?number;
  end: ?number;
  loc: ?${NODE_PREFIX}SourceLocation,
  ${struct.join('\n  ').trim()}
};\n\n`;

    // Flow chokes on super() and import() :/
    if (type !== 'Super' && type !== 'Import') {
      lines.push(
        `declare export function ${toFunctionName(type)}(${args.join(
          ', ',
        )}): ${NODE_PREFIX}${type};`,
      );
    } else {
      const functionName = toFunctionName(type);
      lines.push(
        `declare var _${functionName}: (${args.join(
          ', ',
        )}) => ${NODE_PREFIX}${type};`,
        `declare export { _${functionName} as ${functionName} }`,
      );
    }
  }

  for (let i = 0; i < t.TYPES.length; i++) {
    const type = t.TYPES[i];
    let decl = `declare export function is${type}(node: ?Object, opts?: ?Object):`;

    const realName = t.DEPRECATED_KEYS[type] ?? type;

    if (t.NODE_FIELDS[realName]) {
      decl += ` node is ${realName};`;
    } else if (t.FLIPPED_ALIAS_KEYS[realName]) {
      const types = t.FLIPPED_ALIAS_KEYS[realName];
      const checks = types.join(' | ');
      decl += ` node is (${checks});`;
    } else {
      continue;
    }

    lines.push(decl);
  }

  lines.push(
    // builders/
    // eslint-disable-next-line max-len
    `declare export function createTypeAnnotationBasedOnTypeof(type: 'string' | 'number' | 'undefined' | 'boolean' | 'function' | 'object' | 'symbol'): ${NODE_PREFIX}TypeAnnotation`,
    // eslint-disable-next-line max-len
    `declare export function createUnionTypeAnnotation(types: Array<${NODE_PREFIX}FlowType>): ${NODE_PREFIX}UnionTypeAnnotation`,
    // eslint-disable-next-line max-len
    `declare export function createFlowUnionType(types: Array<${NODE_PREFIX}FlowType>): ${NODE_PREFIX}UnionTypeAnnotation`,
    // this smells like "internal API"
    // eslint-disable-next-line max-len
    `declare export function buildChildren(node: { children: Array<${NODE_PREFIX}JSXText | ${NODE_PREFIX}JSXExpressionContainer | ${NODE_PREFIX}JSXSpreadChild | ${NODE_PREFIX}JSXElement | ${NODE_PREFIX}JSXFragment | ${NODE_PREFIX}JSXEmptyExpression> }): Array<${NODE_PREFIX}JSXText | ${NODE_PREFIX}JSXExpressionContainer | ${NODE_PREFIX}JSXSpreadChild | ${NODE_PREFIX}JSXElement | ${NODE_PREFIX}JSXFragment>`,

    // clone/
    `declare export function clone<T>(n: T): T;`,
    `declare export function cloneDeep<T>(n: T): T;`,
    `declare export function cloneDeepWithoutLoc<T>(n: T): T;`,
    `declare export function cloneNode<T>(n: T, deep?: boolean, withoutLoc?: boolean): T;`,
    `declare export function cloneWithoutLoc<T>(n: T): T;`,

    // comments/
    `declare type CommentTypeShorthand = 'leading' | 'inner' | 'trailing'`,
    // eslint-disable-next-line max-len
    `declare export function addComment<T: Node>(node: T, type: CommentTypeShorthand, content: string, line?: boolean): T`,
    // eslint-disable-next-line max-len
    `declare export function addComments<T: Node>(node: T, type: CommentTypeShorthand, comments: Array<Comment>): T`,
    `declare export function inheritInnerComments(node: Node, parent: Node): void`,
    `declare export function inheritLeadingComments(node: Node, parent: Node): void`,
    `declare export function inheritsComments<T: Node>(node: T, parent: Node): void`,
    `declare export function inheritTrailingComments(node: Node, parent: Node): void`,
    `declare export function removeComments<T: Node>(node: T): T`,

    // converters/
    `declare export function ensureBlock(node: ${NODE_PREFIX}, key: string): ${NODE_PREFIX}BlockStatement`,
    `declare export function toBindingIdentifierName(name?: ?string): string`,
    // eslint-disable-next-line max-len
    `declare export function toBlock(node: ${NODE_PREFIX}Statement | ${NODE_PREFIX}Expression, parent?: ${NODE_PREFIX}Function | null): ${NODE_PREFIX}BlockStatement`,
    // eslint-disable-next-line max-len
    `declare export function toComputedKey(node: ${NODE_PREFIX}Method | ${NODE_PREFIX}Property, key?: ${NODE_PREFIX}Expression | ${NODE_PREFIX}Identifier): ${NODE_PREFIX}Expression`,
    // eslint-disable-next-line max-len
    `declare export function toExpression(node: ${NODE_PREFIX}ExpressionStatement | ${NODE_PREFIX}Expression | ${NODE_PREFIX}Class | ${NODE_PREFIX}Function): ${NODE_PREFIX}Expression`,
    `declare export function toIdentifier(name?: ?string): string`,
    // eslint-disable-next-line max-len
    `declare export function toKeyAlias(node: ${NODE_PREFIX}Method | ${NODE_PREFIX}Property, key?: ${NODE_PREFIX}): string`,
    // toSequenceExpression relies on types that aren't declared in flow
    // eslint-disable-next-line max-len
    `declare export function toStatement(node: ${NODE_PREFIX}Statement | ${NODE_PREFIX}Class | ${NODE_PREFIX}Function | ${NODE_PREFIX}AssignmentExpression, ignore?: boolean): ${NODE_PREFIX}Statement | void`,
    `declare export function valueToNode(value: any): ${NODE_PREFIX}Expression`,

    // modifications/
    // eslint-disable-next-line max-len
    `declare export function removeTypeDuplicates(types: Array<${NODE_PREFIX}FlowType>): Array<${NODE_PREFIX}FlowType>`,
    // eslint-disable-next-line max-len
    `declare export function appendToMemberExpression(member: ${NODE_PREFIX}MemberExpression, append: ${NODE_PREFIX}, computed?: boolean): ${NODE_PREFIX}MemberExpression`,
    // eslint-disable-next-line max-len
    `declare export function inherits<T: Node>(child: T, parent: ${NODE_PREFIX} | null | void): T`,
    // eslint-disable-next-line max-len
    `declare export function prependToMemberExpression(member: ${NODE_PREFIX}MemberExpression, prepend: ${NODE_PREFIX}Expression): ${NODE_PREFIX}MemberExpression`,
    `declare export function removeProperties<T>(n: T, opts: ?{}): void;`,
    `declare export function removePropertiesDeep<T>(n: T, opts: ?{}): T;`,

    // retrievers/
    // eslint-disable-next-line max-len
    `declare export function getBindingIdentifiers(node: ${NODE_PREFIX}, duplicates?: boolean, outerOnly?: boolean): { [key: string]: ${NODE_PREFIX}Identifier | Array<${NODE_PREFIX}Identifier> }`,
    // eslint-disable-next-line max-len
    `declare export function getOuterBindingIdentifiers(node: Node, duplicates?: boolean): { [key: string]: ${NODE_PREFIX}Identifier | Array<${NODE_PREFIX}Identifier> }`,

    // traverse/
    `declare export type TraversalAncestors = Array<{
    node: BabelNode,
    key: string,
    index?: number,
  }>;
  declare export type TraversalHandler<T> = (BabelNode, TraversalAncestors, T) => void;
  declare export type TraversalHandlers<T> = {
    enter?: TraversalHandler<T>,
    exit?: TraversalHandler<T>,
  };`.replace(/(^|\n) {2}/g, '$1'),
    // eslint-disable-next-line
    `declare export function traverse<T>(n: BabelNode, handler: TraversalHandler<T> | TraversalHandlers<T>, state?: T): void;`,
    `declare export function traverseFast<T>(n: Node, h: TraversalHandler<T>, state?: T): void;`,

    // utils/
    // cleanJSXElementLiteralChild is not exported
    // inherit is not exported
    `declare export function shallowEqual(actual: Object, expected: Object): boolean`,

    // validators/
    // eslint-disable-next-line max-len
    `declare export function buildMatchMemberExpression(match: string, allowPartial?: boolean): (?BabelNode) => boolean`,
    `declare export function is(type: string, n: BabelNode, opts: Object): boolean;`,
    `declare export function isBinding(node: BabelNode, parent: BabelNode, grandparent?: BabelNode): boolean`,
    `declare export function isBlockScoped(node: BabelNode): boolean`,
    `declare export function isLet(node: BabelNode): node is VariableDeclaration`,
    `declare export function isNode(node: ?Object): boolean`,
    `declare export function isNodesEquivalent(a: any, b: any): boolean`,
    `declare export function isPlaceholderType(placeholderType: string, targetType: string): boolean`,
    `declare export function isReferenced(node: BabelNode, parent: BabelNode, grandparent?: BabelNode): boolean`,
    `declare export function isScope(node: BabelNode, parent: BabelNode): node is (BlockStatement | CatchClause | DoWhileStatement | ForInStatement | ForStatement | FunctionDeclaration | FunctionExpression | Program | ObjectMethod | SwitchStatement | WhileStatement | ArrowFunctionExpression | ClassExpression | ClassDeclaration | ForOfStatement | ClassMethod | ClassPrivateMethod | TSModuleBlock)`,
    `declare export function isSpecifierDefault(specifier: BabelNodeModuleSpecifier): boolean`,
    `declare export function isType(nodetype: ?string, targetType: string): boolean`,
    `declare export function isValidES3Identifier(name: string): boolean`,
    `declare export function isValidES3Identifier(name: string): boolean`,
    `declare export function isValidIdentifier(name: string): boolean`,
    `declare export function isVar(node: BabelNode): node is VariableDeclaration`,
    // eslint-disable-next-line max-len
    `declare export function matchesPattern(node: ?BabelNode, match: string | Array<string>, allowPartial?: boolean): boolean`,
    `declare export function validate(n: BabelNode, key: string, value: mixed): void;`,
  );

  code += `declare type ${NODE_PREFIX} = ${Object.keys(t.NODE_FIELDS)
    .map(type => `${NODE_PREFIX}${type}`)
    .join(' | ')};\n`;

  for (const type in t.FLIPPED_ALIAS_KEYS) {
    const types = t.FLIPPED_ALIAS_KEYS[type];
    code += `declare type ${NODE_PREFIX}${type} = ${types
      .map(type => `${NODE_PREFIX}${type}`)
      .join(' | ')};\n`;
  }

  // Module level exports without NODE_PREFIX prefix
  const aliasedTypes = [
    'CommentBlock',
    'CommentLine',
    'Comment',
    'SourceLocation',
    ...Object.keys(t.NODE_FIELDS),
    ...Object.keys(t.FLIPPED_ALIAS_KEYS),
  ];
  lines.push(
    `declare export type Node = ${NODE_PREFIX};`,
    ...aliasedTypes.map(
      type => `declare export type ${type} = ${NODE_PREFIX}${type};`,
    ),
  );

  code += `\ndeclare module "@babel/types" {
  ${lines.join('\n').replace(/\n/g, '\n  ').trim()}
}\n`;

  return code;
}

// Copied from https://raw.githubusercontent.com/babel/babel/main/packages/babel-types/scripts/utils/stringifyValidator.js
function stringifyValidator(validator, nodePrefix: string): string {
  if (validator === undefined) {
    return 'any';
  }

  if (validator.each) {
    return `Array<${stringifyValidator(validator.each, nodePrefix)}>`;
  }

  if (validator.chainOf) {
    return stringifyValidator(validator.chainOf[1], nodePrefix);
  }

  if (validator.oneOf) {
    return validator.oneOf.map(JSON.stringify).join(' | ');
  }

  if (validator.oneOfNodeTypes) {
    return validator.oneOfNodeTypes.map(_ => nodePrefix + _).join(' | ');
  }

  if (validator.oneOfNodeOrValueTypes) {
    return validator.oneOfNodeOrValueTypes
      .map(_ => {
        return isValueType(_) ? _ : nodePrefix + _;
      })
      .join(' | ');
  }

  if (validator.type) {
    return validator.type;
  }

  if (validator.shapeOf) {
    return (
      '{ ' +
      Object.keys(validator.shapeOf)
        .map(shapeKey => {
          const propertyDefinition = validator.shapeOf[shapeKey];
          if (propertyDefinition.validate) {
            const isOptional =
              propertyDefinition.optional || propertyDefinition.default != null;
            return (
              shapeKey +
              (isOptional ? '?: ' : ': ') +
              stringifyValidator(propertyDefinition.validate)
            );
          }
          return null;
        })
        .filter(Boolean)
        .join(', ') +
      ' }'
    );
  }

  return ['any'];
}

/**
 * Heuristic to decide whether or not the given type is a value type (eg. "null")
 * or a Node type (eg. "Expression").
 */
function isValueType(type: string): boolean {
  return type.charAt(0).toLowerCase() === type.charAt(0);
}

// Copied from https://raw.githubusercontent.com/babel/babel/main/packages/babel-types/scripts/utils/toFunctionName.js
function toFunctionName(typeName: string): string {
  const _ = typeName.replace(/^TS/, 'ts').replace(/^JSX/, 'jsx');
  return _.slice(0, 1).toLowerCase() + _.slice(1);
}

module.exports = main;
