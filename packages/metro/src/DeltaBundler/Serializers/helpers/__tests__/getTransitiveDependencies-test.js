/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

'use strict';

import getTransitiveDependencies from '../getTransitiveDependencies';

function createModule(name, dependencies, type = 'module') {
  return [
    `/root/${name}.js`,
    {
      path: `/root/${name}.js`,
      dependencies: new Map(
        dependencies.map(dep => [
          dep,
          {absolutePath: `/root/${dep}.js`, data: {isAsync: false, name: dep}},
        ]),
      ),
      output: {type, code: `__d(function() {${name}()});`},
    },
  ];
}

const graph = {
  dependencies: new Map([
    createModule('entry', ['entry2', 'foo']),
    createModule('entry2', ['foo2']),
    createModule('foo2', []),
    createModule('foo', ['bar', 'baz', 'qux']),
    createModule('baz', [], 'asset'),
    createModule('bar', []),
    createModule('qux', []),
  ]),
};

test('should find the transitive dependencies correctly', () => {
  expect(getTransitiveDependencies('/root/entry.js', graph)).toEqual(
    new Set([
      '/root/entry2.js',
      '/root/foo2.js',
      '/root/foo.js',
      '/root/bar.js',
      '/root/baz.js',
      '/root/qux.js',
    ]),
  );

  expect(getTransitiveDependencies('/root/bar.js', graph)).toEqual(new Set());

  expect(getTransitiveDependencies('/root/foo.js', graph)).toEqual(
    new Set(['/root/bar.js', '/root/baz.js', '/root/qux.js']),
  );
});
