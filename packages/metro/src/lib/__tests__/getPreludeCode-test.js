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

import getPreludeCode from '../getPreludeCode';

const vm = require('node:vm');

['development', 'production'].forEach((mode: string) => {
  describe(`${mode} mode`, () => {
    const isDev = mode === 'development';
    const globalPrefix = '__metro';
    const requireCycleIgnorePatterns: Array<RegExp> = [];
    const unstable_forceFullRefreshPatterns: Array<RegExp> = [];

    test('sets up `process.env.NODE_ENV` and `__DEV__`', () => {
      const sandbox: $FlowFixMe = {};
      vm.createContext(sandbox);
      vm.runInContext(
        getPreludeCode({
          isDev,
          globalPrefix,
          requireCycleIgnorePatterns,
          unstable_forceFullRefreshPatterns,
        }),
        sandbox,
      );
      expect(sandbox.process.env.NODE_ENV).toEqual(mode);
      expect(sandbox.__DEV__).toEqual(isDev);
    });

    test('sets up `__METRO_GLOBAL_PREFIX__`', () => {
      const sandbox: $FlowFixMe = {};
      vm.createContext(sandbox);
      vm.runInContext(
        getPreludeCode({
          isDev,
          globalPrefix: '__customPrefix',
          requireCycleIgnorePatterns,
          unstable_forceFullRefreshPatterns,
        }),
        sandbox,
      );
      expect(sandbox.__METRO_GLOBAL_PREFIX__).toBe('__customPrefix');
    });

    test('sets up `${globalPrefix}__requireCycleIgnorePatterns` in development', () => {
      const sandbox: $FlowFixMe = {};
      vm.createContext(sandbox);
      vm.runInContext(
        getPreludeCode({
          isDev,
          globalPrefix,
          requireCycleIgnorePatterns: [
            /blah/,
            /(^|\/|\\)node_modules($|\/|\\)/,
          ],
          unstable_forceFullRefreshPatterns,
        }),
        sandbox,
      );

      if (isDev) {
        expect(sandbox[`${globalPrefix}__requireCycleIgnorePatterns`]).toEqual([
          /blah/,
          /(^|\/|\\)node_modules($|\/|\\)/,
        ]);
      } else {
        expect(
          sandbox[`${globalPrefix}__requireCycleIgnorePatterns`],
        ).not.toBeDefined();
      }
    });

    test('sets up `${globalPrefix}__unstable_forceFullRefreshPatterns` in development', () => {
      const sandbox: $FlowFixMe = {};
      vm.createContext(sandbox);
      vm.runInContext(
        getPreludeCode({
          isDev,
          globalPrefix,
          requireCycleIgnorePatterns,
          unstable_forceFullRefreshPatterns: [/\.stylex/, /\.theme/],
        }),
        sandbox,
      );

      if (isDev) {
        expect(
          sandbox[`${globalPrefix}__unstable_forceFullRefreshPatterns`],
        ).toEqual([/\.stylex/, /\.theme/]);
      } else {
        expect(
          sandbox[`${globalPrefix}__unstable_forceFullRefreshPatterns`],
        ).not.toBeDefined();
      }
    });

    test('does not override an existing `process.env`', () => {
      const nextTick = () => {};
      const sandbox: $FlowFixMe = {process: {nextTick, env: {FOOBAR: 123}}};
      vm.createContext(sandbox);
      vm.runInContext(
        getPreludeCode({
          isDev,
          globalPrefix,
          requireCycleIgnorePatterns,
          unstable_forceFullRefreshPatterns,
        }),
        sandbox,
      );
      expect(sandbox.process.env.NODE_ENV).toEqual(mode);
      expect(sandbox.process.env.FOOBAR).toEqual(123);
      expect(sandbox.process.nextTick).toEqual(nextTick);
    });

    test('allows to define additional variables', () => {
      const sandbox: $FlowFixMe = {};
      const FOO = '1';
      const BAR = 2;
      vm.createContext(sandbox);
      vm.runInContext(
        getPreludeCode({
          isDev,
          globalPrefix,
          requireCycleIgnorePatterns,
          unstable_forceFullRefreshPatterns,
          extraVars: {FOO, BAR},
        }),
        sandbox,
      );
      expect(sandbox.FOO).toBe(FOO);
      expect(sandbox.BAR).toBe(BAR);
    });

    test('does not override core variables with additional variables', () => {
      const sandbox: $FlowFixMe = {};
      vm.createContext(sandbox);
      vm.runInContext(
        getPreludeCode({
          isDev,
          globalPrefix,
          requireCycleIgnorePatterns,
          unstable_forceFullRefreshPatterns,
          extraVars: {__DEV__: 123},
        }),
        sandbox,
      );
      expect(sandbox.__DEV__).toBe(isDev);
    });
  });
});
