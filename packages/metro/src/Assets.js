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

import type {AssetPath} from './node-haste/lib/AssetPaths';

import {normalizePathSeparatorsToPosix} from './lib/pathUtils';
import * as AssetPaths from './node-haste/lib/AssetPaths';
// $FlowFixMe[untyped-import] image-size
import getImageSize from 'image-size';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export type AssetInfo = {
  readonly files: Array<string>,
  readonly hash: string,
  readonly name: string,
  readonly scales: Array<number>,
  readonly type: string,
};

export type AssetDataWithoutFiles = {
  readonly __packager_asset: boolean,
  readonly fileSystemLocation: string,
  readonly hash: string,
  readonly height: ?number,
  readonly httpServerLocation: string,
  readonly name: string,
  readonly scales: Array<number>,
  readonly type: string,
  readonly width: ?number,
  ...
};
export type AssetDataFiltered = {
  readonly __packager_asset: boolean,
  readonly hash: string,
  readonly height: ?number,
  readonly httpServerLocation: string,
  readonly name: string,
  readonly scales: Array<number>,
  readonly type: string,
  readonly width: ?number,
  ...
};

// Test extension against all types supported by image-size module.
// If it's not one of these, we won't treat it as an image.
export function isAssetTypeAnImage(type: string): boolean {
  return (
    [
      'png',
      'jpg',
      'jpeg',
      'bmp',
      'gif',
      'webp',
      'psd',
      'svg',
      'tiff',
      'ktx',
    ].indexOf(type) !== -1
  );
}

export function getAssetSize(
  type: string,
  content: Buffer,
  filePath: string,
): ?{readonly width: number, readonly height: number} {
  if (!isAssetTypeAnImage(type)) {
    return null;
  }
  if (content.length === 0) {
    throw new Error(`Image asset \`${filePath}\` cannot be an empty file.`);
  }
  const {width, height} = getImageSize(content);
  return {width, height};
}

export type AssetData = AssetDataWithoutFiles & {
  readonly files: Array<string>,
  ...
};

export type AssetDataPlugin = (
  assetData: AssetData,
) => AssetData | Promise<AssetData>;

function buildAssetMap(
  dir: string,
  files: ReadonlyArray<string>,
  platform: ?string,
): Map<string, {files: Array<string>, scales: Array<number>}> {
  const platforms = new Set(platform != null ? [platform] : []);
  const assets = files.map((file: string) =>
    AssetPaths.tryParse(file, platforms),
  );
  const map = new Map<string, {files: Array<string>, scales: Array<number>}>();
  assets.forEach(function (asset: ?AssetPath, i: number) {
    if (asset == null) {
      return;
    }
    const file = files[i];
    const assetKey = getAssetKey(asset.assetName, asset.platform);
    let record = map.get(assetKey);
    if (!record) {
      record = {
        scales: [],
        files: [],
      };
      map.set(assetKey, record);
    }

    let insertIndex;
    const length = record.scales.length;

    for (insertIndex = 0; insertIndex < length; insertIndex++) {
      if (asset.resolution < record.scales[insertIndex]) {
        break;
      }
    }
    record.scales.splice(insertIndex, 0, asset.resolution);
    record.files.splice(insertIndex, 0, path.join(dir, file));
  });

  return map;
}

function getAssetKey(assetName: string, platform: ?string): string {
  if (platform != null) {
    return `${assetName} : ${platform}`;
  } else {
    return assetName;
  }
}

async function getAbsoluteAssetRecord(
  assetPath: string,
  platform: ?string = null,
): Promise<{files: Array<string>, scales: Array<number>}> {
  const filename = path.basename(assetPath);
  const dir = path.dirname(assetPath);
  const files = await fs.promises.readdir(dir);

  const assetData = AssetPaths.parse(
    filename,
    new Set(platform != null ? [platform] : []),
  );

  const map = buildAssetMap(dir, files, platform);

  let record;
  if (platform != null) {
    record =
      map.get(getAssetKey(assetData.assetName, platform)) ||
      map.get(assetData.assetName);
  } else {
    record = map.get(assetData.assetName);
  }

  if (!record) {
    throw new Error(
      `Asset not found: ${assetPath} for platform: ${
        platform ?? '(unspecified)'
      }`,
    );
  }

  return record;
}

async function getAbsoluteAssetInfo(
  assetPath: string,
  platform: ?string = null,
): Promise<AssetInfo> {
  const nameData = AssetPaths.parse(
    assetPath,
    new Set(platform != null ? [platform] : []),
  );
  const {name, type} = nameData;

  const {scales, files} = await getAbsoluteAssetRecord(assetPath, platform);
  const hasher = crypto.createHash('md5');

  const fileData = await Promise.all(
    files.map(file => fs.promises.readFile(file)),
  );

  for (const data of fileData) {
    hasher.update(data);
  }

  return {files, hash: hasher.digest('hex'), name, scales, type};
}

export async function getAssetData(
  assetPath: string,
  localPath: string,
  assetDataPlugins: ReadonlyArray<string>,
  platform: ?string,
  publicPath: string,
): Promise<AssetData> {
  // If the path of the asset is outside of the projectRoot, we don't want to
  // use `path.join` since this will generate an incorrect URL path. In that
  // case we just concatenate the publicPath with the relative path.
  let assetUrlPath = localPath.startsWith('..')
    ? publicPath.replace(/\/$/, '') + '/' + path.dirname(localPath)
    : path.join(publicPath, path.dirname(localPath));

  // On Windows, change backslashes to slashes to get proper URL path from file path.
  assetUrlPath = normalizePathSeparatorsToPosix(assetUrlPath);

  const isImage = isAssetTypeAnImage(path.extname(assetPath).slice(1));
  const assetInfo = await getAbsoluteAssetInfo(assetPath, platform ?? null);

  const isImageInput = assetInfo.files[0].includes('.zip/')
    ? fs.readFileSync(assetInfo.files[0])
    : assetInfo.files[0];
  const dimensions = isImage ? getImageSize(isImageInput) : null;
  const scale = assetInfo.scales[0];

  const assetData = {
    __packager_asset: true,
    fileSystemLocation: path.dirname(assetPath),
    httpServerLocation: assetUrlPath,
    width: dimensions ? dimensions.width / scale : undefined,
    height: dimensions ? dimensions.height / scale : undefined,
    scales: assetInfo.scales,
    files: assetInfo.files,
    hash: assetInfo.hash,
    name: assetInfo.name,
    type: assetInfo.type,
  };
  return await applyAssetDataPlugins(assetDataPlugins, assetData);
}

async function applyAssetDataPlugins(
  assetDataPlugins: ReadonlyArray<string>,
  assetData: AssetData,
): Promise<AssetData> {
  if (!assetDataPlugins.length) {
    return assetData;
  }

  const [currentAssetPlugin, ...remainingAssetPlugins] = assetDataPlugins;
  // $FlowFixMe[unsupported-syntax]: impossible to type a dynamic require.
  const mod = require(currentAssetPlugin);
  const assetPluginFunction: AssetDataPlugin =
    mod.__esModule === true && 'default' in mod ? mod.default : mod;

  const resultAssetData = await assetPluginFunction(assetData);
  return await applyAssetDataPlugins(remainingAssetPlugins, resultAssetData);
}

/**
 * Returns all the associated files (for different resolutions) of an asset.
 **/
export async function getAssetFiles(
  assetPath: string,
  platform: ?string = null,
): Promise<Array<string>> {
  const assetData = await getAbsoluteAssetRecord(assetPath, platform);

  return assetData.files;
}

/**
 * Return a buffer with the actual image given a request for an image by path.
 * The relativePath can contain a resolution postfix, in this case we need to
 * find that image (or the closest one to it's resolution) in one of the
 * project roots:
 *
 * 1. We first parse the directory of the asset
 * 2. We then build a map of all assets and their scales in this directory
 * 3. Then try to pick platform-specific asset records
 * 4. Then pick the closest resolution (rounding up) to the requested one
 */
export async function getAsset(
  relativePath: string,
  projectRoot: string,
  watchFolders: ReadonlyArray<string>,
  platform: ?string,
  assetExts: ReadonlyArray<string>,
  fileExistsInFileMap?: (absolutePath: string) => boolean,
): Promise<Buffer> {
  const assetData = AssetPaths.parse(
    relativePath,
    new Set(platform != null ? [platform] : []),
  );

  const absolutePath = path.resolve(projectRoot, relativePath);

  if (!assetExts.includes(assetData.type)) {
    throw new Error(
      `'${relativePath}' cannot be loaded as its extension is not registered in assetExts`,
    );
  }

  // NOTE: If fileExistsInFileMap is not provided, we fall back to pathBelongsToRoots for backward compatibility, as getAsset is part of the public API.
  if (
    fileExistsInFileMap == null &&
    !pathBelongsToRoots(absolutePath, [projectRoot, ...watchFolders])
  ) {
    throw new Error(
      `'${relativePath}' could not be found, because it cannot be found in the project root or any watch folder`,
    );
  }

  const record = await getAbsoluteAssetRecord(absolutePath, platform ?? null);

  for (let i = 0; i < record.scales.length; i++) {
    if (record.scales[i] >= assetData.resolution) {
      if (
        fileExistsInFileMap != null &&
        !fileExistsInFileMap(record.files[i])
      ) {
        continue;
      }
      return fs.promises.readFile(record.files[i]);
    }
  }

  const lastFile = record.files[record.files.length - 1];
  if (fileExistsInFileMap != null && !fileExistsInFileMap(lastFile)) {
    throw new Error(
      `'${relativePath}' could not be found, because it is not within the projectRoot or watchFolders, or it is blocked via the resolver.blockList config`,
    );
  }
  return fs.promises.readFile(lastFile);
}

function pathBelongsToRoots(
  pathToCheck: string,
  roots: ReadonlyArray<string>,
): boolean {
  for (const rootFolder of roots) {
    if (pathToCheck.startsWith(path.resolve(rootFolder))) {
      return true;
    }
  }

  return false;
}
