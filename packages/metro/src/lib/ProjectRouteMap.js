/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

import type {DynamicRoot} from './dynamicRoots';
import type {ConfigT} from 'metro-config';

import {DYNAMIC_ROOT_ID_LENGTH} from './dynamicRoots';
import path from 'node:path';

// Matches /[metro-watchFolders]/<id>/... and /[metro-project]/...
// Applied after normalizing ./ and bare paths to start with /.
const EXPLICIT_ROUTE_RE =
  /^\/(?:\[metro-watchFolders\]\/([^/]+)|\[metro-project\])\/(.*)/s;

const WATCH_FOLDER_INDEX_RE = /^\d+$/;

/**
 * The most `watchFolders` that keep every index shorter than a dynamic root
 * id, so that the two cannot be confused.
 */
export const MAX_WATCH_FOLDERS: number = 10 ** (DYNAMIC_ROOT_ID_LENGTH - 1);

/**
 * Bidirectional map between URL pathnames and filesystem paths, encoding the
 * `[metro-project]` and `[metro-watchFolders]` virtual prefix conventions.
 *
 * The id after `[metro-watchFolders]` is either an index into the configured
 * `watchFolders`, or, if it has `DYNAMIC_ROOT_ID_LENGTH` characters, the id of
 * a dynamic root. The routes for `projectRoot`
 * and `watchFolders` are fixed, and dynamic roots are read on each use.
 */
export default class ProjectRouteMap {
  readonly serverRootDir: string;
  readonly _projectRootDirPrefix: string;
  readonly _watchFolderDirPrefixes: ReadonlyArray<string>;
  readonly _filePathRoutes: ReadonlyArray<{
    rootDirPrefix: string,
    pathnamePrefix: string,
  }>;

  readonly _getDynamicRoots: () => ReadonlyArray<DynamicRoot>;

  constructor(
    config: ConfigT,
    getDynamicRoots: () => ReadonlyArray<DynamicRoot> = () => [],
  ) {
    if (config.watchFolders.length > MAX_WATCH_FOLDERS) {
      throw new Error(
        `Metro supports at most ${MAX_WATCH_FOLDERS} watchFolders, but ` +
          `${config.watchFolders.length} are configured.`,
      );
    }
    this._getDynamicRoots = getDynamicRoots;
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
      const watchFolderId = match[1];
      const rest = match[2];
      let rootDirPrefix;
      if (watchFolderId == null) {
        rootDirPrefix = this._projectRootDirPrefix;
      } else if (watchFolderId.length === DYNAMIC_ROOT_ID_LENGTH) {
        const dynamicRoot = this._getDynamicRoots().find(
          ({id}) => id === watchFolderId,
        );
        if (dynamicRoot == null) {
          return null;
        }
        rootDirPrefix = path.normalize(dynamicRoot.rootDir + path.sep);
      } else if (WATCH_FOLDER_INDEX_RE.test(watchFolderId)) {
        const index = parseInt(watchFolderId, 10);
        if (index >= this._watchFolderDirPrefixes.length) {
          return null;
        }
        rootDirPrefix = this._watchFolderDirPrefixes[index];
      } else {
        return null;
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
    for (const {id, rootDir} of this._getDynamicRoots()) {
      const rootDirPrefix = path.normalize(rootDir + path.sep);
      if (filePath.startsWith(rootDirPrefix)) {
        return (
          `/[metro-watchFolders]/${id}/` +
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
