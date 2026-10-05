/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

import type {ConfigT} from 'metro-config';

import path from 'node:path';

// Matches /[metro-watchFolders]/<index>/... and /[metro-project]/...
// Applied after normalizing ./ and bare paths to start with /.
const EXPLICIT_ROUTE_RE =
  /^\/(?:\[metro-watchFolders\]\/(\d+)|\[metro-project\])\/(.*)/s;

/**
 * Immutable bidirectional map between URL pathnames and filesystem paths,
 * encoding the `[metro-project]` and `[metro-watchFolders]` virtual prefix
 * conventions.
 */
export default class RootUrlMap {
  readonly serverRootDir: string;
  readonly _projectRootDirPrefix: string;
  readonly _watchFolderDirPrefixes: ReadonlyArray<string>;
  readonly _filePathRoutes: ReadonlyArray<{
    rootDirPrefix: string,
    pathnamePrefix: string,
  }>;

  constructor(config: ConfigT) {
    this.serverRootDir =
      config.server.unstable_serverRoot ?? config.projectRoot;
    this._projectRootDirPrefix = path.normalize(config.projectRoot + path.sep);
    this._watchFolderDirPrefixes = config.watchFolders.map(wf =>
      path.normalize(wf + path.sep),
    );
    this._filePathRoutes = [
      {
        rootDirPrefix: this._projectRootDirPrefix,
        pathnamePrefix: '/[metro-project]/',
      },
      ...this._watchFolderDirPrefixes.map((wfDir, i) => ({
        rootDirPrefix: wfDir,
        pathnamePrefix: `/[metro-watchFolders]/${i}/`,
      })),
    ];
  }

  /**
   * Decode a URL pathname and resolve it to an absolute filesystem path.
   */
  filePathOfUrlPathname(pathname: string): string | null {
    const decoded = pathname
      .split('/')
      .map(segment => decodeURIComponent(segment))
      .join('/');

    return this.filePathOfUrlDecodedPathname(decoded);
  }

  /**
   * Convert a URL pathname or entry-file path to an absolute filesystem path.
   *
   * Accepts both URL-style (`/[metro-watchFolders]/1/foo`) and entry-file-style
   * (`./[metro-watchFolders]/1/foo`) prefixes.
   *
   * Returns `null` when the pathname does not match a known virtual prefix,
   * or for out-of-bounds watchFolder indices.
   */
  filePathOfUrlDecodedPathname(pathname: string): string | null {
    let normalized = pathname;
    if (normalized.startsWith('./')) {
      normalized = '/' + normalized.slice(2);
    } else if (!normalized.startsWith('/')) {
      normalized = '/' + normalized;
    }

    const match = EXPLICIT_ROUTE_RE.exec(normalized);
    if (match != null) {
      const watchFolderIndexStr = match[1];
      const rest = match[2];
      let rootDirPrefix;
      if (watchFolderIndexStr != null) {
        const index = parseInt(watchFolderIndexStr, 10);
        if (index >= this._watchFolderDirPrefixes.length) {
          return null;
        }
        rootDirPrefix = this._watchFolderDirPrefixes[index];
      } else {
        rootDirPrefix = this._projectRootDirPrefix;
      }
      return path.join(rootDirPrefix, rest.split('/').join(path.sep));
    }

    return null;
  }

  /**
   * Convert an absolute filesystem path to a URL pathname using the first
   * matching virtual prefix.
   *
   * Falls back to the absolute path (as a POSIX-style URL) when the file is
   * not under any configured route.
   */
  urlPathnameOfFilePath(filePath: string): string {
    for (const {rootDirPrefix, pathnamePrefix} of this._filePathRoutes) {
      if (filePath.startsWith(rootDirPrefix)) {
        return (
          pathnamePrefix +
          filePath
            .slice(rootDirPrefix.length)
            .split(path.sep)
            .map(segment => encodeURIComponent(segment))
            .join('/')
        );
      }
    }
    const pathPosix = filePath
      .split(path.sep)
      .map(segment => encodeURIComponent(segment))
      .join('/');
    return pathPosix.startsWith('/') ? pathPosix : '/' + pathPosix;
  }
}
