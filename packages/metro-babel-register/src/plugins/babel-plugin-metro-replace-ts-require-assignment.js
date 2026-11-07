/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

/* eslint-disable import/no-commonjs */

'use strict';

// Replace `import thing = require('thing')` with `const thing = require('thing')` which allows us to keep CJS semantics

module.exports = ({template}) => {
  const moduleExportsDeclaration = template(`
    import NAME from 'IMPORT';
  `);
  return {
    name: 'metro-replace-ts-require-assignment',
    visitor: {
      TSImportEqualsDeclaration(path) {
        const {node} = path;

        path.replaceWith(
          moduleExportsDeclaration({
            IMPORT: node.moduleReference.expression,
            NAME: node.id,
          }),
        );
      },
    },
  };
};
