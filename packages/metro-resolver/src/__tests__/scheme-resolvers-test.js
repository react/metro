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

'use strict';

import type {
  CustomResolutionContext,
  CustomResolver,
  Resolution,
  ResolutionContext,
} from '../index';

import {createResolutionContext, posixToSystemPath as p} from './utils';

const Resolver = require('../index');

const fileMap = {
  [p('/root/project/foo.js')]: '',
  [p('/root/project/bar.js')]: '',
};

function createContext(
  schemeResolvers: Readonly<{[scheme: string]: CustomResolver}>,
): ResolutionContext {
  return {
    ...createResolutionContext(fileMap),
    originModulePath: p('/root/project/foo.js'),
    schemeResolvers,
  };
}

type Call = {
  context: CustomResolutionContext,
  specifier: string,
  platform: string | null,
};

function makeCapturingResolver(resolution: Resolution): {
  resolver: CustomResolver,
  calls: Array<Call>,
} {
  const calls: Array<Call> = [];
  const resolver: CustomResolver = (context, specifier, platform) => {
    calls.push({context, specifier, platform});
    return resolution;
  };
  return {resolver, calls};
}

test('invokes a registered scheme resolver with the full specifier', () => {
  const resolution: Resolution = {
    type: 'sourceFile',
    filePath: p('/resolved/by/scheme.js'),
  };
  const {resolver, calls} = makeCapturingResolver(resolution);
  const context = createContext({test: resolver});

  expect(Resolver.resolve(context, 'test:some/module', 'ios')).toEqual(
    resolution,
  );
  expect(calls).toHaveLength(1);
  expect(calls[0].specifier).toBe('test:some/module');
  expect(calls[0].platform).toBe('ios');
  // The resolver receives a delegating context whose `resolveRequest` is the
  // default `resolve`, so it can fall back to standard resolution.
  expect(calls[0].context.resolveRequest).toBe(Resolver.resolve);
});

test('scheme resolver can delegate back to default resolution', () => {
  const schemeResolver: CustomResolver = (context, specifier, platform) =>
    context.resolveRequest(context, './bar', platform);
  const context = createContext({test: schemeResolver});

  expect(Resolver.resolve(context, 'test:anything', null)).toEqual({
    type: 'sourceFile',
    filePath: p('/root/project/bar.js'),
  });
});

test('preserves the structured error when delegated resolution fails', () => {
  const schemeResolver: CustomResolver = (context, specifier, platform) =>
    context.resolveRequest(context, './does-not-exist', platform);
  const context = createContext({test: schemeResolver});

  // The failure originates in default resolution, not in the scheme resolver,
  // so it must not be flattened into FailedToResolveUnsupportedError —
  // downstream consumers rely on `candidates` for diagnostics.
  expect(() => Resolver.resolve(context, 'test:anything', null)).toThrow(
    Resolver.FailedToResolvePathError,
  );
});

test('re-throws an error thrown by a registered scheme resolver as FailedToResolveUnsupportedError', () => {
  const failing: CustomResolver = () => {
    throw new Error('boom while resolving');
  };
  const context = createContext({test: failing});

  expect(() => Resolver.resolve(context, 'test:anything', 'ios')).toThrow(
    Resolver.FailedToResolveUnsupportedError,
  );
});

test('throws a scheme-specific error for an unregistered scheme once other resolution is exhausted', () => {
  const {resolver, calls} = makeCapturingResolver({type: 'empty'});
  const context = createContext({test: resolver});

  // `other:` parses as a scheme but has no registered resolver, so it falls
  // through to Haste/node_modules/extraNodeModules resolution and, only once
  // those are exhausted, throws a scheme-specific error.
  expect(() => Resolver.resolve(context, 'other:module', null)).toThrow(
    Resolver.FailedToResolveUnsupportedError,
  );
  expect(calls).toHaveLength(0);
});

test('an unregistered scheme still resolves if another strategy succeeds', () => {
  const {resolver, calls} = makeCapturingResolver({type: 'empty'});
  const context = {
    ...createContext({test: resolver}),
    resolveHasteModule: (name: string) =>
      name === 'other:module' ? p('/root/project/bar.js') : null,
  };

  // The deprecated backwards-compatibility path: a scheme-like specifier with
  // no registered resolver must still resolve via Haste/extraNodeModules
  // rather than failing on the scheme.
  expect(Resolver.resolve(context, 'other:module', null)).toEqual({
    type: 'sourceFile',
    filePath: p('/root/project/bar.js'),
  });
  expect(calls).toHaveLength(0);
});

test('relative specifiers are resolved before scheme dispatch', () => {
  const {resolver, calls} = makeCapturingResolver({type: 'empty'});
  const context = createContext({test: resolver});

  // `./bar` is handled by relative/absolute resolution and must never be
  // mistaken for a scheme, even when scheme resolvers are registered.
  expect(Resolver.resolve(context, './bar', null)).toEqual({
    type: 'sourceFile',
    filePath: p('/root/project/bar.js'),
  });
  expect(calls).toHaveLength(0);
});

test('does not dispatch a scheme matching an Object.prototype key to an inherited value', () => {
  const {resolver, calls} = makeCapturingResolver({type: 'empty'});
  const context = createContext({test: resolver});

  // `constructor:` is a valid URL scheme that lowercases to `constructor`, an
  // `Object.prototype` key. A naive `schemeResolvers[scheme]` read would return
  // `Object.prototype.constructor` (non-null) and wrongly invoke it. The
  // own-property guard must treat it as unregistered and fall through.
  expect(() => Resolver.resolve(context, 'constructor:module', null)).toThrow(
    Resolver.FailedToResolveUnsupportedError,
  );
  expect(calls).toHaveLength(0);
});
