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

import type {PerfLogger, RootPerfLogger} from '../types';

export {default as defaultCreateModuleIdFactory} from './createModuleIdFactory';

export const assetExts: Array<string> = [
  // Image formats
  'bmp',
  'gif',
  'jpg',
  'jpeg',
  'png',
  'psd',
  'svg',
  'webp',
  'xml',
  // Video formats
  'm4v',
  'mov',
  'mp4',
  'mpeg',
  'mpg',
  'webm',
  // Audio formats
  'aac',
  'aiff',
  'caf',
  'm4a',
  'mp3',
  'wav',
  // Document formats
  'html',
  'pdf',
  'yaml',
  'yml',
  // Font formats
  'otf',
  'ttf',
  // Archives (virtual files)
  'zip',
];

export const assetResolutions: Array<string> = ['1', '1.5', '2', '3', '4'];

export const sourceExts: Array<string> = ['js', 'jsx', 'json', 'ts', 'tsx'];

export const additionalExts: Array<string> = ['cjs', 'mjs'];

export const moduleSystem: string =
  require.resolve('metro-runtime/src/polyfills/require.js');

export const platforms: Array<string> = ['ios', 'android', 'windows', 'web'];

export const DEFAULT_METRO_MINIFIER_PATH = 'metro-minify-terser';

export const noopPerfLoggerFactory = (): RootPerfLogger => {
  class Logger {
    start() {}
    end() {}
    annotate() {}
    point() {}
    subSpan(): PerfLogger {
      return this;
    }
  }
  return new Logger();
};
