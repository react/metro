/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow strict
 */

'use strict';

const objectSource = {
  original: 'export-destructuring: RENAMED_OBJECT',
  remaining: 'export-destructuring: OBJECT_REST',
};

export const {original: renamedObject, ...objectRest} = objectSource;

const arraySource = [
  'export-destructuring: ARRAY_FIRST',
  'export-destructuring: ARRAY_REST',
];

// $FlowFixMe[invalid-exported-annotation] Flow can't infer an exported annotation for an array rest binding
export const [arrayFirst, ...arrayRest] = arraySource;
