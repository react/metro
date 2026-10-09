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

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const NULL_BYTE = 0x00;
const NULL_BYTE_BUFFER = Buffer.from([NULL_BYTE]);

export type Options = Readonly<{
  root: string,
}>;

export default class FileStore<T> {
  readonly #root: string;

  constructor(options: Options) {
    this.#root = options.root;
  }

  async get(key: Buffer): Promise<?T> {
    try {
      const data = await fs.promises.readFile(this.#getFilePath(key));

      if (data[0] === NULL_BYTE) {
        return data.slice(1) as any;
      }

      return JSON.parse(data.toString('utf8'));
    } catch (err) {
      if (err.code === 'ENOENT' || err instanceof SyntaxError) {
        return null;
      }

      throw err;
    }
  }

  async set(key: Buffer, value: T): Promise<void> {
    const filePath = this.#getFilePath(key);
    try {
      await this.#set(filePath, value);
    } catch (err) {
      if (err.code === 'ENOENT') {
        fs.mkdirSync(path.dirname(filePath), {recursive: true});
        await this.#set(filePath, value);
      } else {
        throw err;
      }
    }
  }

  async #set(filePath: string, value: T): Promise<void> {
    let content;
    if (value instanceof Buffer) {
      content = Buffer.concat([NULL_BYTE_BUFFER, value]);
    } else {
      content = JSON.stringify(value) ?? JSON.stringify(null);
    }
    // Write to a unique temporary file and rename it into place, so that a
    // concurrent reader (or writer) of the same key never sees a partially
    // written entry. Writing in place truncates the file first, and a reader
    // could then see a run of null bytes, which looks like a binary entry.
    const suffix = crypto.randomBytes(8).toString('hex');
    const tempPath = `${filePath}.${process.pid}.${suffix}.tmp`;
    try {
      await fs.promises.writeFile(tempPath, content);
      await fs.promises.rename(tempPath, filePath);
    } catch (err) {
      await fs.promises.rm(tempPath, {force: true});
      throw err;
    }
  }

  clear() {
    this.#removeDirs();
  }

  #getFilePath(key: Buffer): string {
    return path.join(
      this.#root,
      key.slice(0, 1).toString('hex'),
      key.slice(1).toString('hex'),
    );
  }

  #removeDirs() {
    for (let i = 0; i < 256; i++) {
      fs.rmSync(path.join(this.#root, ('0' + i.toString(16)).slice(-2)), {
        force: true,
        recursive: true,
      });
    }
  }
}
