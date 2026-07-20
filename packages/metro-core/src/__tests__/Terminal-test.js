/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

'use strict';

const Terminal = require('../Terminal').default;

jest.useRealTimers();

jest.mock('node:readline', () => ({
  moveCursor: (stream, dx, dy, callback = () => {}) => {
    const {cursor, columns} = stream;
    stream.cursor =
      Math.max(cursor - (cursor % columns), cursor + dx) + dy * columns;
    setTimeout(callback, 33);
  },
  clearLine: (stream, dir, callback = () => {}) => {
    if (dir !== 0) {
      throw new Error('unsupported');
    }
    const {cursor, columns} = stream;
    const curLine = cursor - (cursor % columns);
    const nextLine = curLine + columns;
    for (var i = curLine; i < nextLine; ++i) {
      stream.buffer[i] = ' ';
    }
    setTimeout(callback, 33);
  },
  clearScreenDown: (stream, callback = () => {}) => {
    const {cursor, columns, lines} = stream;
    const curLine = cursor - (cursor % columns);
    for (var i = curLine; i < columns * lines; ++i) {
      stream.buffer[i] = ' ';
    }
    setTimeout(callback, 33);
  },
}));

describe.each([false, true])(
  'Terminal, TTY print allowed: %s',
  (ttyPrint: boolean) => {
    function prepare({isTTY, ttyPrint}) {
      const lines = 10;
      const columns = 10;
      const stream = Object.create(
        isTTY
          ? require('node:tty').WriteStream.prototype
          : require('node:net').Socket,
      );
      Object.assign(stream, {
        cursor: 0,
        buffer: ' '.repeat(columns * lines).split(''),
        columns,
        lines,
        write(str, callback = () => {}) {
          for (let i = 0; i < str.length; ++i) {
            if (str[i] === '\n') {
              this.cursor = this.cursor - (this.cursor % columns) + columns;
            } else {
              this.buffer[this.cursor] = str[i];
              ++this.cursor;
            }
          }
          setTimeout(callback, 33);
        },
      });
      const terminal = new Terminal(stream, {ttyPrint});
      return {stream, terminal};
    }

    test('is not printing older consecutive status to non-interactive terminal', async () => {
      const {stream, terminal} = prepare({
        isTTY: false,
        ttyPrint,
      });
      terminal.log('foo %s', 'smth');
      terminal.status('status');
      terminal.status('status2');
      terminal.log('bar');
      expect(stream.buffer.join('').trim()).toEqual('foo smth  bar');
      await terminal.waitForUpdates();
      expect(stream.buffer.join('').trim()).toEqual(
        'foo smth  bar       status2',
      );
    });

    test('print status', async () => {
      const {stream, terminal} = prepare({isTTY: true, ttyPrint});
      terminal.log('foo');
      terminal.status('status');
      if (!ttyPrint) {
        expect(stream.buffer.join('').trim()).toEqual('foo');
      }
      await terminal.waitForUpdates();
      expect(stream.buffer.join('').trim()).toEqual('foo       status');
    });

    test('updates status when logging, single line', async () => {
      const {stream, terminal} = prepare({isTTY: true, ttyPrint});
      terminal.log('foo');
      terminal.status('status');
      terminal.status('status2');
      terminal.log('bar');
      if (!ttyPrint) {
        expect(stream.buffer.join('').trim()).toEqual('foo       bar');
      }
      await terminal.waitForUpdates();
      expect(stream.buffer.join('').trim()).toEqual(
        'foo       bar       status2',
      );
      terminal.log('beep');
      terminal.status('status3');
      await terminal.waitForUpdates();
      if (ttyPrint) {
        expect(stream.buffer.join('').trim()).toEqual(
          'foo       bar       beep      status3',
        );
      } else {
        expect(stream.buffer.join('').trim()).toEqual(
          'foo       bar       status2   beep',
        );
        await terminal.flush();
        expect(stream.buffer.join('').trim()).toEqual(
          'foo       bar       status2   beep      status3',
        );
      }
    });

    test('updates status when logging, multi-line', async () => {
      const {stream, terminal} = prepare({isTTY: true, ttyPrint});
      terminal.log('foo');
      terminal.status('status\nanother');
      terminal.log('bar');
      if (!ttyPrint) {
        expect(stream.buffer.join('').trim()).toEqual('foo       bar');
      }
      await terminal.waitForUpdates();
      expect(stream.buffer.join('').trim()).toEqual(
        'foo       bar       status    another',
      );
    });

    test('persists status', async () => {
      const {stream, terminal} = prepare({isTTY: true, ttyPrint});
      terminal.log('foo');
      terminal.status('status');
      terminal.persistStatus();
      terminal.log('bar');
      await terminal.waitForUpdates();
      expect(stream.buffer.join('').trim()).toEqual('foo       status    bar');
    });

    test('flush- single line', async () => {
      const {stream, terminal} = prepare({isTTY: true, ttyPrint});
      terminal.log('foo');
      terminal.status('status');
      terminal.status('status2');
      terminal.log('bar');
      await terminal.flush();
      expect(stream.buffer.join('').trim()).toEqual(
        'foo       bar       status2',
      );
      terminal.log('beep');
      terminal.status('status3');
      await terminal.flush();
      if (ttyPrint) {
        expect(stream.buffer.join('').trim()).toEqual(
          'foo       bar       beep      status3',
        );
      } else {
        expect(stream.buffer.join('').trim()).toEqual(
          'foo       bar       status2   beep      status3',
        );
      }
    });

    test('flush- multi-line', async () => {
      const {stream, terminal} = prepare({isTTY: true, ttyPrint});
      terminal.log('foo');
      terminal.status('status\nanother');
      terminal.log('bar');
      await terminal.flush();
      expect(stream.buffer.join('').trim()).toEqual(
        'foo       bar       status    another',
      );
    });
  },
);
