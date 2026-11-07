/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 * @format
 * @oncall react_native
 */

import addParamsToDefineCall from '../addParamsToDefineCall';

describe('addParamsToDefineCall', () => {
  const input = '__d(function() {}); // SourceMapUrl=something';

  test('adds a simple parameter', () => {
    expect(addParamsToDefineCall(input, 10)).toEqual(
      '__d(function() {},10); // SourceMapUrl=something',
    );
  });

  test('adds several parameters', () => {
    expect(addParamsToDefineCall(input, 10, {foo: 'bar'})).toEqual(
      '__d(function() {},10,{"foo":"bar"}); // SourceMapUrl=something',
    );
  });

  test('adds null parameters', () => {
    expect(addParamsToDefineCall(input, null, 10)).toEqual(
      '__d(function() {},null,10); // SourceMapUrl=something',
    );
  });

  test('adds undefined parameters', () => {
    expect(addParamsToDefineCall(input, null, 10)).toEqual(
      '__d(function() {},null,10); // SourceMapUrl=something',
    );
  });
});
