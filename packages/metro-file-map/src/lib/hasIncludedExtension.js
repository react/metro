/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 * @format
 * @oncall react_native
 */

/**
 * Whether a basename has one of the given extensions (without a leading dot).
 * The node crawler and the watcher backends include regular files by this
 * test.
 *
 * A basename matches an extension when it ends with `.` followed by that
 * extension, after any dot, so `.env` matches `env` and `foo.d.ts` matches
 * `d.ts` as well as `ts`. `path.extname` can't be used for this, as it
 * returns `''` for `.env`.
 */
export default function hasIncludedExtension(
  extensions: ReadonlySet<string>,
  basename: string,
): boolean {
  for (
    let i = basename.indexOf('.');
    i !== -1;
    i = basename.indexOf('.', i + 1)
  ) {
    if (extensions.has(basename.slice(i + 1))) {
      return true;
    }
  }
  return false;
}
