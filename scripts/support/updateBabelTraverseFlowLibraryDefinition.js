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

const virtualTypes = require('@babel/traverse/lib/path/lib/virtual-types');
const t = require('@babel/types');
const fs = require('node:fs');

const NODE_PREFIX = 'BabelNode';
const VISITOR_METHODS_MARKER_NAME = 'VISITOR METHODS';
const NODE_PATH_METHOD_MARKER_NAME = 'NODE PATH METHODS';
const TYPE_IMPORTS_MARKER_NAME = 'BABEL TYPE IMPORTS';

function main(filePath: string): string {
  const inputContent = fs.readFileSync(filePath, 'utf8');
  const withVisitorMethods = replaceGeneratedBlock(
    inputContent,
    VISITOR_METHODS_MARKER_NAME,
    generateVisitorMethods(),
  );
  const withNodePathMethods = replaceGeneratedBlock(
    withVisitorMethods,
    NODE_PATH_METHOD_MARKER_NAME,
    generateNodePathMethods(),
  );
  // Node types are declared locally inside the `@babel/types` module, so they
  // must be imported. Generate the import block last so it covers the node
  // types referenced by the sections generated above.
  return replaceGeneratedBlock(
    withNodePathMethods,
    TYPE_IMPORTS_MARKER_NAME,
    generateBabelTypeImports(withNodePathMethods),
  );
}

// The `@babel/types` module exports each node type under its unprefixed name
// (e.g. `Identifier`). Import them aliased to the `BabelNode`-prefixed names
// (e.g. `Identifier as BabelNodeIdentifier`) so this definition can reference
// `BabelNode` and `BabelNode*` throughout.
function generateBabelTypeImports(content) {
  // Scan every `BabelNode*` name referenced outside the import block itself, so
  // only referenced names are imported.
  const scannable = stripGeneratedBlock(content, TYPE_IMPORTS_MARKER_NAME);
  const usedNames = [
    ...new Set(scannable.match(/\bBabelNode[A-Za-z0-9]*\b/g) ?? []),
  ].sort();

  const specifiers = usedNames.map(name => {
    const exportedName =
      name === NODE_PREFIX ? 'Node' : name.slice(NODE_PREFIX.length);
    return `    ${exportedName} as ${name},`;
  });

  return `  import type {\n${specifiers.join('\n')}\n  } from '@babel/types';`;
}

function generateVisitorMethods() {
  const uniqueTypes = new Set([
    ...t.TYPES,
    ...Object.keys(t.FLIPPED_ALIAS_KEYS),
    ...Object.keys(virtualTypes),
  ]);
  const types = [...uniqueTypes].filter(type => {
    if (type === 'File') {
      // The file node can not be visited using a visitor because traverse(node) only visits the
      // children of the passed in node and File has no parent node.
      return false;
    }

    return true;
  });

  types.sort();

  const lines = types.map(type => {
    const nodeType =
      (t.NODE_FIELDS[type] || t.FLIPPED_ALIAS_KEYS[type]) != null ? type : '';
    return `    ${type}?: VisitNode<${NODE_PREFIX}${nodeType}, TState>,`;
  });

  return lines.join('\n');
}

function generateNodePathMethods() {
  const isTypes = [
    ...new Set([
      ...t.TYPES,
      ...Object.keys(virtualTypes).filter(type => !type.startsWith('_')),
    ]),
  ].sort();
  const is = isTypes.map(type => `    is${type}(opts?: Opts): boolean;`);
  const asserts = isTypes
    .map(type => `    assert${type}(opts?: Opts): void;`)
    .sort();

  return `${is.join('\n')}\n${asserts.join('\n')}`;
}

function replaceGeneratedBlock(content, markerName, code) {
  const insertPosition = getGeneratedCodeInsertPosition(content, markerName);
  const prelude = content.substring(0, insertPosition.start);
  const postlude = content.substring(insertPosition.end);

  return `${prelude}\n${code}${postlude}`;
}

// Returns `content` with the body of the given generated block removed, so the
// block's own content isn't scanned when deciding what that block should
// contain.
function stripGeneratedBlock(content, markerName) {
  const insertPosition = getGeneratedCodeInsertPosition(content, markerName);
  return (
    content.substring(0, insertPosition.start) +
    content.substring(insertPosition.end)
  );
}

function getGeneratedCodeInsertPosition(content, markerName) {
  const beginMarker = `BEGIN GENERATED ${markerName}`;
  const endMarker = `END GENERATED ${markerName}`;

  const beginIndex = content.indexOf(beginMarker);
  const endIndex = content.indexOf(endMarker);

  if (beginIndex === -1) {
    throw new Error(`Did not found ${beginMarker} in the provided file`);
  }

  if (endIndex === -1) {
    throw new Error(`Did not found ${endMarker} in the provided file`);
  }

  return {
    start: beginIndex + beginMarker.length,
    end: content.lastIndexOf('\n', endIndex),
  };
}

module.exports = main;
