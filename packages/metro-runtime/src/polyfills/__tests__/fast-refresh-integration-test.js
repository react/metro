/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 * @oncall react_native
 * @jest-environment jsdom
 */

import {Runtime, cleanupRuntimes} from './MetroFastRefreshMockRuntime';

describe('Fast Refresh integration with require()', () => {
  afterEach(cleanupRuntimes);

  test('preserves state in a single-module bundle', () => {
    const {render, screen, define, metroRequire, React, events} = new Runtime();

    const ids = {
      'Component.js': 0,
    };

    // Define the initial version of the component
    define(
      (global, _1, _2, _3, module, _5, _6) => {
        module.exports = function Component() {
          const [state] = React.useState('initialState1');
          return 'version1: ' + state;
        };
        // Register the component like `react-refresh/babel` would.
        global.$RefreshReg$(module.exports, 'Component');
      },
      ids['Component.js'],
      undefined,
      'Component.js',
    );

    // Initial render
    const Component = metroRequire(ids['Component.js']);
    render(<Component />);
    expect(screen.getByText('version1: initialState1')).toBeDefined();

    // Edit the component
    define(
      (global, _1, _2, _3, module, _5, _6) => {
        module.exports = function Component() {
          const [state] = React.useState('initialState2');
          return 'version2: ' + state;
        };
        // Register the component like `react-refresh/babel` would.
        global.$RefreshReg$(module.exports, 'Component');
      },
      ids['Component.js'],
      undefined,
      'Component.js',
      // Inverse dependency map
      {
        [ids['Component.js']]: [],
      },
    );
    jest.runAllTimers();

    // Fast Refresh: Render the new version of the component with the old state.
    expect(screen.getByText('version2: initialState1')).toBeDefined();
    expect(events.onFastRefresh).toHaveBeenCalled();
    expect(events.onFullReload).not.toHaveBeenCalled();
  });

  test('reloads a single-module bundle when invalidated by component signatures', () => {
    const {render, screen, define, metroRequire, React, events} = new Runtime();

    const ids = {
      'Component.js': 0,
    };

    // Define the initial version of the component
    define(
      (global, _1, _2, _3, module, _5, _6) => {
        module.exports = function Component1() {
          const [state] = React.useState('initialState1');
          return 'version1: ' + state;
        };
        // Register the component like `react-refresh/babel` would.
        global.$RefreshReg$(module.exports, 'Component1');
      },
      ids['Component.js'],
      undefined,
      'Component.js',
    );

    // Initial render
    const Component = metroRequire(ids['Component.js']);
    render(<Component />);
    expect(screen.getByText('version1: initialState1')).toBeDefined();

    // Edit the component
    define(
      (global, _1, _2, _3, module, _5, _6) => {
        module.exports = function Component2() {
          const [state] = React.useState('initialState2');
          return 'version2: ' + state;
        };
        // Register the component like `react-refresh/babel` would.
        global.$RefreshReg$(module.exports, 'Component2');
      },
      ids['Component.js'],
      undefined,
      'Component.js',
      // Inverse dependency map
      {
        [ids['Component.js']]: [],
      },
    );
    jest.runAllTimers();

    // Full refresh: The component does not rerender. Instead, we signal a
    // reload.
    expect(screen.getByText('version1: initialState1')).toBeDefined();
    expect(screen.queryByText('version2: initialState2')).toBeNull();
    expect(events.onFastRefresh).not.toHaveBeenCalled();
    expect(events.onFullReload).toHaveBeenCalled();
    expect(events.onFullReload.mock.calls).toEqual([
      ['Fast Refresh - Invalidated boundary <Component.js> <Component.js>'],
    ]);
  });

  test('handles a lazily-registered (unloaded) parent during Fast Refresh', () => {
    const {define, metroRequire, registerSegment, events} = new Runtime();

    const ids = {
      'util.js': 1,
      'UnloadedScreen.js': 2,
    };

    // A parent module that imports util.js but is never required in this
    // session. It is only reachable through a lazy segment definer, mirroring
    // the Buck "plain bundle with switch" output: it is absent from the module
    // registry until first required, whereas an eager bundle would have defined
    // it (uninitialized) at startup.
    registerSegment(0, moduleId => {
      if (moduleId === ids['UnloadedScreen.js']) {
        define(
          (global, require, _2, _3, module) => {
            require(ids['util.js']);
            module.exports = {};
          },
          ids['UnloadedScreen.js'],
          {0: ids['util.js']},
          'UnloadedScreen.js',
        );
      }
    });

    // util.js is a plain (non-component) module, loaded directly.
    define(
      (global, _1, _2, _3, module) => {
        module.exports = {value: 'v1'};
      },
      ids['util.js'],
      undefined,
      'util.js',
    );
    expect(metroRequire(ids['util.js'])).toEqual({value: 'v1'});

    // Edit util.js. Its inverse dependencies include UnloadedScreen.js, which
    // has never been required and so is absent from the registry. Before
    // materialising it on demand, the Fast Refresh dependency walk would throw
    // "[Refresh] Expected to find the updated module."
    expect(() => {
      define(
        (global, _1, _2, _3, module) => {
          module.exports = {value: 'v2'};
        },
        ids['util.js'],
        {},
        'util.js',
        // Inverse dependency map
        {
          [ids['util.js']]: [ids['UnloadedScreen.js']],
          [ids['UnloadedScreen.js']]: [],
        },
      );
      jest.runAllTimers();
    }).not.toThrow();

    // Matches the behaviour of an eager bundle: no boundary is found up the
    // chain of the (now materialised, uninitialized) unloaded parent, so we
    // fall back to a full reload rather than crashing.
    expect(events.onFullReload).toHaveBeenCalled();
    expect(events.onFastRefresh).not.toHaveBeenCalled();
  });
});
