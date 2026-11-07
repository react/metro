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

import parseCustomResolverOptions from '../parseCustomResolverOptions';

test('should parse some custom options from a http url', () => {
  const myUrl =
    'http://localhost/my/bundle.bundle?dev=true&resolver.foo=value&resolver.bar=other';

  expect(parseCustomResolverOptions(new URL(myUrl).searchParams)).toEqual({
    foo: 'value',
    bar: 'other',
  });
});

test('should parse some custom options from a websocket url', () => {
  const myUrl = 'ws://localhost/hot?resolver.foo=value&resolver.bar=other';

  expect(parseCustomResolverOptions(new URL(myUrl).searchParams)).toEqual({
    foo: 'value',
    bar: 'other',
  });
});

test('should return an empty object if there are no custom params', () => {
  const myUrl = 'http://localhost/my/bundle.bundle?dev=true';

  expect(parseCustomResolverOptions(new URL(myUrl).searchParams)).toEqual({});
});
