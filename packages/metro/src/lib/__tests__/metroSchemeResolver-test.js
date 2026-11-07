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

import type {CustomResolutionContext, CustomResolver} from 'metro-resolver';

import metroSchemeResolver from '../metroSchemeResolver';
import {createResolutionContext} from 'metro-resolver/private/__tests__/utils';

const p: (posixPath: string) => string =
  process.platform === 'win32'
    ? posixPath => posixPath.replace(/^\//, 'C:\\').replaceAll('/', '\\')
    : posixPath => posixPath;

type Call = {
  originModulePath: string,
  specifier: string,
  platform: string | null,
};

function makeContext(resolveRequest: CustomResolver): CustomResolutionContext {
  return {
    ...createResolutionContext({}),
    originModulePath: p('/root/project/foo.js'),
    resolveRequest,
  };
}

// Records each delegated resolution call and returns a stub resolved file, so
// the resolver's package self-resolution of the subpath can be observed.
function makeCapturingResolveRequest(): {
  resolveRequest: CustomResolver,
  calls: Array<Call>,
} {
  const calls: Array<Call> = [];
  const resolveRequest: CustomResolver = (context, specifier, platform) => {
    calls.push({
      originModulePath: context.originModulePath,
      specifier,
      platform,
    });
    return {type: 'sourceFile', filePath: p('/resolved.js')};
  };
  return {resolveRequest, calls};
}

test('resolves metro:babel-runtime to @babel/runtime via package self resolution', () => {
  const {resolveRequest, calls} = makeCapturingResolveRequest();
  const context = makeContext(resolveRequest);

  expect(metroSchemeResolver(context, 'metro:babel-runtime', 'ios')).toEqual({
    type: 'sourceFile',
    filePath: p('/resolved.js'),
  });
  expect(calls).toHaveLength(1);
  expect(calls[0].specifier).toBe('@babel/runtime');
  expect(calls[0].platform).toBe('ios');
  // The origin is @babel/runtime's own package.json (statically resolved), so
  // Metro resolves the subpath as a package self-reference via its `exports`.
  expect(calls[0].originModulePath).toContain(p('@babel/runtime'));
  expect(calls[0].originModulePath.endsWith('package.json')).toBe(true);
});

test('resolves metro:babel-runtime subpaths to @babel/runtime subpaths', () => {
  const {resolveRequest, calls} = makeCapturingResolveRequest();
  const context = makeContext(resolveRequest);

  metroSchemeResolver(
    context,
    'metro:babel-runtime/helpers/interopRequireDefault',
    null,
  );
  expect(calls).toHaveLength(1);
  expect(calls[0].specifier).toBe(
    '@babel/runtime/helpers/interopRequireDefault',
  );
});

test('throws for unsupported metro: specifiers', () => {
  const {resolveRequest, calls} = makeCapturingResolveRequest();
  const context = makeContext(resolveRequest);

  expect(() =>
    metroSchemeResolver(context, 'metro:something-else', null),
  ).toThrow("Unsupported 'metro:' pathname: something-else");
  expect(calls).toHaveLength(0);
});

test.each([
  ['metro:runtime', 'metro-runtime'],
  ['metro:runtime/modules/asyncRequire', 'metro-runtime/modules/asyncRequire'],
])(
  'resolves %s to metro-runtime via package self resolution',
  (specifier, expected) => {
    const {resolveRequest, calls} = makeCapturingResolveRequest();
    const context = {
      ...makeContext(resolveRequest),
      unstable_enablePackageExports: false,
    };

    expect(metroSchemeResolver(context, specifier, 'ios')).toEqual({
      type: 'sourceFile',
      filePath: p('/resolved.js'),
    });
    expect(calls).toEqual([
      {
        originModulePath: require.resolve('metro-runtime/package.json'),
        specifier: expected,
        platform: 'ios',
      },
    ]);
  },
);

test('applies package exports for metro:runtime regardless of the project setting', () => {
  const contexts: Array<CustomResolutionContext> = [];
  const context = {
    ...makeContext(ctx => {
      contexts.push(ctx);
      return {type: 'sourceFile', filePath: p('/resolved.js')};
    }),
    unstable_enablePackageExports: false,
  };

  metroSchemeResolver(context, 'metro:runtime/modules/asyncRequire', null);
  expect(contexts).toHaveLength(1);
  expect(contexts[0].unstable_enablePackageExports).toBe(true);
});
