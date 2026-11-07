/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

/* eslint-disable no-console */

'use strict';

let log;

beforeEach(() => {
  jest.resetModules();
  log = require('../logToConsole').default;

  console.log = jest.fn();
});

test('invoke native console methods', () => {
  log(console, 'log', 'Banana');
  log(console, 'warn', 'Apple');
  log(console, 'warn', 'Kiwi');
  jest.runAllTimers();

  expect(console.log).toHaveBeenNthCalledWith(
    1,
    expect.stringContaining(' LOG '),
    'Banana',
  );
  expect(console.log).toHaveBeenNthCalledWith(
    2,
    expect.stringContaining(' WARN '),
    'Apple',
  );
  expect(console.log).toHaveBeenNthCalledWith(
    3,
    expect.stringContaining(' WARN '),
    'Kiwi',
  );
});

test('removes excess whitespace', () => {
  log(console, 'log', 'Banana\n   ');
  jest.runAllTimers();

  expect(console.log).toHaveBeenNthCalledWith(
    1,
    expect.stringContaining(' LOG '),
    'Banana',
  );
});

test('ignore `groupCollapsed` calls', () => {
  log(console, 'groupCollapsed');
  log(console, 'groupEnd');
  jest.runAllTimers();

  expect(console.log).not.toHaveBeenCalled();
});

test('warn if `groupCollapsed` and `groupEnd` are not balanced', () => {
  log(console, 'groupCollapsed');
  jest.runAllTimers();

  expect(console.log).toHaveBeenCalledWith(
    expect.stringContaining(' WARN '),
    'Expected `console.groupEnd` to be called after `console.groupCollapsed`.',
  );

  // Ensure that the console resets the state and will accept new logs
  log(console, 'warn', 'Apple');
  jest.runAllTimers();
  expect(console.log).toHaveBeenCalledWith(
    expect.stringContaining(' WARN '),
    'Apple',
  );
});

test('can deal with nested `group` and `groupCollapsed` calls', () => {
  log(console, 'groupCollapsed');
  log(console, 'group');
  log(console, 'groupCollapsed');
  log(console, 'groupEnd');
  log(console, 'groupEnd');
  log(console, 'groupEnd');
  jest.runAllTimers();

  expect(console.log).not.toHaveBeenCalled();

  log(console, 'groupCollapsed');
  log(console, 'group');
  log(console, 'groupEnd');
  log(console, 'groupCollapsed');
  log(console, 'groupEnd');
  log(console, 'groupEnd');
  jest.runAllTimers();

  expect(console.log).not.toHaveBeenCalled();

  log(console, 'group');
  log(console, 'groupCollapsed');
  log(console, 'groupEnd');
  log(console, 'groupCollapsed');
  log(console, 'groupEnd');
  log(console, 'groupEnd');
  jest.runAllTimers();

  expect(console.log).toHaveBeenCalledTimes(1);

  log(console, 'groupCollapsed');
  log(console, 'group');
  log(console, 'groupEnd');
  log(console, 'groupEnd');
  log(console, 'log', 'Banana');
  jest.runAllTimers();

  expect(console.log).toHaveBeenCalledTimes(2);
  expect(console.log).toHaveBeenCalledWith(
    expect.stringContaining(' LOG '),
    'Banana',
  );
});
