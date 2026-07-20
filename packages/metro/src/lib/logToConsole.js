/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

/* eslint-disable no-console */

import type {Terminal} from 'metro-core';
import type {BackgroundColors, ForegroundColors, Modifiers} from 'node:util';

import util from 'node:util';

const groupStack = [];
let collapsedGuardTimer;

export default (terminal: Terminal, level: string, ...data: Array<unknown>) => {
  // $FlowFixMe[invalid-computed-prop]
  const logFunction = console[level] && level !== 'trace' ? level : 'log';
  const color: ReadonlyArray<ForegroundColors | BackgroundColors | Modifiers> =
    level === 'error'
      ? ['inverse', 'red']
      : level === 'warn'
        ? ['inverse', 'yellow']
        : ['inverse', 'white'];

  if (level === 'group') {
    groupStack.push(level);
  } else if (level === 'groupCollapsed') {
    groupStack.push(level);
    clearTimeout(collapsedGuardTimer);
    // Inform users that logs get swallowed if they forget to call `groupEnd`.
    collapsedGuardTimer = setTimeout(() => {
      if (groupStack.includes('groupCollapsed')) {
        terminal.log(
          util.styleText(['inverse', 'yellow', 'bold'], ' WARN '),
          'Expected `console.groupEnd` to be called after `console.groupCollapsed`.',
        );
        groupStack.length = 0;
      }
    }, 3000);
    return;
  } else if (level === 'groupEnd') {
    groupStack.pop();
    if (!groupStack.length) {
      clearTimeout(collapsedGuardTimer);
    }
    return;
  }

  if (!groupStack.includes('groupCollapsed')) {
    // Remove excess whitespace at the end of a log message, if possible.
    const lastItem = data[data.length - 1];
    if (typeof lastItem === 'string') {
      data[data.length - 1] = lastItem.trimEnd();
    }

    terminal.log(
      util.styleText([...color, 'bold'], ` ${logFunction.toUpperCase()} `) +
        ''.padEnd(groupStack.length * 2, ' '),
      // `util.format` actually accepts any arguments.
      // If the first argument is a string, it tries to format it.
      // Otherwise, it just concatenates all arguments.
      // $FlowFixMe[incompatible-type] util.format expected the first argument to be a string
      util.format(...data),
    );
  }
};
