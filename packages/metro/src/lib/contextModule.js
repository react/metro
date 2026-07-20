/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 * @oncall react_native
 */

import type {
  ContextMode,
  RequireContextParams,
} from '../ModuleGraph/worker/collectDependencies';

import crypto from 'node:crypto';
import path from 'node:path';
import nullthrows from 'nullthrows';

export type RequireContext = Readonly<{
  /* Should search for files recursively. Optional, default `true` when `require.context` is used */
  recursive: boolean,
  /* Filename filter pattern for use in `require.context`. Optional, default `.*` (any file) when `require.context` is used */
  filter: RegExp,
  /** Mode for resolving dynamic dependencies. Defaults to `sync` */
  mode: ContextMode,
  /** Absolute path of the directory to search in */
  from: string,
}>;

function toHash(value: string): string {
  // Use `hex` to ensure filepath safety.
  return crypto.createHash('sha1').update(value).digest('hex');
}

/** Given a fully qualified require context, return a virtual file path that ensures uniqueness between paths with different contexts. */
export function deriveAbsolutePathFromContext(
  from: string,
  context: RequireContextParams,
): string {
  // Drop the trailing slash, require.context should always be matched against a folder
  // and we want to normalize the folder name as much as possible to prevent duplicates.
  // This also makes the files show up in the correct location when debugging in Chrome.
  const filePath = from.endsWith(path.sep) ? from.slice(0, -1) : from;
  return (
    filePath +
    '?ctx=' +
    toHash(
      [
        context.mode,
        context.recursive ? 'recursive' : '',
        new RegExp(context.filter.pattern, context.filter.flags).toString(),
      ]
        .filter(Boolean)
        .join(' '),
    )
  );
}

/** Match a file against a require context. */
export function fileMatchesContext(
  testPath: string,
  context: RequireContext,
): boolean {
  // NOTE(EvanBacon): Ensure this logic is synchronized with the similar
  // functionality in `metro-file-map/src/lib/TreeFS.js` (`matchFiles()`)

  const filePath = path.relative(nullthrows(context.from), testPath);
  const filter = context.filter;
  if (
    // Ignore everything outside of the provided `root`.
    !(filePath && !filePath.startsWith('..')) ||
    // Prevent searching in child directories during a non-recursive search.
    (!context.recursive && filePath.includes(path.sep)) ||
    // Test against the filter.
    !filter.test(
      // NOTE(EvanBacon): Ensure files start with `./` for matching purposes
      // this ensures packages work across Metro and Webpack (ex: Storybook for React DOM / React Native).
      // `a/b.js` -> `./a/b.js`
      './' + filePath.replace(/\\/g, '/'),
    )
  ) {
    return false;
  }

  return true;
}
