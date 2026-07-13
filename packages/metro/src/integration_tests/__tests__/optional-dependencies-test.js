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

const Metro = require('../../..');
const execBundle = require('../execBundle');

jest.setTimeout(30 * 1000);

test('builds a simple bundle', async () => {
  const config = await Metro.loadConfig(
    {
      config: require.resolve('../metro.config.js'),
    },
    {
      transformer: {
        allowOptionalDependencies: true,
      },
    },
  );

  const result = await Metro.runBuild(config, {
    entry: 'optional-dependencies/index.js',
    dev: true,
    minify: false,
  });

  // The module we're interested in should be the first defined
  const match = result.code
    .replaceAll(
      'optional-dependencies\\\\', // FIXME: Normalise for Windows
      'optional-dependencies/',
    )
    .match(/__d\(.*"optional-dependencies\/index\.js"\);/s);

  expect(match).not.toBeNull();

  expect(match[0]).toMatchInlineSnapshot(`
"__d(function (global, require, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  'use strict';

  Object.defineProperty(exports, '__esModule', {
    value: true
  });
  var shouldBeB, shouldBeC;
  try {
    shouldBeB = require(_dependencyMap[0], \\"./not-exists\\");
  } catch (_unused) {
    shouldBeB = require(_dependencyMap[1], \\"./optional-b\\");
  }
  (function requireOptionalC() {
    try {
      shouldBeC = require(_dependencyMap[2], \\"./optional-c\\");
    } catch (e) {}
  })();
  var a = require(_dependencyMap[3], \\"./required-a\\");
  var b = shouldBeB;
  var c = shouldBeC;
  exports.a = a;
  exports.b = b;
  exports.c = c;
},0,[null,1,2,3],\\"optional-dependencies/index.js\\");"
`);

  const object = execBundle(result.code);

  expect(object).toEqual({
    a: 'a',
    b: 'b',
    c: 'c',
  });
});
