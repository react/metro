/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 * @oncall react_native
 */

/**
 * script to build (transpile) files.
 * By default it transpiles all files for all packages and writes them
 * into `build/` directory.
 *
 * Files matching IGNORE_PATTERNS will not be copied to the build directory.
 *
 * Non-js will be copied without transpiling.
 *
 * Example:
 *  node ./scripts/build.js
 *  node ./scripts/build.js /user/c/metro/packages/metro-abc/src/abc.js
 */

'use strict';

const getPackages = require('./_getPackages');
const babel = require('@babel/core');
const fs = require('node:fs');
const path = require('node:path');
const {styleText} = require('node:util');
const prettier = require('prettier');

const SRC_DIR = 'src';
const TYPES_DIR = 'types';
const BUILD_DIR = 'build';
const JS_FILES_PATTERN = '**/*.js';
const IGNORE_PATTERNS = [
  '**/__tests__/**',
  '**/__fixtures__/**',
  '**/__flowtests__/**',
  '**/__mocks__/**',
  '**/integration_tests/**',
];
const PACKAGES_DIR = path.resolve(__dirname, '../packages');

const fixedWidth = function (str /*: string*/) {
  const WIDTH = 80;
  const strs = str.match(new RegExp(`(.{1,${WIDTH}})`, 'g')) || [str];
  let lastString = strs[strs.length - 1];
  if (lastString.length < WIDTH) {
    lastString += Array(WIDTH - lastString.length).join(styleText('dim', '.'));
  }
  return strs.slice(0, -1).concat(lastString).join('\n');
};

function getPackageName(file /*: string */) {
  return path.relative(PACKAGES_DIR, file).split(path.sep)[0];
}

function getBuildPath(file /*: string */, buildFolder /*: string */) {
  const pkgName = getPackageName(file);
  const pkgSrcPath = path.resolve(PACKAGES_DIR, pkgName, SRC_DIR);
  const pkgBuildPath =
    process.env.PACKAGES_DIR != null
      ? path.resolve(process.env.PACKAGES_DIR, pkgName, SRC_DIR)
      : path.resolve(PACKAGES_DIR, pkgName, buildFolder);
  const relativeToSrcPath = path.relative(pkgSrcPath, file);
  return path.resolve(pkgBuildPath, relativeToSrcPath);
}

function buildPackage(p /*: string */) {
  const srcDir = path.resolve(p, SRC_DIR);
  const typesDir = path.resolve(p, TYPES_DIR);
  const buildDir = path.resolve(p, BUILD_DIR);
  const files = fs
    .globSync(path.join(srcDir, '**/*'), {withFileTypes: true /*:: as true */})
    .filter(d => d.isFile())
    .map(d => path.join(d.parentPath, d.name.toString()));
  const typescriptDefs = fs
    .globSync(path.join(typesDir, '**/*.d.ts'), {
      withFileTypes: true /*:: as true */,
    })
    .filter(d => d.isFile())
    .map(d => path.join(d.parentPath, d.name.toString()));

  process.stdout.write(fixedWidth(`${path.basename(p)}\n`));

  files.forEach(file => buildFile(file, true));
  typescriptDefs.forEach(file =>
    fs.copyFileSync(file, file.replace(typesDir, buildDir)),
  );

  process.stdout.write(`[  ${styleText('green', 'OK')}  ]\n`);
}

async function buildFile(file /*: string */, silent /*: number | boolean */) {
  const destPath = getBuildPath(file, BUILD_DIR);

  fs.mkdirSync(path.dirname(destPath), {recursive: true});
  if (IGNORE_PATTERNS.some(pattern => path.matchesGlob(file, pattern))) {
    silent ||
      process.stdout.write(
        styleText('dim', '  \u2022 ') +
          path.relative(PACKAGES_DIR, file) +
          ' (ignore)\n',
      );
  } else if (!path.matchesGlob(file, JS_FILES_PATTERN)) {
    fs.createReadStream(file).pipe(fs.createWriteStream(destPath));
    silent ||
      process.stdout.write(
        styleText('red', '  \u2022 ') +
          path.relative(PACKAGES_DIR, file) +
          styleText('red', ' \u21D2 ') +
          path.relative(PACKAGES_DIR, destPath) +
          ' (copy)' +
          '\n',
      );
  } else {
    const transformed = await prettier.format(
      babel.transformFileSync(file, {}).code,
      {
        parser: 'babel',
      },
    );
    fs.writeFileSync(destPath, transformed);
    const source = fs.readFileSync(file).toString('utf-8');
    if (/\@flow/.test(source)) {
      fs.createReadStream(file).pipe(fs.createWriteStream(destPath + '.flow'));
    }
    silent ||
      process.stdout.write(
        styleText('green', '  \u2022 ') +
          path.relative(PACKAGES_DIR, file) +
          styleText('green', ' \u21D2 ') +
          path.relative(PACKAGES_DIR, destPath) +
          '\n',
      );
  }
}

const files = process.argv.slice(2);

if (files.length) {
  files.forEach(buildFile);
} else {
  process.stdout.write(
    styleText(['bold', 'inverse'], 'Building packages') +
      ' (using Babel v' +
      babel.version +
      ')\n',
  );
  getPackages().forEach(buildPackage);
  process.stdout.write('\n');
}
