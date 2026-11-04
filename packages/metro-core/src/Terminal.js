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

import {clearTimeout, setTimeout} from 'node:timers';
import tty from 'node:tty';
import util from 'node:util';

type UnderlyingStream = Socket | Writable;

const STATUS_UPDATE_DELAY_MS = 33;
const NON_TTY_STATUS_UPDATE_DELAY_MS = 3500;
const EXTERNAL_WRITES_QUIET_MS = 333;

/**
 * Cut a string into an array of strings of the specified maximum size. A newline
 * ends a chunk immediately (it's not included in the "." RegExp operator), and
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
  #status: string;
  #writtenStatus: string;
  #stream: UnderlyingStream;
  #ttyStream: ?tty.WriteStream;
  #updatePromise: Promise<void> | null;
  #lastWritePromise: Promise<void>;
  #isFlushRequested: boolean;
  #statusDelay: {promise: Promise<void>, endEarly: () => void} | null;
  #bytesWrittenAfterLastWrite: number;
  #flushBeforeExit: () => void;

  constructor(stream: UnderlyingStream, opts: {ttyPrint?: boolean} = {}) {
    this.#status = '';
    this.#writtenStatus = '';
    this.#stream = stream;
    this.#ttyStream = (opts.ttyPrint ?? true) ? getTTYStream(stream) : null;
    this.#updatePromise = null;
    this.#lastWritePromise = Promise.resolve();
    this.#isFlushRequested = false;
    this.#statusDelay = null;
    this.#bytesWrittenAfterLastWrite = this.#getBytesWritten();
    this.#flushBeforeExit = () => {
      void this.flush();
    };
  }

  /**
   * Starts an update of the status, unless one is ongoing. An update keeps
   * writing the status until the latest one is written. Status delays don't
   * keep the process alive, so an ongoing update is flushed before the process
   * exits.
   */
  #scheduleStatusUpdate() {
    if (this.#updatePromise != null) {
      return;
    }

    process.on('beforeExit', this.#flushBeforeExit);
    this.#updatePromise = this.#writeStatus().then(async () => {
      while (this.#writtenStatus !== this.#status) {
        await this.#writeStatus();
      }
      process.off('beforeExit', this.#flushBeforeExit);
      this.#updatePromise = null;
      this.#isFlushRequested = false;
    });
  }

  /**
   * Makes status writes wait `ms`, or until `#statusDelay.endEarly()` is called.
   * Returns the delay's promise.
   */
  #delayStatus(ms: number): Promise<void> {
    if (this.#isFlushRequested) {
      return Promise.resolve();
    }
    const {promise, resolve} = Promise.withResolvers<void>();
    const endEarly = () => {
      clearTimeout(timeout);
      this.#statusDelay = null;
      resolve();
    };
    const timeout = setTimeout(endEarly, ms).unref();
    this.#statusDelay = {promise, endEarly};
    return promise;
  }

  async waitForUpdates(): Promise<void> {
    await (this.#updatePromise || Promise.resolve());
    await this.#lastWritePromise;
  }

  /**
   * Writes the pending status without waiting for the status delay, and
   * resolves once all writes are done. Useful before writing to the stream
   * directly or exiting, so the latest status shows before that output.
   */
  async flush(): Promise<void> {
    if (this.#updatePromise != null) {
      this.#isFlushRequested = true;
      this.#statusDelay?.endEarly();
    }
    await this.waitForUpdates();
  }

  /**
   * Writes to the stream, tracking the write's completion and the bytes written
   * after it. Writes to a stream complete in order, so the last write's
   * completion covers all of them.
   */
  #write(chunk: string): void {
    this.#lastWritePromise = new Promise(resolve =>
      this.#stream.write(chunk, () => resolve()),
    );
    this.#bytesWrittenAfterLastWrite = this.#getBytesWritten();
  }

  /**
   * Issues the update's writes without awaiting in between, so no other output
   * can land in the middle of an update. Resolves when the writes are done.
   */
  async #writeStatus(): Promise<void> {
    if (this.#writtenStatus === this.#status) {
      return;
    }

    if (this.#statusDelay != null) {
      await this.#statusDelay.promise;
    }
    const externalWritesStop = this.#waitForExternalWritesToStop();
    if (externalWritesStop != null) {
      await externalWritesStop;
    }
    this.#eraseWrittenStatusMaybe();
    const status = this.#status;
    if (status.length > 0) {
      this.#write(status + '\n');
    }
    this.#writtenStatus = status;
    void this.#delayStatus(
      this.#ttyStream ? STATUS_UPDATE_DELAY_MS : NON_TTY_STATUS_UPDATE_DELAY_MS,
    );
    await this.#lastWritePromise;
  }

  /**
   * Waits until no output is written outside of Terminal for
   * EXTERNAL_WRITES_QUIET_MS, so the status isn't written in the middle of a
   * burst of such output. Returns nothing without such output, so the status
   * can be written synchronously.
   */
  #waitForExternalWritesToStop(
    bytesWritten: number = this.#bytesWrittenAfterLastWrite,
  ): Promise<void> | void {
    const currentBytesWritten = this.#getBytesWritten();
    if (this.#isFlushRequested || currentBytesWritten === bytesWritten) {
      return undefined;
    }

    return this.#delayStatus(EXTERNAL_WRITES_QUIET_MS).then(() =>
      this.#waitForExternalWritesToStop(currentBytesWritten),
    );
  }

  /**
   * Bytes written by the stream and, when it is stdout or stderr, by both, as
   * they usually share the terminal (e.g. `console.error()`). 0 when the stream
   * doesn't count them.
   */
  #getBytesWritten(): number {
    const stream = this.#stream;
    if (stream !== process.stdout && stream !== process.stderr) {
      // $FlowFixMe[prop-missing] `bytesWritten` is missing on generic streams
      return stream.bytesWritten ?? 0;
    }

    return (
      // $FlowFixMe[prop-missing] `bytesWritten` is missing when redirected to a file
      (process.stdout.bytesWritten ?? 0) + (process.stderr.bytesWritten ?? 0)
    );
  }

  /**
   * Erases the written status from the screen, unless it can't be reliably
   * erased, in which case it is left to drift with the scrollbar. In
   * non-interactive terminals, the written status stays.
   */
  #eraseWrittenStatusMaybe(): void {
    if (!this.#ttyStream) {
      return;
    }

    const writtenStatus = this.#writtenStatus;
    this.#writtenStatus = '';

    if (
      writtenStatus.length === 0 ||
      // If output printed outside of Terminal (like direct console.log) is
      // detected, the status can't be erased without erasing that output too.
      // Detection compares bytes written, as the number of lines printed can't
      // be known without overriding the stdout/stderr globals
      this.#getBytesWritten() !== this.#bytesWrittenAfterLastWrite
    ) {
      return;
    }

    const statusLinesCount = writtenStatus.split('\n').length;
    // Moves to the start of the line, up over the status lines, and clears below
    this.#write(`\r\x1B[${statusLinesCount}A\x1B[J`);
  }

  /**
   * Shows some text that is meant to be overridden later. Return the previous
   * status that was shown and is no more. Calling `status()` with no argument
   * removes the status altogether. In a non-interactive terminal, for example
   * if the output is redirected to a file, the status is written as lines, at
   * most every NON_TTY_STATUS_UPDATE_DELAY_MS.
   */
  status(format: string, ...args: Array<unknown>): string {
    const previousStatus = this.#status;

    const status = util.format(format, ...args);
    this.#status = this.#ttyStream
      ? chunkString(status, this.#ttyStream.columns).join('\n')
      : status;

    this.#scheduleStatusUpdate();

    return previousStatus;
  }

  /**
   * Similar to `console.log`, except it moves the status/progress text out of
   * the way correctly. In non-interactive terminals this is the same as
   * `console.log`. The line is written immediately, so it keeps its order
   * relative to other output.
   */
  log(format: string, ...args: Array<unknown>): void {
    this.#eraseWrittenStatusMaybe();
    this.#write(util.format(format, ...args) + '\n');

    this.#scheduleStatusUpdate();
  }

  /**
   * Log the current status and start from scratch. This is useful if the last
   * status was the last one of a series of updates.
   */
  persistStatus(): void {
    const status = this.#status;
    this.#status = '';
    this.log(status);
  }
}
