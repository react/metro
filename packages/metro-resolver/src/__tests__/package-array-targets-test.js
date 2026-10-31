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

import * as Resolver from '../index';
import {createResolutionContext, posixToSystemPath as p} from './utils';

describe.each(['exports root', 'exports subpath', 'imports'])(
  '%s arrays',
  kind => {
    function resolve(target: unknown, otherMappings: {[string]: unknown} = {}) {
      const logWarning = jest.fn();
      const isImports = kind === 'imports';
      const packageJson = isImports
        ? {imports: {...otherMappings, '#entry': target}}
        : {
            exports:
              kind === 'exports root'
                ? target
                : {...otherMappings, './entry': target},
          };
      const context = {
        ...createResolutionContext({
          [p('/root/node_modules/test-pkg/package.json')]:
            JSON.stringify(packageJson),
          [p('/root/node_modules/test-pkg/selected.js')]: '',
          [p('/root/node_modules/test-pkg/other.js')]: '',
          [p('/root/src/main.js')]: '',
        }),
        originModulePath: p(
          isImports
            ? '/root/node_modules/test-pkg/main.js'
            : '/root/src/main.js',
        ),
        unstable_enablePackageExports: true,
        unstable_conditionNames: [],
        unstable_logWarning: logWarning,
      };
      const specifier = isImports
        ? '#entry'
        : kind === 'exports root'
          ? 'test-pkg'
          : 'test-pkg/entry';
      return {
        run: () => Resolver.resolve(context, specifier, null),
        logWarning,
      };
    }

    test.each([
      ['unmatched condition', [{browser: './other.js'}, './selected.js']],
      ['empty condition object', [{}, './selected.js']],
      ['matching condition', [{require: './selected.js'}, './other.js']],
      ['null target', [null, './selected.js']],
      ['empty array', [[], './selected.js']],
      ['nested array', [[{browser: './other.js'}], ['./selected.js']]],
      ['invalid string', ['../invalid.js', './selected.js']],
      ['invalid number', [42, './selected.js']],
      ['invalid boolean', [false, './selected.js']],
      ['invalid nested target', [{require: 42}, './selected.js']],
      [
        'unmatched array in a condition',
        {require: [{browser: './other.js'}], default: './selected.js'},
      ],
      [
        'null condition within an array',
        [{require: null, default: './other.js'}, './selected.js'],
      ],
      ['first valid target', ['./selected.js', './other.js']],
    ])('selects the first resolved target after %s', (_, target) => {
      const {run, logWarning} = resolve(target);
      expect(run()).toEqual({
        type: 'sourceFile',
        filePath: p('/root/node_modules/test-pkg/selected.js'),
      });
      expect(logWarning).not.toHaveBeenCalled();
    });

    test.each([
      ['empty array', []],
      ['null followed by unmatched condition', [null, {browser: './other.js'}]],
      ['invalid followed by null', [42, null]],
      ['nested empty array', [[]]],
    ])('does not continue parent conditions after %s', (_, target) => {
      const {run, logWarning} = resolve({
        require: target,
        default: './selected.js',
      });
      expect(run).toThrow();
      expect(logWarning).toHaveBeenCalledTimes(1);
      expect(logWarning.mock.calls[0][0]).toContain('no match was resolved');
    });

    test.each([
      ['only invalid targets', [false, 42]],
      ['null followed by invalid target', [null, 42]],
    ])('reports the final invalid target for %s', (_, target) => {
      const {run, logWarning} = resolve(target);
      expect(run).toThrow();
      expect(logWarning).toHaveBeenCalledTimes(1);
      expect(logWarning.mock.calls[0][0]).toContain(
        'invalid package.json configuration',
      );
    });

    test('does not try later targets when the first valid path is missing', () => {
      const {run, logWarning} = resolve(['./missing.js', './selected.js']);
      expect(run).toThrow();
      expect(logWarning).toHaveBeenCalledTimes(1);
      expect(logWarning.mock.calls[0][0]).toContain('this file does not exist');
    });

    if (kind !== 'imports') {
      test.each(['./../invalid.js', './node_modules/invalid.js', './a//b.js'])(
        'skips invalid export path %s before selecting a fallback',
        invalidTarget => {
          const {run, logWarning} = resolve([invalidTarget, './selected.js']);
          expect(run()).toEqual({
            type: 'sourceFile',
            filePath: p('/root/node_modules/test-pkg/selected.js'),
          });
          expect(logWarning).not.toHaveBeenCalled();
        },
      );
    }

    if (kind !== 'exports root') {
      test('does not resolve an unrelated mapping', () => {
        const {run, logWarning} = resolve(['./selected.js'], {
          [kind === 'imports' ? '#other' : './other']: [false],
        });
        expect(run()).toEqual({
          type: 'sourceFile',
          filePath: p('/root/node_modules/test-pkg/selected.js'),
        });
        expect(logWarning).not.toHaveBeenCalled();
      });
    }
  },
);
