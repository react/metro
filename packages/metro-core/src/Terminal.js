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

type UnderlyingStream = Socket | Writable;

const STATUS_UPDATE_DELAY_MS = 33;
const NON_TTY_STATUS_THROTTLE_MS = 3500;

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
 * Bytes written by `stream` and, when it is stdout or stderr, by both, as they
 * usually share the terminal (e.g. `console.error()`).
 */
function getBytesWritten(stream: tty.WriteStream): number {
  if (stream !== process.stdout && stream !== process.stderr) {
    return stream.bytesWritten;
  }

  return (
    // $FlowFixMe[prop-missing] `bytesWritten` is missing when redirected to a file
    (process.stdout.bytesWritten ?? 0) + (process.stderr.bytesWritten ?? 0)
  );
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
  #isUpdating: boolean;
  #hasPendingUpdate: boolean;
  #isFlushRequested: boolean;
  #writeNonTTYStatusThrottled: (v: string) => void;
  #bytesWrittenAfterStatus: ?number;

  constructor(stream: UnderlyingStream, opts: {ttyPrint?: boolean} = {}) {
    this.#status = '';
    this.#writtenStatus = '';
    this.#stream = stream;
    this.#ttyStream = (opts.ttyPrint ?? true) ? getTTYStream(stream) : null;
    this.#updatePromise = null;
    this.#lastWritePromise = Promise.resolve();
    this.#isUpdating = false;
    this.#hasPendingUpdate = false;
    this.#isFlushRequested = false;
    this.#writeNonTTYStatusThrottled = throttle(
      status => this.#write(status),
      NON_TTY_STATUS_THROTTLE_MS,
    );
  }

  /**
   * Schedule an update of the status.
   * If there's an ongoing update, schedule another one after the current one.
   * If there are two updates scheduled, do nothing, as the second update will
   * take care of the latest status.
   */
  #scheduleStatusUpdate() {
    if (this.#isUpdating) {
      this.#hasPendingUpdate = true;
      return;
    }

    this.#isUpdating = true;
    this.#updatePromise = this.#writeStatus().then(async () => {
      while (this.#hasPendingUpdate) {
        if (!this.#isFlushRequested) {
          await new Promise(resolve =>
            setTimeout(resolve, STATUS_UPDATE_DELAY_MS),
          );
        }
        this.#hasPendingUpdate = false;
        await this.#writeStatus();
      }
      this.#isUpdating = false;
      this.#isFlushRequested = false;
    });
  }

  async waitForUpdates(): Promise<void> {
    await (this.#updatePromise || Promise.resolve());
    await this.#lastWritePromise;
  }

  /**
   * Writes the pending status without starting another update delay, and
   * resolves once all writes are done. Useful before writing to the stream
   * directly or exiting, so the latest status shows before that output.
   */
  async flush(): Promise<void> {
    if (this.#isUpdating) {
      this.#isFlushRequested = true;
    }
    await this.waitForUpdates();
    // $FlowFixMe[prop-missing]
    this.#writeNonTTYStatusThrottled.flush();
    await this.#lastWritePromise;
  }

  /**
   * Writes to the stream, tracking the write's completion. Writes to a stream
   * complete in order, so the last write's completion covers all of them.
   */
  #write(chunk: string): void {
    this.#lastWritePromise = new Promise(resolve =>
      this.#stream.write(chunk, () => resolve()),
    );
  }

  /**
   * Issues the update's writes without awaiting in between, so no other output
   * can land in the middle of an update. Resolves when the writes are done.
   */
  async #writeStatus(): Promise<void> {
    const ttyStream = this.#ttyStream;
    const status = this.#status;

    if (this.#writtenStatus === status) {
      return;
    }

    if (!ttyStream) {
      this.#writeNonTTYStatusThrottled(status.length > 0 ? status + '\n' : '');
      this.#writtenStatus = status;
      return;
    }

    this.#discardWrittenStatus(ttyStream);
    if (status.length > 0) {
      this.#write(status + '\n');
    }
    this.#writtenStatus = status;
    this.#bytesWrittenAfterStatus = getBytesWritten(ttyStream);
    await this.#lastWritePromise;
  }

  /**
   * Discards the written status by erasing it from the screen or, when it
   * can't be reliably erased, by ignoring it and letting it drift with the
   * scrollbar.
   */
  #discardWrittenStatus(ttyStream: tty.WriteStream): void {
    const writtenStatus = this.#writtenStatus;
    this.#writtenStatus = '';

    if (
      writtenStatus.length === 0 ||
      // If output printed outside of Terminal (like direct console.log) is
      // detected, the status can't be erased without erasing that output too,
      // so it is ignored and left to drift with the scrollbar.
      // Detection compares bytes written, as the number of lines printed can't
      // be known without overriding the stdout/stderr globals
      getBytesWritten(ttyStream) !== this.#bytesWrittenAfterStatus
    ) {
      return;
    }

    const statusLinesCount = writtenStatus.split('\n').length - 1;
    // extra -1 because we print the status with a trailing new line
    readline.moveCursor(ttyStream, -ttyStream.columns, -statusLinesCount - 1);
    this.#lastWritePromise = new Promise(resolve =>
      readline.clearScreenDown(ttyStream, () => resolve()),
    );
  }

  /**
   * Shows some text that is meant to be overridden later. Return the previous
   * status that was shown and is no more. Calling `status()` with no argument
   * removes the status altogether. The status is never shown in a
   * non-interactive terminal: for example, if the output is redirected to a
   * file, then we don't care too much about having a progress bar.
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
    if (this.#ttyStream) {
      this.#discardWrittenStatus(this.#ttyStream);
    }
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
