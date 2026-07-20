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

import type {BundleOptions} from '../shared/types';
import type {TransformProfile} from 'metro-babel-transformer';

import parsePlatformFilePath from '../node-haste/lib/parsePlatformFilePath';
import {SourcePathsMode} from '../shared/types';
import parseCustomResolverOptions from './parseCustomResolverOptions';
import parseCustomTransformOptions from './parseCustomTransformOptions';
import debugModule from 'debug';
import * as jscSafeUrl from 'jsc-safe-url';
import path from 'node:path';

const debug = debugModule(
  'Metro:Server:parseBundleOptionsFromBundleRequestUrl',
);

const TRUE_STRINGS = new Set<string>(['true', '1']);

// This is a bit weird but this is the recommended way of getting around "URL" demanding to have a valid protocol
// for when handling relative URLs: https://nodejs.org/docs/latest-v24.x/api/url.html#urlresolvefrom-to
const RESOLVE_BASE_URL = 'resolve://';

const getBoolQueryParam = (
  searchParams: URLSearchParams,
  opt: string,
  defaultValue: boolean,
) =>
  searchParams.has(opt)
    ? TRUE_STRINGS.has(searchParams.get(opt) || '')
    : defaultValue;

const getBundleType = (bundleType: string): 'map' | 'bundle' =>
  bundleType === 'map' ? bundleType : 'bundle';

const getTransformProfile = (transformProfile: ?string): TransformProfile =>
  transformProfile === 'hermes-stable' || transformProfile === 'hermes-canary'
    ? transformProfile
    : 'default';

export default function parseBundleOptionsFromBundleRequestUrl(
  rawNonJscSafeUrlEncodedUrl: string,
  platforms: Set<string>,
): {
  ...BundleOptions,
  // Retained for backwards compatibility, unused in Metro, to be removed.
  bundleType: string,
} {
  if (
    !URL.canParse(rawNonJscSafeUrlEncodedUrl, RESOLVE_BASE_URL /* baseURL */)
  ) {
    throw new Error('Invalid URL', {cause: rawNonJscSafeUrlEncodedUrl});
  }

  const {
    protocol: _tempProtocol,
    host,
    searchParams,
    pathname: requestPathname,
    search,
    hash,
  } = new URL(rawNonJscSafeUrlEncodedUrl, RESOLVE_BASE_URL /* baseURL */);

  // e.g. "//localhost:8081/foo/bar.js?platform=ios"
  const isRelativeProtocol = rawNonJscSafeUrlEncodedUrl.startsWith('//');

  const protocolPart = isRelativeProtocol ? '//' : _tempProtocol + '//';

  // e.g. "/foo/bar.js?platform=ios"
  const isNoProtocol = !isRelativeProtocol && protocolPart === RESOLVE_BASE_URL;
  if (isNoProtocol) {
    throw new Error(
      'Expecting the request url to have a valid protocol, e.g. "http://", "https://", or "//"',
      {cause: rawNonJscSafeUrlEncodedUrl},
    );
  }

  const sourceUrl = jscSafeUrl.toJscSafeUrl(
    protocolPart + host + requestPathname + search + hash,
  );

  const pathname = searchParams.get('bundleEntry') || requestPathname || '';

  const platform =
    searchParams.get('platform') ||
    parsePlatformFilePath(pathname, platforms).platform;

  const bundleType = getBundleType(path.extname(pathname).substring(1));

  const {pathname: sourceMapPathname} = new URL(
    pathname.replace(/\.(bundle|delta)$/, '.map'),
    RESOLVE_BASE_URL /* baseURL */,
  );
  const sourceMapUrl = protocolPart + host + sourceMapPathname + search + hash;

  const filePathPosix = pathname
    // Using this Metro particular convention for decoding URL paths into file paths
    .split('/')
    .map(segment => decodeURIComponent(segment))
    .join('/')
    .replace(/^(?:\.?\/)?/, './')
    .replace(/\.[^/.]+$/, '');

  debug(
    'Bundle options parsed from rawNonJscSafeUrlEncodedUrl:    %s:\nsourceUrl:    %s\nsourceMapUrl:    %s\nentryFile:    %s',
    rawNonJscSafeUrlEncodedUrl,
    sourceUrl,
    sourceMapUrl,
    filePathPosix,
  );

  return {
    bundleType,
    customResolverOptions: parseCustomResolverOptions(searchParams),
    customTransformOptions: parseCustomTransformOptions(searchParams),
    dev: getBoolQueryParam(searchParams, 'dev', true),
    // Absolute and relative paths are converted to paths relative to root
    entryFile: filePathPosix,
    excludeSource: getBoolQueryParam(searchParams, 'excludeSource', false),
    inlineSourceMap: getBoolQueryParam(searchParams, 'inlineSourceMap', false),
    lazy: getBoolQueryParam(searchParams, 'lazy', false),
    minify: getBoolQueryParam(searchParams, 'minify', false),
    modulesOnly: getBoolQueryParam(searchParams, 'modulesOnly', false),
    onProgress: null,
    platform,
    runModule: getBoolQueryParam(searchParams, 'runModule', true),
    shallow: getBoolQueryParam(searchParams, 'shallow', false),
    sourceMapUrl,
    sourcePaths:
      SourcePathsMode.cast(searchParams.get('sourcePaths')) ??
      SourcePathsMode.Absolute,
    sourceUrl,
    unstable_transformProfile: getTransformProfile(
      searchParams.get('unstable_transformProfile'),
    ),
  };
}
