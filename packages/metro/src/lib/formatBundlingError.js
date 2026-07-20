/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

import type {FormattedError} from 'metro-runtime/src/modules/types';

import GraphNotFoundError from '../IncrementalBundler/GraphNotFoundError';
import ResourceNotFoundError from '../IncrementalBundler/ResourceNotFoundError';
import RevisionNotFoundError from '../IncrementalBundler/RevisionNotFoundError';
import {UnableToResolveError} from '../node-haste/DependencyGraph/ModuleResolution';
import {codeFrameColumns} from '@babel/code-frame';
import ErrorStackParser from 'error-stack-parser';
import {AmbiguousModuleResolutionError} from 'metro-core';
import fs from 'node:fs';
import serializeError from 'serialize-error';

export type CustomError = Error &
  interface {
    readonly type?: string,
    filename?: string,
    lineNumber?: number,
    errors?: Array<{
      description: string,
      filename: string,
      lineNumber: number,
      ...
    }>,
  };

export default function formatBundlingError(
  error: CustomError,
): FormattedError {
  if (error instanceof AmbiguousModuleResolutionError) {
    const he = error.hasteError;
    const message =
      "Ambiguous resolution: module '" +
      `${error.fromModulePath}\' tries to require \'${he.hasteName}\', but ` +
      'there are several files providing this module. You can delete or ' +
      'fix them: \n\n' +
      Object.keys(he.duplicatesSet)
        .sort()
        .map(dupFilePath => `${dupFilePath}`)
        .join('\n\n');

    return {
      type: 'AmbiguousModuleResolutionError',
      message,
      errors: [{description: message}],
    };
  }

  if (
    error instanceof UnableToResolveError ||
    (error instanceof Error &&
      /* $FlowFixMe[invalid-compare] Error discovered during Constant Condition
       * roll out. See https://fburl.com/workplace/4oq3zi07. */
      (error.type === 'TransformError' || error.type === 'NotFoundError'))
  ) {
    return {
      ...serializeError(error),
      // Ensure the type is passed to the client.
      type: error.type,
      errors: [
        {
          description: error.message,
          filename: error.filename,
          lineNumber: error.lineNumber,
        },
      ],
    };
  } else if (error instanceof ResourceNotFoundError) {
    return {
      type: 'ResourceNotFoundError',
      // $FlowFixMe[incompatible-type]
      errors: [],
      message: error.message,
    };
  } else if (error instanceof GraphNotFoundError) {
    return {
      type: 'GraphNotFoundError',
      // $FlowFixMe[incompatible-type]
      errors: [],
      message: error.message,
    };
  } else if (error instanceof RevisionNotFoundError) {
    return {
      type: 'RevisionNotFoundError',
      // $FlowFixMe[incompatible-type]
      errors: [],
      message: error.message,
    };
  } else {
    const stack = ErrorStackParser.parse(error);
    const fileName = stack[0].fileName;
    const column = stack[0].columnNumber;
    const line = stack[0].lineNumber;

    let codeFrame = '';
    try {
      codeFrame = codeFrameColumns(
        // If the error was thrown in a node.js builtin module, this call will fail and mask the real error.
        fs.readFileSync(fileName, 'utf8'),
        {
          start: {column, line},
        },
        {forceColor: true},
      );
    } catch {}

    return {
      type: 'InternalError',
      errors: [],
      message: `Metro has encountered an error: ${error.message}: ${fileName} (${line}:${column})\n\n${codeFrame}`,
    };
  }
}
