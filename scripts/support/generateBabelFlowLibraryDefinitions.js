/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow
 * @oncall react_native
 */

/**
 * This script updates all flow types. Run it every time you upgrade babel
 */

import generateBabelTypesFlowLibraryDefinition from './generateBabelTypesFlowLibraryDefinition';
import updateBabelTraverseFlowLibraryDefinition from './updateBabelTraverseFlowLibraryDefinition';
import * as prettier from 'prettier';

export default async function main(): Promise<
  Map<string /* absolute file path */, string /* new content */>,
> {
  const babelTraverseFlowDefinitionPath =
    require.resolve('../../flow-typed/npm/babel-traverse_v7.x.x.js');
  const babelTypesFlowDefinitionPath =
    require.resolve('../../flow-typed/npm/babel-types_v7.x.x.js');

  const intermediates = [
    [
      babelTraverseFlowDefinitionPath,
      updateBabelTraverseFlowLibraryDefinition(babelTraverseFlowDefinitionPath),
    ],
    [babelTypesFlowDefinitionPath, generateBabelTypesFlowLibraryDefinition()],
  ];

  return new Map(
    await Promise.all(
      intermediates.map(async ([fileName, rawContent]) => [
        fileName,
        await prettier.format(rawContent, {
          ...(await prettier.resolveConfig(fileName)),
          filepath: fileName,
        }),
      ]),
    ),
  );
}
