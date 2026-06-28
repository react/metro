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

import type {InputConfigT} from '../types';

import {mergeConfig} from '../loadConfig';

describe('mergeConfig', () => {
  test('can merge empty configs', () => {
    expect(mergeConfig({}, {})).toStrictEqual({
      resolver: {},
      serializer: {},
      server: {},
      symbolicator: {},
      transformer: {},
      watcher: {
        healthCheck: {},
        unstable_autoSaveCache: {},
        watchman: {},
      },
    });
  });

  test('applies trailing overrides after an async config function', async () => {
    const base: InputConfigT = {server: {port: 8081}};
    const asyncOverride = (): Promise<InputConfigT> =>
      Promise.resolve({transformer: {assetPlugins: ['async-plugin']}});
    const trailing: InputConfigT = {resolver: {sourceExts: ['ts']}};

    const result = await mergeConfig(base, asyncOverride, trailing);

    // The base and every config in the chain must survive the async branch.
    expect(result.server?.port).toBe(8081);
    expect(result.transformer?.assetPlugins).toEqual(['async-plugin']);
    expect(result.resolver?.sourceExts).toEqual(['ts']);
  });

  describe('server.tls merging', () => {
    describe('override IS applied when tls is false or object', () => {
      test('override tls: object replaces base tls: false', () => {
        const base: InputConfigT = {server: {tls: false}};
        const override: InputConfigT = {
          server: {tls: {key: 'key', cert: 'cert'}},
        };
        const result = mergeConfig(base, override);
        expect(result.server?.tls).toStrictEqual({key: 'key', cert: 'cert'});
      });

      test('override tls: false replaces base tls: object', () => {
        const base: InputConfigT = {server: {tls: {key: 'key', cert: 'cert'}}};
        const override: InputConfigT = {server: {tls: false}};
        const result = mergeConfig(base, override);
        expect(result.server?.tls).toBe(false);
      });

      test('override tls: false sets tls when base is undefined', () => {
        const base: InputConfigT = {server: {}};
        const override: InputConfigT = {server: {tls: false}};
        const result = mergeConfig(base, override);
        expect(result.server?.tls).toBe(false);
      });

      test('override tls: object sets tls when base is undefined', () => {
        const base: InputConfigT = {server: {}};
        const override: InputConfigT = {
          server: {tls: {key: 'key', cert: 'cert'}},
        };
        const result = mergeConfig(base, override);
        expect(result.server?.tls).toStrictEqual({key: 'key', cert: 'cert'});
      });

      test('override tls: object deep merges with base tls: object', () => {
        const base: InputConfigT = {
          server: {tls: {key: 'baseKey', cert: 'baseCert', ca: 'baseCa'}},
        };
        const override: InputConfigT = {
          server: {tls: {key: 'newKey', cert: 'newCert'}},
        };
        const result = mergeConfig(base, override);
        expect(result.server?.tls).toStrictEqual({
          key: 'newKey',
          cert: 'newCert',
          ca: 'baseCa',
        });
      });

      test('override tls: object adds new properties to base tls: object', () => {
        const base: InputConfigT = {
          server: {tls: {key: 'baseKey', cert: 'baseCert'}},
        };
        const override: InputConfigT = {
          server: {tls: {ca: 'newCa'}},
        };
        const result = mergeConfig(base, override);
        expect(result.server?.tls).toStrictEqual({
          key: 'baseKey',
          cert: 'baseCert',
          ca: 'newCa',
        });
      });

      test('override tls: object with same properties overrides base values', () => {
        const base: InputConfigT = {
          server: {tls: {key: 'baseKey', cert: 'baseCert'}},
        };
        const override: InputConfigT = {
          server: {tls: {key: 'newKey', cert: 'newCert'}},
        };
        const result = mergeConfig(base, override);
        expect(result.server?.tls).toStrictEqual({
          key: 'newKey',
          cert: 'newCert',
        });
      });

      test('other server properties are preserved when tls is overridden', () => {
        const base: InputConfigT = {server: {port: 8081, tls: false}};
        const override: InputConfigT = {
          server: {tls: {key: 'key', cert: 'cert'}},
        };
        const result = mergeConfig(base, override);
        expect(result.server).toStrictEqual({
          port: 8081,
          tls: {key: 'key', cert: 'cert'},
        });
      });

      test('override tls: null replaces base tls: undefined', () => {
        const base: InputConfigT = {server: {}};
        // $FlowExpectedError[incompatible-type] - testing untyped runtime behavior
        const override: InputConfigT = {server: {tls: null}};
        const result = mergeConfig(base, override);
        expect(result.server?.tls).toBe(null);
      });
    });

    describe('override is NOT applied when tls is null or undefined', () => {
      test('override tls: undefined keeps base tls: object', () => {
        const base: InputConfigT = {server: {tls: {key: 'key', cert: 'cert'}}};
        const override: InputConfigT = {server: {}};
        const result = mergeConfig(base, override);
        expect(result.server?.tls).toStrictEqual({key: 'key', cert: 'cert'});
      });

      test('override tls: undefined (explicit) keeps base tls: object', () => {
        const base: InputConfigT = {server: {tls: {key: 'key', cert: 'cert'}}};
        // $FlowExpectedError[incompatible-type] - testing explicit undefined
        const override: InputConfigT = {server: {tls: undefined}};
        const result = mergeConfig(base, override);
        expect(result.server?.tls).toStrictEqual({key: 'key', cert: 'cert'});
      });

      test('override tls: undefined keeps base tls: false', () => {
        const base: InputConfigT = {server: {tls: false}};
        const override: InputConfigT = {server: {}};
        const result = mergeConfig(base, override);
        expect(result.server?.tls).toBe(false);
      });

      test('override tls: undefined (explicit) keeps base tls: false', () => {
        const base: InputConfigT = {server: {tls: false}};
        // $FlowExpectedError[incompatible-type] - testing untyped runtime behavior
        const override: InputConfigT = {server: {tls: undefined}};
        const result = mergeConfig(base, override);
        expect(result.server?.tls).toBe(false);
      });

      test('override tls: null keeps base tls: object', () => {
        const base: InputConfigT = {server: {tls: {key: 'key', cert: 'cert'}}};
        // $FlowExpectedError[incompatible-type] - testing untyped runtime behavior
        const override: InputConfigT = {server: {tls: null}};
        const result = mergeConfig(base, override);
        expect(result.server?.tls).toStrictEqual({key: 'key', cert: 'cert'});
      });

      test('override tls: null keeps base tls: false', () => {
        const base: InputConfigT = {server: {tls: false}};
        // $FlowExpectedError[incompatible-type] - testing untyped runtime behavior
        const override: InputConfigT = {server: {tls: null}};
        const result = mergeConfig(base, override);
        expect(result.server?.tls).toBe(false);
      });

      test('both tls undefined results in no tls property', () => {
        const base: InputConfigT = {server: {}};
        const override: InputConfigT = {server: {}};
        const result = mergeConfig(base, override);
        expect(result.server?.tls).toBeUndefined();
      });

      test('both tls undefined (explicit) results in no tls property', () => {
        // $FlowExpectedError[incompatible-type] - testing untyped runtime behavior
        const base: InputConfigT = {server: {tls: undefined}};
        // $FlowExpectedError[incompatible-type] - testing untyped runtime behavior
        const override: InputConfigT = {server: {tls: undefined}};
        const result = mergeConfig(base, override);
        expect(result.server?.tls).toBeUndefined();
      });
    });
  });
});
