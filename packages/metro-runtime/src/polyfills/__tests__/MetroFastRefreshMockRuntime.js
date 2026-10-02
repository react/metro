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

import type {DefineFn, RequireFn} from '../require';
import typeof {
  act as Act,
  render as Render,
  screen as Screen,
} from '@testing-library/react/pure';
import typeof * as ReactModule from 'react';
import typeof ReactRefreshRuntime from 'react-refresh/runtime';

import {transformSync} from '@babel/core';
import fs from 'node:fs';

type RuntimeGlobal = Object;

const runtimeCleanups: Set<() => void> = new Set();

export function cleanupRuntimes(): void {
  runtimeCleanups.forEach(cleanup => {
    cleanup();
  });
  runtimeCleanups.clear();
}

/**
 * A runtime that combines Metro's module system, a React renderer
 * (@testing-library/react over react-dom) and Fast Refresh.
 *
 * The runtime has its own global object and dedicated instances of the relevant
 * Metro/React modules, but otherwise runs in the enclosing JS context without
 * any true isolation.
 */
export class Runtime {
  // Metro APIs (see require.js)

  /**
   * Adds a module implementation to the module registry.
   */
  define: DefineFn;

  /**
   * Evaluates a given module (if not already evaluated) and returns its exports
   * object.
   */
  metroRequire: RequireFn;

  /**
   * Registers a lazy segment module definer (see require.js
   * `__registerSegment`). Used to model bundles that define modules lazily,
   * such as the Buck "plain bundle with switch" output.
   */
  registerSegment: (
    segmentId: number,
    moduleDefiner: (moduleId: number) => void,
    moduleIds?: ?ReadonlyArray<number>,
  ) => void;

  // Special modules

  /**
   * The instance of React running in this runtime. Conceptually equivalent to
   * require('react').
   */
  React: ReactModule;

  /**
   * Testing Library render bound to this runtime's renderer instance.
   * Conceptually equivalent to require('@testing-library/react/pure').render.
   */
  render: Render;

  /**
   * Testing Library screen bound to this runtime's renderer instance.
   * Conceptually equivalent to require('@testing-library/react/pure').screen.
   */
  screen: Screen;

  /**
   * Jest mock functions used as event handlers.
   */
  events: {
    onFullReload: JestMockFn<[string], void>,
    onFastRefresh: JestMockFn<[], void>,
  } = {
    /**
     * Called when there is a full reload, with a reason argument.
     */
    onFullReload: jest.fn(),

    /**
     * Called when Fast Refresh has occurred.
     */
    onFastRefresh: jest.fn(),
  };

  // $FlowFixMe[value-as-type]: react-refresh/runtime is untyped
  #reactRefreshRuntime: ReactRefreshRuntime;
  #act: Act;
  #global: RuntimeGlobal = {};
  #globalPrefix: string = '';

  constructor() {
    // Set up the module system and expose relevant APIs.
    // See comment above this function's declaration.
    createModuleSystem(
      this.#global,
      /* __DEV__ */ true,
      this.#globalPrefix,
      /* window */ undefined,
    );
    this.define = this.#global[this.#globalPrefix + '__d'];
    this.metroRequire = this.#global[this.#globalPrefix + '__r'];
    this.registerSegment = this.#global.__registerSegment;

    // Set up Fast Refresh. Adapted from `setUpReactRefresh.js` in React Native.
    jest.isolateModules(() => {
      // Configure the act environment for React 19
      global.IS_REACT_ACT_ENVIRONMENT = true;
      this.React = require('react');

      this.#reactRefreshRuntime = require('react-refresh/runtime');
      this.#reactRefreshRuntime.injectIntoGlobalHook(this.#global);

      // Associate the renderer instance with this runtime's global object.
      // NOTE: Strictly speaking, this is an implementation detail of React.
      global.__REACT_DEVTOOLS_GLOBAL_HOOK__ =
        this.#global.__REACT_DEVTOOLS_GLOBAL_HOOK__;
      // Loaded while the hook is aliased so the renderer binds to this runtime.
      // The pure entry point skips auto-cleanup; tests call cleanupRuntimes().
      require('react-dom/client');
      const testingLibrary = require('@testing-library/react/pure');
      this.render = testingLibrary.render;
      this.screen = testingLibrary.screen;
      this.#act = testingLibrary.act;
      runtimeCleanups.add(testingLibrary.cleanup);
      delete global.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    });

    // Inject Fast Refresh APIs called by Metro.
    this.#global[this.#globalPrefix + '__ReactRefresh'] = {
      performFullRefresh: (reason: string) => {
        this.events.onFullReload(reason);
      },

      createSignatureFunctionForTransform:
        this.#reactRefreshRuntime.createSignatureFunctionForTransform,

      isLikelyComponentType: this.#reactRefreshRuntime.isLikelyComponentType,

      getFamilyByType: this.#reactRefreshRuntime.getFamilyByType,

      register: this.#reactRefreshRuntime.register,

      performReactRefresh: () => {
        if (this.#reactRefreshRuntime.hasUnrecoverableErrors()) {
          this.events.onFullReload('Fast Refresh - Unrecoverable');
          return;
        }
        this.#act(() => {
          this.#reactRefreshRuntime.performReactRefresh();
        });
        this.events.onFastRefresh();
      },
    };
  }
}

const moduleSystemCode = (() => {
  const rawCode = fs.readFileSync(require.resolve('../require'), 'utf8');
  return transformSync(rawCode, {
    ast: false,
    babelrc: false,
    cwd: '/',
    filename: 'test.js',
    presets: [require.resolve('@react-native/babel-preset')],
    retainLines: true,
    sourceMaps: 'inline',
    sourceType: 'module',
  }).code;
})();

// Evaluates the transformed require.js with its free variables bound to the
// arguments, installing Metro's module system (`__d`, `__r`,
// `__registerSegment`, ...) on the given global object.
// React Native has no `window` object, but jsdom does, so `window` is bound
// to undefined to simulate React Native. Otherwise require.js'
// `performFullRefresh` would call jsdom's `window.location.reload()`
// instead of `__ReactRefresh.performFullRefresh`.
const createModuleSystem: (
  this: any,
  RuntimeGlobal,
  boolean,
  string,
  void,
) => unknown =
  // eslint-disable-next-line no-new-func
  new Function(
    'global',
    '__DEV__',
    '__METRO_GLOBAL_PREFIX__',
    'window',
    moduleSystemCode,
  );
