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

// We're explicitly using node:timers, which Jest doesn't automatically mock
// with useFakeTimers. Global timers are mocked.
jest.mock('node:timers', () => ({
  setTimeout: globalThis.setTimeout,
  clearTimeout: globalThis.clearTimeout,
}));

// Runs timers until `promise` settles.
async function settle(promise) {
  let isSettled = false;
  promise.finally(() => {
    isSettled = true;
  });
  await jest.advanceTimersByTimeAsync(0);
  while (!isSettled) {
    await jest.advanceTimersToNextTimerAsync();
  }
  return promise;
}

afterEach(() => {
  jest.clearAllTimers();
});

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
      let bytesWritten = 0;
      Object.defineProperty(stream, 'bytesWritten', {get: () => bytesWritten});
      Object.assign(stream, {
        cursor: 0,
        buffer: ' '.repeat(columns * lines).split(''),
        columns,
        lines,
        write(str, callback = () => {}) {
          bytesWritten += str.length;
          // Characters and the escape sequences Terminal uses: cursor up, and
          // clear screen down
          for (const token of str.match(/\x1B\[\d*[AJ]|[^]/g) ?? []) {
            if (token === '\n') {
              this.cursor = this.cursor - (this.cursor % columns) + columns;
            } else if (token === '\r') {
              this.cursor -= this.cursor % columns;
            } else if (token.startsWith('\x1B[') && token.endsWith('A')) {
              this.cursor -= parseInt(token.slice(2), 10) * columns;
            } else if (token.startsWith('\x1B[')) {
              this.buffer.fill(' ', this.cursor);
            } else {
              this.buffer[this.cursor] = token;
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
      await settle(terminal.waitForUpdates());
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
      await settle(terminal.waitForUpdates());
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
      await settle(terminal.waitForUpdates());
      expect(stream.buffer.join('').trim()).toEqual(
        'foo       bar       status2',
      );
      terminal.log('beep');
      terminal.status('status3');
      await settle(terminal.waitForUpdates());
      expect(stream.buffer.join('').trim()).toEqual(
        ttyPrint
          ? 'foo       bar       beep      status3'
          : 'foo       bar       status2   beep      status3',
      );
    });

    test('updates status when logging, multi-line', async () => {
      const {stream, terminal} = prepare({isTTY: true, ttyPrint});
      terminal.log('foo');
      terminal.status('status\nanother');
      terminal.log('bar');
      if (!ttyPrint) {
        expect(stream.buffer.join('').trim()).toEqual('foo       bar');
      }
      await settle(terminal.waitForUpdates());
      expect(stream.buffer.join('').trim()).toEqual(
        'foo       bar       status    another',
      );
    });

    test('keeps the status on the screen when logging', async () => {
      const {stream, terminal} = prepare({isTTY: true, ttyPrint});
      terminal.status('status');
      terminal.log('foo');
      expect(stream.buffer.join('').trim()).toEqual(
        ttyPrint ? 'foo       status' : 'status    foo',
      );
    });

    test('persists status', async () => {
      const {stream, terminal} = prepare({isTTY: true, ttyPrint});
      terminal.log('foo');
      terminal.status('status');
      terminal.persistStatus();
      terminal.log('bar');
      await settle(terminal.waitForUpdates());
      expect(stream.buffer.join('').trim()).toEqual('foo       status    bar');
    });

    test('flush- single line', async () => {
      const {stream, terminal} = prepare({isTTY: true, ttyPrint});
      terminal.log('foo');
      terminal.status('status');
      terminal.status('status2');
      terminal.log('bar');
      await settle(terminal.flush());
      expect(stream.buffer.join('').trim()).toEqual(
        'foo       bar       status2',
      );
      terminal.log('beep');
      terminal.status('status3');
      await settle(terminal.flush());
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

    test('keeps output written outside of Terminal', async () => {
      const {stream, terminal} = prepare({isTTY: true, ttyPrint});
      terminal.status('status');
      await settle(terminal.flush());
      stream.write('external\n');
      terminal.status('status2');
      await settle(terminal.flush());
      expect(stream.buffer.join('').trim()).toEqual(
        'status    external  status2',
      );
    });

    test('keeps logs in order with output written outside of Terminal', async () => {
      const {stream, terminal} = prepare({isTTY: true, ttyPrint});
      terminal.status('status');
      terminal.log('foo');
      stream.write('external\n');
      terminal.log('bar');
      await settle(terminal.flush());
      expect(stream.buffer.join('').trim()).toEqual(
        ttyPrint
          ? 'foo       status    external  bar       status'
          : 'status    foo       external  bar',
      );
    });

    test('writes the status after a burst of external writes', async () => {
      const {stream, terminal} = prepare({isTTY: true, ttyPrint});
      terminal.status('status');
      await jest.advanceTimersByTimeAsync(4000);
      for (const n of [1, 2, 3]) {
        stream.write(`ext${n}\n`);
        terminal.status(`status${n}`);
        await jest.advanceTimersByTimeAsync(100);
      }
      await jest.advanceTimersByTimeAsync(500);
      expect(stream.buffer.join('').trim()).toEqual(
        'status    ext1      ext2      ext3      status3',
      );
    });

    test('writes the status during sustained external writes', async () => {
      const {stream, terminal} = prepare({isTTY: true, ttyPrint});
      stream.write('ext\n');
      terminal.status('status');
      for (let i = 0; i < 12; i++) {
        await jest.advanceTimersByTimeAsync(200);
        stream.write('ext\n');
      }
      expect(stream.buffer.join('')).toContain('status');
    });

    test("doesn't count Terminal's own logs as external writes", async () => {
      const {stream, terminal} = prepare({isTTY: true, ttyPrint});
      stream.write('ext\n');
      terminal.status('status');
      for (let i = 0; i < 6; i++) {
        await jest.advanceTimersByTimeAsync(100);
        terminal.log('log');
      }
      expect(stream.buffer.join('')).toContain('status');
    });

    test('flush does not wait for the next status update', async () => {
      const {stream, terminal} = prepare({isTTY: true, ttyPrint});
      terminal.status('status');
      await jest.advanceTimersByTimeAsync(50);
      terminal.status('status2');
      const start = Date.now();
      await settle(terminal.flush());
      expect(Date.now() - start).toBeLessThan(100);
      expect(stream.buffer.join('').trim()).toEqual(
        ttyPrint ? 'status2' : 'status    status2',
      );
    });

    test('flushes the pending status before the process exits', async () => {
      const beforeExitListenerCount = process.listenerCount('beforeExit');
      const {stream, terminal} = prepare({isTTY: true, ttyPrint});
      terminal.status('status');
      terminal.status('status2');
      process.emit('beforeExit', 0);
      const start = Date.now();
      await settle(terminal.waitForUpdates());
      expect(Date.now() - start).toBeLessThan(100);
      expect(stream.buffer.join('').trim()).toEqual(
        ttyPrint ? 'status2' : 'status    status2',
      );
      expect(process.listenerCount('beforeExit')).toBe(beforeExitListenerCount);
    });

    test('prints consecutive logs before later external output', async () => {
      const {stream, terminal} = prepare({isTTY: true, ttyPrint});
      terminal.log('foo');
      terminal.log('bar');
      stream.write('external\n');
      await settle(terminal.flush());
      expect(stream.buffer.join('').trim()).toEqual(
        'foo       bar       external',
      );
    });

    test('persistStatus does not leave the status drawn', async () => {
      const {stream, terminal} = prepare({isTTY: true, ttyPrint});
      terminal.status('status');
      await settle(terminal.flush());
      terminal.persistStatus();
      await settle(terminal.flush());
      expect(stream.buffer.join('').trim()).toEqual(
        ttyPrint ? 'status' : 'status    status',
      );
    });

    test.each(['flush', 'waitForUpdates'])(
      '%s waits for log writes to complete',
      async method => {
        const {stream, terminal} = prepare({isTTY: true, ttyPrint});
        const write = stream.write;
        let pendingWrites = 0;
        stream.write = (str, callback = () => {}) => {
          ++pendingWrites;
          write.call(stream, str, () => {
            --pendingWrites;
            callback();
          });
        };
        terminal.log('foo');
        await settle(terminal[method]());
        expect(pendingWrites).toBe(0);
      },
    );

    test('flush- multi-line', async () => {
      const {stream, terminal} = prepare({isTTY: true, ttyPrint});
      terminal.log('foo');
      terminal.status('status\nanother');
      terminal.log('bar');
      await settle(terminal.flush());
      expect(stream.buffer.join('').trim()).toEqual(
        'foo       bar       status    another',
      );
    });
  },
);

test('keeps logs in order with output written to stderr', async () => {
  const order = [];
  const makeStream = name => {
    const stream = Object.create(require('node:tty').WriteStream.prototype);
    let bytesWritten = 0;
    Object.defineProperty(stream, 'bytesWritten', {get: () => bytesWritten});
    Object.assign(stream, {
      columns: 10,
      write(str, callback = () => {}) {
        order.push(name + ':' + str);
        bytesWritten += str.length;
        setTimeout(callback, 33);
      },
    });
    return stream;
  };
  const stdout = makeStream('stdout');
  const stderr = makeStream('stderr');
  const terminal = new Terminal(stdout);
  terminal.log('foo');
  terminal.log('bar');
  stderr.write('external\n');
  await settle(terminal.flush());
  expect(order).toEqual(['stdout:foo\n', 'stdout:bar\n', 'stderr:external\n']);
});
