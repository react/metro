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

import type {Socket} from 'node:net';
import type {Writable} from 'node:stream';

import throttle from 'lodash.throttle';
import readline from 'node:readline';
import tty from 'node:tty';
import util from 'node:util';

const {promisify} = util;

type UnderlyingStream = Socket | Writable;

// use "readline/promises" instead when not experimental anymore
const moveCursor = promisify(readline.moveCursor);
const clearScreenDown = promisify(readline.clearScreenDown);
const streamWrite = promisify(
  (
    stream: UnderlyingStream,
    chunk: Buffer | Uint8Array | string,
    callback?: (data: any) => void,
  ) => {
    return stream.write(chunk, callback);
  },
);

/**
 * Cut a string into an array of string of the specific maximum size. A newline
 * ends a chunk immediately (it's not included in the "." RexExp operator), and
 * is not included in the result.
 * When counting we should ignore non-printable characters. In particular the
 * ANSI escape sequences (regex: /\x1B\[([0-9]{1,2}(;[0-9]{1,2})?)?m/)
 * (Not an exhaustive match, intended to match ANSI color escapes)
 * https://en.wikipedia.org/wiki/ANSI_escape_code
 */
function chunkString(str: string, size: number): Array<string> {
  const ANSI_COLOR = '\x1B\\[([0-9]{1,2}(;[0-9]{1,2})?)?m';
  const SKIP_ANSI = `(?:${ANSI_COLOR})*`;
  return str.match(new RegExp(`(?:${SKIP_ANSI}.){1,${size}}`, 'g')) || [];
}

/**
 * Get the stream as a TTY if it effectively looks like a valid TTY.
 */
function getTTYStream(stream: UnderlyingStream): ?tty.WriteStream {
  if (
    stream instanceof tty.WriteStream &&
    stream.isTTY &&
    stream.columns >= 1
  ) {
    return stream;
  }
  return null;
}

/**
 * We don't just print things to the console, sometimes we also want to show
 * and update progress. This utility just ensures the output stays neat: no
 * missing newlines, no mangled log lines.
 *
 *     const terminal = Terminal.default;
 *     terminal.status('Updating... 38%');
 *     terminal.log('warning: Something happened.');
 *     terminal.status('Updating, done.');
 *     terminal.persistStatus();
 *
 * The final output:
 *
 *     warning: Something happened.
 *     Updating, done.
 *
 * Without the status feature, we may get a mangled output:
 *
 *     Updating... 38%warning: Something happened.
 *     Updating, done.
 *
 * This is meant to be user-readable and TTY-oriented. We use stdout by default
 * because it's more about status information than diagnostics/errors (stderr).
 *
 * Do not add any higher-level functionality in this class such as "warning" and
 * "error" printers, as it is not meant for formatting/reporting. It has the
 * single responsibility of handling status messages.
 */
export default class Terminal {
  #logLines: Array<string>;
  #nextStatusStr: string;
  #statusStr: string;
  #stream: UnderlyingStream;
  #ttyStream: ?tty.WriteStream;
  #updatePromise: Promise<void> | null;
  #isUpdating: boolean;
  #isPendingUpdate: boolean;
  #shouldFlush: boolean;
  #writeStatusThrottled: string => void;

  constructor(stream: UnderlyingStream, opts: {ttyPrint?: boolean} = {}) {
    this.#logLines = [];
    this.#nextStatusStr = '';
    this.#statusStr = '';
    this.#stream = stream;
    this.#ttyStream = (opts.ttyPrint ?? true) ? getTTYStream(stream) : null;
    this.#updatePromise = null;
    this.#isUpdating = false;
    this.#isPendingUpdate = false;
    this.#shouldFlush = false;
    this.#writeStatusThrottled = throttle(
      status => this.#stream.write(status),
      3500,
    );
  }

  /**
   * Schedule an update of the status and log lines.
   * If there's an ongoing update, schedule another one after the current one.
   * If there are two updates scheduled, do nothing, as the second update will
   * take care of the latest status and log lines.
   */
  #scheduleUpdate() {
    if (this.#isUpdating) {
      this.#isPendingUpdate = true;
      return;
    }

    this.#isUpdating = true;
    this.#updatePromise = this.#update().then(async () => {
      while (this.#isPendingUpdate) {
        if (!this.#shouldFlush) {
          await new Promise(resolve => setTimeout(resolve, 33));
        }
        this.#isPendingUpdate = false;
        await this.#update();
      }
      this.#isUpdating = false;
      this.#shouldFlush = false;
    });
  }

  async waitForUpdates(): Promise<void> {
    await (this.#updatePromise || Promise.resolve());
  }

  /**
   * Useful for calling console/stdout directly after terminal logs
   * Otherwise, you could end up with mangled output when the queued
   * update starts writing to stream after a delay.
   */
  async flush(): Promise<void> {
    if (this.#isUpdating) {
      this.#shouldFlush = true;
    }
    await this.waitForUpdates();
    // $FlowFixMe[prop-missing]
    this.#writeStatusThrottled.flush();
  }

  /**
   * Clear and write the new status, logging in bulk in-between. Doing this in a
   * throttled way (in a different tick than the calls to `log()` and
   * `status()`) prevents us from repeatedly rewriting the status in case
   * `terminal.log()` is called several times.
   */
  async #update(): Promise<void> {
    const ttyStream = this.#ttyStream;

    const nextStatusStr = this.#nextStatusStr;
    const statusStr = this.#statusStr;
    const logLines = this.#logLines;

    // reset these here to not have them changed while updating
    this.#statusStr = nextStatusStr;
    this.#logLines = [];

    if (statusStr === nextStatusStr && logLines.length === 0) {
      return;
    }

    if (ttyStream && statusStr.length > 0) {
      const statusLinesCount = statusStr.split('\n').length - 1;
      // extra -1 because we print the status with a trailing new line
      await moveCursor(ttyStream, -ttyStream.columns, -statusLinesCount - 1);
      await clearScreenDown(ttyStream);
    }

    if (logLines.length > 0) {
      await streamWrite(this.#stream, logLines.join('\n') + '\n');
    }

    if (ttyStream) {
      if (nextStatusStr.length > 0) {
        await streamWrite(this.#stream, nextStatusStr + '\n');
      }
    } else {
      this.#writeStatusThrottled(
        nextStatusStr.length > 0 ? nextStatusStr + '\n' : '',
      );
    }
  }

  /**
   * Shows some text that is meant to be overriden later. Return the previous
   * status that was shown and is no more. Calling `status()` with no argument
   * removes the status altogether. The status is never shown in a
   * non-interactive terminal: for example, if the output is redirected to a
   * file, then we don't care too much about having a progress bar.
   */
  status(format: string, ...args: Array<unknown>): string {
    const nextStatusStr = this.#nextStatusStr;

    const statusStr = util.format(format, ...args);
    this.#nextStatusStr = this.#ttyStream
      ? chunkString(statusStr, this.#ttyStream.columns).join('\n')
      : statusStr;

    this.#scheduleUpdate();

    return nextStatusStr;
  }

  /**
   * Similar to `console.log`, except it moves the status/progress text out of
   * the way correctly. In non-interactive terminals this is the same as
   * `console.log`.
   */
  log(format: string, ...args: Array<unknown>): void {
    const line = util.format(format, ...args);

    if (this.#ttyStream) {
      this.#logLines.push(line);
    } else {
      void streamWrite(this.#stream, line + '\n');
    }

    this.#scheduleUpdate();
  }

  /**
   * Log the current status and start from scratch. This is useful if the last
   * status was the last one of a series of updates.
   */
  persistStatus(): void {
    this.log(this.#nextStatusStr);
    this.#nextStatusStr = '';
  }
}
