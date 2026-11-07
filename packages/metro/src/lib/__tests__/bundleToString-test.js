/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import bundleToString from '../bundleToString';

describe('bundleToString', () => {
  test('serializes a bundle into a plain JS bundle', () => {
    expect(
      bundleToString({
        pre: 'console.log("Hello World!");',
        post: 'console.log("That\'s all folks!");',
        modules: [[0, 'console.log("Best module.");']],
      }).code,
    ).toMatchInlineSnapshot(`
      "console.log(\\"Hello World!\\");
      console.log(\\"Best module.\\");
      console.log(\\"That's all folks!\\");"
    `);
  });

  test('modules are sorted by id', () => {
    expect(
      bundleToString({
        pre: 'console.log("Hello World!");',
        post: 'console.log("That\'s all folks!");',
        modules: [
          [3, '3'],
          [0, '0'],
          [2, '2'],
          [1, '1'],
        ],
      }).code,
    ).toMatchInlineSnapshot(`
      "console.log(\\"Hello World!\\");
      0
      1
      2
      3
      console.log(\\"That's all folks!\\");"
    `);
  });

  test("doesn't add extraneous line breaks when either pre, post or modules are absent", () => {
    expect(
      bundleToString({
        pre: '',
        post: '',
        modules: [
          [0, ''],
          [1, ''],
        ],
      }).code,
    ).toMatchInlineSnapshot('""');

    expect(
      bundleToString({
        pre: 'pre',
        post: 'post',
        modules: [
          [0, ''],
          [1, ''],
        ],
      }).code,
    ).toMatchInlineSnapshot(`
      "pre
      post"
    `);

    expect(
      bundleToString({
        pre: '',
        post: 'console.log("That\'s all folks!");',
        modules: [[0, '0']],
      }).code,
    ).toMatchInlineSnapshot(`
      "0
      console.log(\\"That's all folks!\\");"
    `);

    expect(
      bundleToString({
        pre: 'console.log("Hello World!");',
        post: '',
        modules: [[0, '0']],
      }).code,
    ).toMatchInlineSnapshot(`
      "console.log(\\"Hello World!\\");
      0"
    `);

    expect(
      bundleToString({
        pre: '',
        post: '',
        modules: [[0, '0']],
      }).code,
    ).toMatchInlineSnapshot('"0"');

    expect(
      bundleToString({
        pre: '',
        post: '',
        modules: [],
      }).code,
    ).toMatchInlineSnapshot('""');

    expect(
      bundleToString({
        pre: 'console.log("Hello World!");',
        post: '',
        modules: [],
      }).code,
    ).toMatchInlineSnapshot('"console.log(\\"Hello World!\\");"');

    expect(
      bundleToString({
        pre: '',
        post: 'console.log("That\'s all folks!");',
        modules: [[0, '0']],
      }).code,
    ).toMatchInlineSnapshot(`
      "0
      console.log(\\"That's all folks!\\");"
    `);
  });
});
