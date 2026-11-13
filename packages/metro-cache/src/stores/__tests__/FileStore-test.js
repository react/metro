/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 * @oncall react_native
 */

import {memfs} from 'memfs';

class FsError extends Error {
  code: string;
  syscall: string;

  constructor(code: string, syscall: string) {
    super(code);
    this.code = code;
    this.syscall = syscall;
  }
}

describe('FileStore', () => {
  let FileStore;
  let fs;

  beforeEach(() => {
    jest
      .resetModules()
      .resetAllMocks()
      .mock('node:fs', () => memfs().fs);

    FileStore = require('../FileStore').default;
    fs = jest.requireMock('node:fs');
    jest.spyOn(fs, 'unlinkSync');
  });

  test('sets and writes into the cache', async () => {
    const fileStore = new FileStore<unknown>({root: '/root'});
    const cache = Buffer.from([0xfa, 0xce, 0xb0, 0x0c]);

    await fileStore.set(cache, {foo: 42});
    expect(await fileStore.get(cache)).toEqual({foo: 42});
    expect(fs.readFileSync('/root/fa/ceb00c', 'utf8')).toBe('{"foo":42}');
  });

  test('returns null when reading a non-existing file', async () => {
    const fileStore = new FileStore<unknown>({root: '/root'});
    const cache = Buffer.from([0xfa, 0xce, 0xb0, 0x0c]);

    expect(await fileStore.get(cache)).toEqual(null);
  });

  test('returns null when reading a empty file', async () => {
    const fileStore = new FileStore<unknown>({root: '/root'});
    const cache = Buffer.from([0xfa, 0xce, 0xb0, 0x0c]);
    jest.spyOn(fs.promises, 'readFile').mockImplementation(async () => '');
    expect(await fileStore.get(cache)).toEqual(null);
    expect(fs.promises.readFile).toHaveBeenCalledWith(expect.any(String));
  });

  test('writes into cache if folder is missing', async () => {
    const fileStore = new FileStore<unknown>({root: '/root'});
    const cache = Buffer.from([0xfa, 0xce, 0xb0, 0x0c]);
    const data = Buffer.from([0xca, 0xc4, 0xe5]);

    jest.requireMock('node:fs').rmSync('/root', {recursive: true, force: true});
    await fileStore.set(cache, data);
    expect(await fileStore.get(cache)).toEqual(data);
  });

  test.each([
    ['non-empty', Buffer.from([0xca, 0xc4, 0xe5])],
    ['empty', Buffer.alloc(0)],
    ['all-zero', Buffer.alloc(64)],
  ])('reads and writes %s binary data', async (_name, data) => {
    const fileStore = new FileStore<unknown>({root: '/root'});
    const cache = Buffer.from([0xfa, 0xce, 0xb0, 0x0c]);

    await fileStore.set(cache, data);
    expect(await fileStore.get(cache)).toEqual(data);
  });

  test('never exposes a partially written entry to a reader', async () => {
    const fileStore = new FileStore<unknown>({root: '/root'});
    const cache = Buffer.from([0xfa, 0xce, 0xb0, 0x0c]);
    const previous = {dependencies: [], output: ['previous']};
    const next = {dependencies: [], output: ['x'.repeat(4096)]};
    await fileStore.set(cache, previous);

    // Simulate a write that is only part way done: the file has been opened
    // (and truncated) and has zeros where its first half belongs. This is the
    // state a concurrent writer of the same key can leave behind between the
    // chunks of fs.promises.writeFile.
    let resumeWrite: () => void = () => {};
    let onWritePaused: () => void = () => {};
    const writePaused = new Promise<void>(resolve => {
      onWritePaused = resolve;
    });
    jest
      .spyOn(fs.promises, 'writeFile')
      .mockImplementationOnce(async (filePath, content) => {
        const bytes = Buffer.from(content);
        const half = Math.floor(bytes.length / 2);
        const handle = await fs.promises.open(filePath, 'w');
        try {
          await handle.write(Buffer.alloc(half), 0, half, 0);
          await handle.write(bytes, half, bytes.length - half, half);
          await new Promise<void>(resolve => {
            resumeWrite = resolve;
            onWritePaused();
          });
          await handle.write(bytes, 0, half, 0);
        } finally {
          await handle.close();
        }
      });

    const pendingSet = fileStore.set(cache, next);
    await writePaused;
    const duringWrite = await fileStore.get(cache);
    resumeWrite();
    await pendingSet;

    expect(duringWrite).toEqual(previous);
    expect(await fileStore.get(cache)).toEqual(next);
  });

  test('leaves no temporary files behind', async () => {
    const fileStore = new FileStore<unknown>({root: '/root'});
    const cache = Buffer.from([0xfa, 0xce, 0xb0, 0x0c]);

    await Promise.all(
      Array.from({length: 4}, (_, i) => fileStore.set(cache, {i})),
    );

    expect(fs.readdirSync('/root/fa')).toEqual(['ceb00c']);
  });

  test('removes the temporary file when a write fails', async () => {
    const fileStore = new FileStore<unknown>({root: '/root'});
    const cache = Buffer.from([0xfa, 0xce, 0xb0, 0x0c]);
    await fileStore.set(cache, {foo: 42});
    const writeError = new Error('Disk full');

    jest
      .spyOn(fs.promises, 'writeFile')
      .mockImplementationOnce(async (filePath, content) => {
        await fs.promises.appendFile(filePath, content.slice(0, 1));
        throw writeError;
      });

    await expect(fileStore.set(cache, {foo: 43})).rejects.toBe(writeError);
    expect(fs.readdirSync('/root/fa')).toEqual(['ceb00c']);
    expect(await fileStore.get(cache)).toEqual({foo: 42});
  });

  test.each([['EACCES'], ['EBUSY'], ['EPERM']])(
    'keeps the existing entry when rename fails with %s',
    async code => {
      const fileStore = new FileStore<unknown>({root: '/root'});
      const cache = Buffer.from([0xfa, 0xce, 0xb0, 0x0c]);
      await fileStore.set(cache, {foo: 42});

      jest
        .spyOn(fs.promises, 'rename')
        .mockRejectedValueOnce(new FsError(code, 'rename'));

      await expect(fileStore.set(cache, {foo: 42})).resolves.toBeUndefined();
      expect(fs.readdirSync('/root/fa')).toEqual(['ceb00c']);
      expect(await fileStore.get(cache)).toEqual({foo: 42});
    },
  );

  test('rethrows a rename conflict when there is no existing entry', async () => {
    const fileStore = new FileStore<unknown>({root: '/root'});
    const cache = Buffer.from([0xfa, 0xce, 0xb0, 0x0c]);
    const renameError = new FsError('EPERM', 'rename');

    jest.spyOn(fs.promises, 'rename').mockRejectedValueOnce(renameError);

    await expect(fileStore.set(cache, {foo: 42})).rejects.toBe(renameError);
    expect(fs.readdirSync('/root/fa')).toEqual([]);
  });

  test('rethrows a write error with the same code as a rename conflict', async () => {
    const fileStore = new FileStore<unknown>({root: '/root'});
    const cache = Buffer.from([0xfa, 0xce, 0xb0, 0x0c]);
    await fileStore.set(cache, {foo: 42});
    const writeError = new FsError('EPERM', 'open');

    jest.spyOn(fs.promises, 'writeFile').mockRejectedValueOnce(writeError);

    await expect(fileStore.set(cache, {foo: 43})).rejects.toBe(writeError);
  });

  test('rethrows the original error when cleanup also fails', async () => {
    const fileStore = new FileStore<unknown>({root: '/root'});
    const cache = Buffer.from([0xfa, 0xce, 0xb0, 0x0c]);
    await fileStore.set(cache, {foo: 42});
    const writeError = new Error('Disk full');

    jest.spyOn(fs.promises, 'writeFile').mockRejectedValueOnce(writeError);
    jest
      .spyOn(fs.promises, 'rm')
      .mockRejectedValueOnce(new Error('Cleanup failed'));

    await expect(fileStore.set(cache, {foo: 43})).rejects.toBe(writeError);
  });

  test('treats a zero-filled cache entry as a miss and overwrites it', async () => {
    const fileStore = new FileStore<unknown>({root: '/root'});
    const cache = Buffer.from([0xfa, 0xce, 0xb0, 0x0c]);
    const data = {dependencies: [], output: []};

    await fileStore.set(cache, data);
    const filePath = '/root/fa/ceb00c';
    fs.writeFileSync(filePath, Buffer.alloc(fs.statSync(filePath).size));

    expect(await fileStore.get(cache)).toBeNull();
    await fileStore.set(cache, data);
    expect(await fileStore.get(cache)).toEqual(data);
  });

  test.each([
    ['non-empty', Buffer.from([0xca, 0xc4, 0xe5])],
    ['empty', Buffer.alloc(0)],
    ['all-zero', Buffer.alloc(64)],
  ])('invalidates legacy %s binary cache entries', async (_name, data) => {
    const fileStore = new FileStore<unknown>({root: '/root'});
    const cache = Buffer.from([0xfa, 0xce, 0xb0, 0x0c]);
    fs.mkdirSync('/root/fa', {recursive: true});
    fs.writeFileSync(
      '/root/fa/ceb00c',
      Buffer.concat([Buffer.from([0]), data]),
    );

    expect(await fileStore.get(cache)).toBeNull();
    await fileStore.set(cache, data);
    expect(await fileStore.get(cache)).toEqual(data);
  });

  test.each(['', '{"foo":', 'invalid'])(
    'treats malformed JSON %j as a miss',
    async data => {
      const fileStore = new FileStore<unknown>({root: '/root'});
      const cache = Buffer.from([0xfa, 0xce, 0xb0, 0x0c]);
      fs.mkdirSync('/root/fa', {recursive: true});
      fs.writeFileSync('/root/fa/ceb00c', data);

      expect(await fileStore.get(cache)).toBeNull();
    },
  );
});
