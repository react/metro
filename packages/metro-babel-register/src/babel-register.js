/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow
 * @oncall react_native
 */

/* eslint-disable import/no-commonjs */

'use strict';

/*::
import type {BabelCoreOptions} from '@babel/core';
*/

const escapeRegExp = require('escape-string-regexp');
const fs = require('node:fs');
const path = require('node:path');

let _only /*: ReadonlyArray<RegExp | string> */ = [];

function register(
  onlyList /*: ReadonlyArray<RegExp | string> */,
  opts /*: ?Readonly<{earlyPlugins?: BabelCoreOptions['plugins']}> */ = {},
) {
  // NB: `require('@babel/register')` registers Babel as a side-effect, and
  // also returns a register function that overrides the first registration
  // when called.
  //
  // If `require` is used between the two registrations, Babel will behave in
  // its default mode, searching for a config file and loading whatever
  // plugins/presets are specified within, to compile whatever is `require`d.
  //
  // Since our `config()` uses `require` to load plugins, and we don't want
  // these plugins to be compiled with an arbitrary Babel config, we must
  // prepare the config object before calling `require('@babel/register')`.
  const registerConfig = {
    ...config(onlyList, opts),
    extensions: [
      '.ts',
      '.tsx',
      // Babel's default extensions
      '.es6',
      '.es',
      '.jsx',
      '.js',
      '.mjs',
    ],
  };

  /* $FlowFixMe[incompatible-type] Natural Inference rollout. See
   * https://fburl.com/gdoc/y8dn025u */
  require('@babel/register')(registerConfig);
}

function config(
  onlyList /*: ReadonlyArray<RegExp | string> */,
  options /*: ?Readonly<{
    lazy?: boolean,
    earlyPlugins?: BabelCoreOptions['plugins'],
  }> */,
) /*: BabelCoreOptions */ {
  _only = _only.concat(onlyList);
  return {
    babelrc: false,
    compact: false,
    configFile: false,
    browserslistConfigFile: false,
    // make sure we don't transpile any npm packages
    ignore: [/\/node_modules\//],
    only: [..._only],
    plugins: [
      ...(options?.earlyPlugins ?? []),
      [require('@babel/plugin-proposal-export-namespace-from').default],
      [
        require('@babel/plugin-transform-modules-commonjs').default,
        {
          lazy: options && options.lazy,
        },
      ],
    ],
    presets: [],
    retainLines: true,
    sourceMaps: 'inline',
    overrides: [
      {
        test: /\.js$/,
        plugins: [
          [require('babel-plugin-syntax-hermes-parser').default],
          [require('babel-plugin-transform-flow-enums')],
          [require('@babel/plugin-transform-flow-strip-types').default],
        ],
      },
      {
        test: /\.tsx?$/,
        plugins: [
          require('babel-plugin-replace-ts-export-assignment'),
          require('./plugins/babel-plugin-metro-replace-ts-require-assignment'),
        ],
        presets: [
          [
            require('@babel/preset-typescript').default,
            {
              // will be the default in Babel 8, so let's just turn it on now
              allowDeclareFields: true,
              // will be default in the future, but we don't want to use it
              allowNamespaces: false,
            },
          ],
        ],
      },
    ],
  };
}

/**
 * We use absolute paths for matching only the top-level folders reliably. For
 * example, we would not want to match some deeply nested folder that happens to
 * have the same name as one of `BABEL_ENABLED_PATHS`.
 */
function buildRegExps(
  basePath /*: string */,
  dirPaths /*: ReadonlyArray<RegExp | string> */,
) /*: ReadonlyArray<RegExp> */ {
  return dirPaths.map(folderPath =>
    // Babel cares about Windows/Unix paths since v7b44
    // https://github.com/babel/babel/issues/8184
    // basePath + path.sep + dirPath/dirRegex
    // /home/name/webroot/js + / + relative/path/to/exclude
    // c:\home\name\webroot\js + \ + relative\path\to\exclude
    folderPath instanceof RegExp
      ? new RegExp(
          `^${escapeRegExp(path.resolve(basePath, '.') + path.sep)}${
            folderPath.source // This is an actual regex value, don't escape it.
          }`,
          folderPath.flags,
        )
      : new RegExp('^' + escapeRegExp(path.resolve(basePath, folderPath))),
  );
}

let isRegisteredForMetroMonorepo = false;

function registerForMetroMonorepo() {
  // Noop if we have already registered Babel here.
  if (isRegisteredForMetroMonorepo) {
    return;
  }
  // Noop if we are in NODE_ENV=production.
  if (process.env.NODE_ENV === 'production') {
    return;
  }
  // Noop if we seem to be outside of the Metro source tree.
  if (
    !__dirname.endsWith(
      ['', 'packages', 'metro-babel-register', 'src'].join(path.sep),
    )
  ) {
    return;
  }
  // Bail out if prepare-release has run here.
  if (
    fs.existsSync(
      path.join(__dirname, '..', 'src.real', path.basename(__filename)),
    )
  ) {
    return;
  }
  if (process.env.FBSOURCE_ENV === '1') {
    // If we're running in the Meta-internal monorepo, use the central Babel
    // registration, which registers all of the relevant source directories
    // including Metro's root.
    //
    // $FlowExpectedError[cannot-resolve-module] - Won't resolve in OSS
    require('@fb-tools/babel-register'); // eslint-disable-line
  } else {
    register([path.resolve(__dirname, '..', '..')]);
  }
  isRegisteredForMetroMonorepo = true;
}

module.exports = {
  register,
  config,
  buildRegExps,
  unstable_registerForMetroMonorepo: registerForMetroMonorepo,
};
