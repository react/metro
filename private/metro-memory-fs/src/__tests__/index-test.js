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

'use strict';

/* eslint-disable no-bitwise */

jest.useRealTimers();

const MemoryFs = require('../index');
const path = require('node:path');

let fs;

describe('posix support', () => {
  beforeEach(() => {
    fs = new MemoryFs({cwd: () => '/current/working/dir'});
  });

  describe('accessSync', () => {
    test('accesses owned file', () => {
      fs.writeFileSync('/foo.txt', 'test');
      fs.accessSync('/foo.txt');
    });

    test('check owned file can be read and written to', () => {
      fs.writeFileSync('/foo.txt', 'test');
      fs.accessSync('/foo.txt', fs.constants.R_OK | fs.constants.W_OK);
    });

    test('check owned file cannot be read', () => {
      fs.writeFileSync('/foo.txt', 'test', {mode: 0o000});
      expectFsError('EPERM', () =>
        fs.accessSync('/foo.txt', fs.constants.R_OK),
      );
    });

    test('check owned file cannot be written to', () => {
      fs.writeFileSync('/foo.txt', 'test', {mode: 0o000});
      expectFsError('EPERM', () =>
        fs.accessSync('/foo.txt', fs.constants.W_OK),
      );
    });
  });

  test('can write then read a file', () => {
    fs.writeFileSync('/foo.txt', 'test');
    expect(fs.readFileSync('/foo.txt', 'utf8')).toEqual('test');
  });

  test('can write then read a file with options object', () => {
    fs.writeFileSync('/foo.txt', 'test');
    expect(fs.readFileSync('/foo.txt', {encoding: 'utf8'})).toEqual('test');
  });

  test('works without binding functions', () => {
    const {writeFileSync, readFileSync} = fs;
    writeFileSync('/foo.txt', 'test');
    expect(readFileSync('/foo.txt', 'utf8')).toEqual('test');
  });

  test('can write then read a file (async)', done => {
    fs.writeFile('/foo.txt', 'test', wrError => {
      if (wrError) {
        done(wrError);
        return;
      }
      fs.readFile('/foo.txt', 'utf8', (rdError, str) => {
        if (rdError) {
          done(rdError);
          return;
        }
        expect(str).toEqual('test');
        done();
      });
    });
  });

  test('can write then read a file as buffer', () => {
    fs.writeFileSync('/foo.txt', Buffer.from([1, 2, 3, 4]));
    expect(fs.readFileSync('/foo.txt')).toEqual(Buffer.from([1, 2, 3, 4]));
  });

  test('can write a file with a relative path', () => {
    fs.mkdirSync('/current');
    fs.mkdirSync('/current/working');
    fs.mkdirSync('/current/working/dir');
    fs.writeFileSync('foo.txt', 'test');
    expect(fs.readFileSync('/current/working/dir/foo.txt', 'utf8')).toEqual(
      'test',
    );
  });

  describe('createWriteStream', () => {
    test('writes a file', done => {
      const st = fs.createWriteStream('/foo.txt', {emitClose: true});
      let opened = false;
      let closed = false;
      st.on('open', () => (opened = true));
      st.on('close', () => (closed = true));
      st.write('test');
      st.write(' foo');
      st.end();

      st.on('close', () => {
        expect(opened).toBe(true);
        expect(closed).toBe(true);
        expect(fs.readFileSync('/foo.txt', 'utf8')).toEqual('test foo');

        done();
      });
    });

    test('writes a file, as buffer', done => {
      const st = fs.createWriteStream('/foo.txt');
      let opened = false;
      st.on('open', () => (opened = true));
      st.write(Buffer.from('test'));
      st.write(Buffer.from(' foo'));
      st.end(() => {
        expect(opened).toBe(true);
        expect(fs.readFileSync('/foo.txt', 'utf8')).toEqual('test foo');
        done();
      });
    });

    test('writes a file, with a starting position', done => {
      fs.writeFileSync('/foo.txt', 'test bar');
      const st = fs.createWriteStream('/foo.txt', {start: 5, flags: 'r+'});
      let opened = false;
      st.on('open', () => (opened = true));
      st.write('beep');
      st.end(() => {
        expect(opened).toBe(true);
        expect(fs.readFileSync('/foo.txt', 'utf8')).toEqual('test beep');
        done();
      });
    });

    test('writes a file with a custom fd', done => {
      const fd = fs.openSync('/bar.txt', 'w');
      const st = fs.createWriteStream('/foo.txt', {fd});
      let opened = false;
      st.on('open', () => (opened = true));
      st.write('beep boop');
      st.end(() => {
        expect(opened).toBe(false);
        expect(fs.readFileSync('/bar.txt', 'utf8')).toEqual('beep boop');
        done();
      });
    });
  });

  describe('createReadStream', () => {
    const REF_STR = 'foo bar baz glo beep boop';

    beforeEach(() => {
      fs.writeFileSync('/foo.txt', REF_STR);
    });

    test('reads a file', async () => {
      const str = await readWithReadStream(null);
      expect(str).toBe(REF_STR);
    });

    test('reads a file, with a starting position', async () => {
      const str = await readWithReadStream({start: 4});
      expect(str).toBe(REF_STR.substring(4));
    });

    test('reads a file, with an ending position', async () => {
      const str = await readWithReadStream({end: 14});
      // The `end` option is inclusive, but it's exclusive for `substring`,
      // hence the difference between 14 and 15.
      expect(str).toBe(REF_STR.substring(0, 15));
    });

    test('reads a file, with starting and ending positions', async () => {
      const str = await readWithReadStream({start: 8, end: 14});
      // The `end` option is inclusive, but it's exclusive for `substring`,
      // hence the difference between 14 and 15.
      expect(str).toBe(REF_STR.substring(8, 15));
    });

    test('reads a file, with custom flags and mode', async () => {
      const str = await readWithReadStream(
        {flags: 'wx+', mode: 0o600},
        '/glo.txt',
      );
      expect(str).toBe('');
      // Does not work yet, statSync needs to be fixed to support `mode`.
      // expect(fs.statSync('/glo.txt').mode).toBe(0o600);
    });

    function readWithReadStream(
      options:
        | null
        | {end: number}
        | {end: number, start: number}
        | {flags: string, mode: number}
        | {start: number},
      filePath: string = '/foo.txt',
    ) {
      return new Promise(resolve => {
        const st = fs.createReadStream(
          filePath,
          options != null ? {...options, encoding: 'utf8'} : 'utf8',
        );
        let opened = false;
        let closed = false;
        st.on('open', () => (opened = true));
        st.on('close', () => (closed = true));
        expect((st as any).path).toBe(filePath);
        let str = '';
        st.on('data', chunk => {
          expect(opened).toBe(true);
          str += chunk;
        });
        st.on('end', () => {
          expect(closed).toBe(true);
          resolve(str);
        });
      });
    }

    test('reads a file as buffer', done => {
      const st = fs.createReadStream('/foo.txt');
      let buffer = Buffer.alloc(0);
      st.on('data', chunk => {
        buffer = Buffer.concat([buffer, chunk]);
      });
      st.on('end', () => {
        expect(buffer.toString('utf8')).toBe(REF_STR);
        done();
      });
    });

    test('reads a file with a custom fd', done => {
      fs.writeFileSync('/bar.txt', 'tadam');
      const fd = fs.openSync('/bar.txt', 'r');
      const st = fs.createReadStream('/foo.txt', {fd, encoding: 'utf8'});
      let opened = false;
      let closed = false;
      st.on('open', () => (opened = true));
      st.on('close', () => (closed = true));
      expect((st as any).path).toBe('/foo.txt');
      let str = '';
      st.on('data', chunk => {
        str += chunk;
      });
      st.on('end', () => {
        expect(opened).toBe(false);
        expect(closed).toBe(true);
        expect(str).toBe('tadam');
        done();
      });
    });

    test('reads a file with a custom fd, no auto-close', done => {
      fs.writeFileSync('/bar.txt', 'tadam');
      const fd = fs.openSync('/bar.txt', 'r');
      const st = fs.createReadStream('/foo.txt', {
        fd,
        encoding: 'utf8',
        autoClose: false,
      });
      let opened = false;
      let closed = false;
      st.on('open', () => (opened = true));
      st.on('close', () => (closed = true));
      expect((st as any).path).toBe('/foo.txt');
      let str = '';
      st.on('data', chunk => {
        str += chunk;
      });
      st.on('end', () => {
        expect(opened).toBe(false);
        expect(closed).toBe(false);
        expect(str).toBe('tadam');
        fs.closeSync(fd);
        done();
      });
    });
  });

  test('truncates a file that already exist', () => {
    fs.writeFileSync('/foo.txt', 'test');
    fs.writeFileSync('/foo.txt', 'hop');
    expect(fs.readFileSync('/foo.txt', 'utf8')).toEqual('hop');
  });

  test('can write to an arbitrary position in a file', () => {
    const fd = fs.openSync('/foo.txt', 'w');
    fs.writeSync(fd, 'test');
    fs.writeSync(fd, 'a', 1);
    fs.writeSync(fd, 'e', 4);
    fs.closeSync(fd);
    expect(fs.readFileSync('/foo.txt', 'utf8')).toEqual('taste');
  });

  test('can check a file exist', () => {
    fs.writeFileSync('/foo.txt', 'test');
    expect(fs.existsSync('/foo.txt')).toBe(true);
    expect(fs.existsSync('/bar.txt')).toBe(false);
    expect(fs.existsSync('/glo/bar.txt')).toBe(false);
  });

  test('can write then read a file in a subdirectory', () => {
    fs.mkdirSync('/glo');
    fs.writeFileSync('/glo/foo.txt', 'test');
    expect(fs.readFileSync('/glo/foo.txt', 'utf8')).toEqual('test');
  });

  test('can write then read via a symlinked file', () => {
    fs.symlinkSync('foo.txt', '/bar.txt');
    fs.writeFileSync('/bar.txt', 'test');
    expect(fs.readFileSync('/bar.txt', 'utf8')).toEqual('test');
    expect(fs.readFileSync('/foo.txt', 'utf8')).toEqual('test');
  });

  test('can write then read via a symlinked file (absolute path)', () => {
    fs.symlinkSync('/foo.txt', '/bar.txt');
    fs.writeFileSync('/bar.txt', 'test');
    expect(fs.readFileSync('/bar.txt', 'utf8')).toEqual('test');
    expect(fs.readFileSync('/foo.txt', 'utf8')).toEqual('test');
  });

  test('can write then read a file in a symlinked directory', () => {
    fs.mkdirSync('/glo');
    fs.symlinkSync('glo', '/baz');
    fs.writeFileSync('/baz/foo.txt', 'test');
    expect(fs.readFileSync('/baz/foo.txt', 'utf8')).toEqual('test');
    expect(fs.readFileSync('/glo/foo.txt', 'utf8')).toEqual('test');
  });

  test('gives the real path for a symbolic link to a non-existent file', () => {
    fs.symlinkSync('foo.txt', '/bar.txt');
    // This *is* expected to work even if the file doesn't actually exist.
    expect(fs.realpathSync('/bar.txt')).toEqual('/foo.txt');
  });

  test('gives the real path for a symbolic link to a file', () => {
    fs.writeFileSync('/foo.txt', 'test');
    fs.symlinkSync('foo.txt', '/bar.txt');
    expect(fs.realpathSync('/bar.txt')).toEqual('/foo.txt');
  });

  test('gives the real path via a symlinked directory', () => {
    fs.mkdirSync('/glo');
    fs.symlinkSync('glo', '/baz');
    expect(fs.realpathSync('/baz/foo.txt')).toEqual('/glo/foo.txt');
  });

  test('realpathSync.native is supported', () => {
    fs.mkdirSync('/glo');
    fs.symlinkSync('glo', '/baz');
    // $FlowFixMe[prop-missing]: Ideally this should typecheck.
    const realpathSyncNative = fs.realpathSync.native;
    expect(realpathSyncNative('/baz/foo.txt')).toEqual('/glo/foo.txt');
  });

  describe('stat', () => {
    test('works for a regular file', () => {
      fs.writeFileSync('/foo.txt', 'test');
      const st = fs.statSync('/foo.txt');
      expect(st.isFile()).toBe(true);
      expect(st.isDirectory()).toBe(false);
      expect(st.isSymbolicLink()).toBe(false);
      expect(st.size).toBe(4);
    });

    test('works for a symlinked file', () => {
      fs.writeFileSync('/foo.txt', 'test');
      fs.symlinkSync('foo.txt', '/bar.txt');
      const st = fs.statSync('/bar.txt');
      expect(st.isFile()).toBe(true);
      expect(st.isDirectory()).toBe(false);
      expect(st.isSymbolicLink()).toBe(false);
      expect(st.size).toBe(4);
    });
  });

  describe('lstat', () => {
    test('works for a regular file', () => {
      fs.writeFileSync('/foo.txt', 'test');
      const st = fs.lstatSync('/foo.txt');
      expect(st.isFile()).toBe(true);
      expect(st.isDirectory()).toBe(false);
      expect(st.isSymbolicLink()).toBe(false);
      expect(st.size).toBe(4);
    });

    test('works for a symlink', () => {
      const linkStr = 'foo/bar/baz.txt';
      fs.symlinkSync(linkStr, '/bar.txt');
      const st = fs.lstatSync('/bar.txt');
      expect(st.isFile()).toBe(false);
      expect(st.isDirectory()).toBe(false);
      expect(st.isSymbolicLink()).toBe(true);
      expect(st.size).toBe(linkStr.length);
    });
  });

  describe('readdirsync', () => {
    test('able to list files of a directory', () => {
      fs.mkdirSync('/baz');
      fs.writeFileSync('/baz/foo.txt', 'test');
      fs.writeFileSync('/baz/bar.txt', 'boop');
      fs.symlinkSync('glo', '/baz/glo.txt');
      expect(fs.readdirSync('/baz')).toEqual(['foo.txt', 'bar.txt', 'glo.txt']);
    });

    describe('withFileTypes', () => {
      let entries: Array<fs.Dirent>;

      beforeEach(() => {
        fs.mkdirSync('/baz');
        fs.writeFileSync('/baz/foo.txt', 'test');
        fs.writeFileSync('/baz/bar.txt', 'boop');
        fs.symlinkSync('glo', '/baz/glo.txt');
        fs.mkdirSync('/baz/subdir');
        entries = fs.readdirSync('/baz', {
          withFileTypes: true,
        }) as $FlowFixMe;
      });

      test('returns Dirent objects', () => {
        expect.assertions(4);
        for (const entry of entries) {
          expect(entry).toBeInstanceOf(fs.Dirent);
        }
      });

      test('regular file', () => {
        const entry = entries[0];
        expect(entry.name).toBe('foo.txt');
        expect(entry.isFile()).toBe(true);
        expect(entry.isSymbolicLink()).toBe(false);
        expect(entry.isDirectory()).toBe(false);
        expect(entry.isBlockDevice()).toBe(false);
        expect(entry.isCharacterDevice()).toBe(false);
        expect(entry.isFIFO()).toBe(false);
        expect(entry.isSocket()).toBe(false);
      });

      test('target of a symlink', () => {
        const entry = entries[1];
        expect(entry.name).toBe('bar.txt');
        expect(entry.isFile()).toBe(true);
        expect(entry.isSymbolicLink()).toBe(false);
        expect(entry.isDirectory()).toBe(false);
        expect(entry.isBlockDevice()).toBe(false);
        expect(entry.isCharacterDevice()).toBe(false);
        expect(entry.isFIFO()).toBe(false);
        expect(entry.isSocket()).toBe(false);
      });

      test('symlink', () => {
        const entry = entries[2];
        expect(entry.name).toBe('glo.txt');
        expect(entry.isFile()).toBe(false);
        expect(entry.isSymbolicLink()).toBe(true);
        expect(entry.isDirectory()).toBe(false);
        expect(entry.isBlockDevice()).toBe(false);
        expect(entry.isCharacterDevice()).toBe(false);
        expect(entry.isFIFO()).toBe(false);
        expect(entry.isSocket()).toBe(false);
      });

      test('subdirectory', () => {
        const entry = entries[3];
        expect(entry.name).toBe('subdir');
        expect(entry.isFile()).toBe(false);
        expect(entry.isSymbolicLink()).toBe(false);
        expect(entry.isDirectory()).toBe(true);
        expect(entry.isBlockDevice()).toBe(false);
        expect(entry.isCharacterDevice()).toBe(false);
        expect(entry.isFIFO()).toBe(false);
        expect(entry.isSocket()).toBe(false);
      });

      test('Buffer support', () => {
        const entriesWithBuffers: Array<fs.Dirent> = fs.readdirSync('/baz', {
          withFileTypes: true,
          encoding: 'buffer',
        }) as $FlowFixMe;
        for (const [i, name] of [
          'foo.txt',
          'bar.txt',
          'glo.txt',
          'subdir',
        ].entries()) {
          expect(entriesWithBuffers[i]).toBeInstanceOf(fs.Dirent);
          expect(entriesWithBuffers[i]).toHaveProperty(
            'name',
            Buffer.from(name, 'utf8'),
          );
        }
      });
    });
  });

  describe('watch', () => {
    test('reports changed files', () => {
      const changedPaths: Array<
        Array<?(Buffer | string | 'change' | 'rename')>,
      > = [];
      fs.writeFileSync('/foo.txt', '');
      fs.writeFileSync('/bar.txt', '');
      const watcher = collectWatchEvents('/', {}, changedPaths);
      fs.writeFileSync('/foo.txt', 'test');
      fs.writeFileSync('/bar.txt', 'tadam');
      expect(changedPaths).toEqual([
        ['change', 'foo.txt'],
        ['change', 'bar.txt'],
      ]);
      watcher.close();
    });

    test('does not report nested changed files if non-recursive', () => {
      const changedPaths: Array<
        Array<?(Buffer | string | 'change' | 'rename')>,
      > = [];
      fs.mkdirSync('/foo');
      fs.writeFileSync('/foo/bar.txt', '');
      const watcher = collectWatchEvents('/', {}, changedPaths);
      fs.writeFileSync('/foo/bar.txt', 'test');
      expect(changedPaths).toEqual([]);
      watcher.close();
    });

    test('does report nested changed files if recursive', () => {
      const changedPaths: Array<
        Array<?(Buffer | string | 'change' | 'rename')>,
      > = [];
      fs.mkdirSync('/foo');
      fs.writeFileSync('/foo/bar.txt', '');
      const watcher = collectWatchEvents('/', {recursive: true}, changedPaths);
      fs.writeFileSync('/foo/bar.txt', 'test');
      expect(changedPaths).toEqual([['change', 'foo/bar.txt']]);
      watcher.close();
    });

    test('reports created files', () => {
      const changedPaths: Array<
        Array<?(Buffer | string | 'change' | 'rename')>,
      > = [];
      const watcher = collectWatchEvents('/', {}, changedPaths);
      const fd = fs.openSync('/foo.txt', 'w');
      expect(changedPaths).toEqual([['rename', 'foo.txt']]);
      fs.closeSync(fd);
      watcher.close();
    });

    test('reports unlinked files', () => {
      const changedPaths: Array<
        Array<?(Buffer | string | 'change' | 'rename')>,
      > = [];
      fs.writeFileSync('/bar.txt', 'text');
      const watcher = collectWatchEvents('/', {}, changedPaths);
      fs.unlinkSync('/bar.txt');
      expect(changedPaths).toEqual([['rename', 'bar.txt']]);
      watcher.close();
    });

    test('reports changed files when watching a file directly', () => {
      const changedPaths: Array<
        Array<?(Buffer | string | 'change' | 'rename')>,
      > = [];
      fs.writeFileSync('/foo.txt', '');
      const watcher = collectWatchEvents('/foo.txt', {}, changedPaths);
      fs.writeFileSync('/foo.txt', 'test');
      expect(changedPaths).toEqual([['change', 'foo.txt']]);
      watcher.close();
    });

    test('does not report changes when just reading a file', () => {
      const changedPaths: Array<
        Array<?(Buffer | string | 'change' | 'rename')>,
      > = [];
      fs.writeFileSync('/foo.txt', '');
      const watcher = collectWatchEvents('/', {}, changedPaths);
      fs.readFileSync('/foo.txt');
      expect(changedPaths).toEqual([]);
      watcher.close();
    });

    test('reports source and destination files when renaming', () => {
      const changedPaths: Array<
        Array<?(Buffer | string | 'change' | 'rename')>,
      > = [];
      fs.writeFileSync('/src.txt', 'text');
      const watcher = collectWatchEvents('/', {}, changedPaths);
      fs.renameSync('/src.txt', '/dest.txt');
      expect(changedPaths).toEqual([
        ['rename', 'dest.txt'],
        ['rename', 'src.txt'],
      ]);
      watcher.close();
    });

    test('reports destination file twice when renaming and overwriting ', () => {
      const changedPaths: Array<
        Array<?(Buffer | string | 'change' | 'rename')>,
      > = [];
      fs.writeFileSync('/src.txt', 'text');
      fs.writeFileSync('/dest.txt', 'overwriteThis');
      const watcher = collectWatchEvents('/', {}, changedPaths);
      fs.renameSync('/src.txt', '/dest.txt');
      expect(changedPaths).toEqual([
        ['rename', 'dest.txt'],
        ['rename', 'dest.txt'],
        ['rename', 'src.txt'],
      ]);
      watcher.close();
    });

    test('reports new hard links', () => {
      const changedPaths: Array<
        Array<?(Buffer | string | 'change' | 'rename')>,
      > = [];
      fs.writeFileSync('/foo.txt', 'text');
      const watcher = collectWatchEvents('/', {}, changedPaths);
      fs.linkSync('/foo.txt', '/bar.txt');
      expect(changedPaths).toEqual([['rename', 'bar.txt']]);
      watcher.close();
    });

    test('reports truncated files', () => {
      const changedPaths: Array<
        Array<?(Buffer | string | 'change' | 'rename')>,
      > = [];
      fs.writeFileSync('/bar.txt', 'text');
      const watcher = collectWatchEvents('/', {}, changedPaths);
      fs.truncateSync('/bar.txt');
      expect(changedPaths).toEqual(
        // TODO: Emit exactly one change event
        expect.arrayContaining([['change', 'bar.txt']]),
      );
      watcher.close();
    });

    function collectWatchEvents(
      entPath: string,
      /* $FlowFixMe[missing-local-annot] The type annotation(s) required by
       * Flow's LTI update could not be added via codemod */
      options,
      events: Array<Array<?(Buffer | string | 'change' | 'rename')>>,
    ) {
      return fs.watch(entPath, options, (eventName, filePath) => {
        events.push([eventName, filePath]);
      });
    }
  });

  describe('unlink', () => {
    test('removes a file', () => {
      fs.writeFileSync('/foo.txt', 'test');
      expect(fs.readdirSync('/')).toEqual(['foo.txt']);
      fs.unlinkSync('/foo.txt');
      expect(fs.readdirSync('/')).toEqual([]);
      try {
        fs.readFileSync('/foo.txt', 'utf8');
        throw new Error('should not reach here');
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }
    });

    test('removes a symlink (not the linked file)', () => {
      fs.writeFileSync('/foo.txt', 'test');
      fs.symlinkSync('foo.txt', '/bar.txt');
      expect(fs.readdirSync('/')).toEqual(['foo.txt', 'bar.txt']);
      fs.unlinkSync('/bar.txt');
      expect(fs.readdirSync('/')).toEqual(['foo.txt']);
    });

    test('throws for non existent files', () => {
      try {
        fs.unlinkSync('/nonexistent.txt');
        throw new Error('should not reach here');
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }
    });

    test('throws for directories', () => {
      fs.mkdirSync('/foo');
      try {
        fs.unlinkSync('/foo');
        throw new Error('should not reach here');
      } catch (error) {
        if (error.code !== 'EISDIR') {
          throw error;
        }
      }
    });
  });

  describe('rmSync', () => {
    test('removes a file', () => {
      fs.writeFileSync('/foo.txt', 'test');
      expect(fs.readdirSync('/')).toEqual(['foo.txt']);
      fs.rmSync('/foo.txt');
      expect(fs.readdirSync('/')).toEqual([]);
      try {
        fs.readFileSync('/foo.txt', 'utf8');
        throw new Error('should not reach here');
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }
    });

    test('removes a symlink (not the linked file)', () => {
      fs.writeFileSync('/foo.txt', 'test');
      fs.symlinkSync('foo.txt', '/bar.txt');
      expect(fs.readdirSync('/')).toEqual(['foo.txt', 'bar.txt']);
      fs.rmSync('/bar.txt');
      expect(fs.readdirSync('/')).toEqual(['foo.txt']);
    });

    test('throws for non existent files', () => {
      try {
        fs.rmSync('/nonexistent.txt');
        throw new Error('should not reach here');
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }
    });

    test('removes directories', () => {
      fs.mkdirSync('/foo');
      expect(fs.readdirSync('/')).toEqual(['foo']);
      fs.rmSync('/foo');
      expect(fs.readdirSync('/')).toEqual([]);
    });

    test('throws when removing non-empty directories (recursive: false)', () => {
      fs.mkdirSync('/foo');
      fs.mkdirSync('/foo/bar');
      try {
        fs.rmSync('/foo');
        throw new Error('should not reach here');
      } catch (error) {
        if (error.code !== 'ENOTEMPTY') {
          throw error;
        }
      }
    });

    test('removes non-empty directories (recursive: true)', () => {
      fs.mkdirSync('/foo');
      fs.mkdirSync('/foo/bar');
      expect(fs.readdirSync('/')).toEqual(['foo']);
      fs.rmSync('/foo', {recursive: true});
      expect(fs.readdirSync('/')).toEqual([]);
    });

    test.each([false, undefined])(
      'throws on non-existent path (force: %s)',
      force => {
        expect(() =>
          fs.rmSync('/notexists', force != null ? {force} : {}),
        ).toThrow('ENOENT');
      },
    );

    test('succeeds non-existent path (force: true)', () => {
      fs.rmSync('/notexists', {force: true});
    });
  });

  describe('readlink', () => {
    test('reads a symlink target', () => {
      fs.symlinkSync('foo.txt', '/bar.txt');
      expect(fs.readlinkSync('/bar.txt')).toBe('foo.txt');
    });

    test('reads a symlink target as buffer', () => {
      fs.symlinkSync('foo.txt', '/bar.txt');
      expect(fs.readlinkSync('/bar.txt', 'buffer')).toEqual(
        Buffer.from('foo.txt'),
      );
    });

    test('throws when trying to read a regular file', () => {
      fs.writeFileSync('/foo.txt', 'test');
      expectFsError('EINVAL', () => fs.readlinkSync('/foo.txt'));
    });
  });

  test('throws when trying to read inexistent file', () => {
    expectFsError('ENOENT', () => fs.readFileSync('/foo.txt'));
  });

  test('throws when trying to read file via inexistent directory', () => {
    fs.writeFileSync('/foo.txt', 'test');
    // It is *not* expected to simplify the path before resolution. Because
    // `glo` does not exist along the way, it is expected to fail.
    expectFsError('ENOENT', () => fs.readFileSync('/glo/../foo.txt'));
  });

  test('throws when trying to create symlink over existing file', () => {
    fs.writeFileSync('/foo.txt', 'test');
    expectFsError('EEXIST', () => fs.symlinkSync('bar', '/foo.txt'));
  });

  test('throws when trying to write a directory entry', () => {
    fs.mkdirSync('/glo');
    expectFsError('EISDIR', () => fs.writeFileSync('/glo', 'test'));
  });

  test('throws when trying to read a directory entry', () => {
    fs.mkdirSync('/glo');
    expectFsError('EISDIR', () => fs.readFileSync('/glo'));
  });

  test('throws when trying to read inexistent file (async)', done => {
    fs.readFile('/foo.txt', (error: any) => {
      if (error.code !== 'ENOENT') {
        done(error);
        return;
      }
      expect(error.message).toMatchSnapshot();
      done();
    });
  });

  test('throws when trying to read directory as file', () => {
    fs.mkdirSync('/glo');
    expectFsError('EISDIR', () => fs.readFileSync('/glo'));
  });

  test('throws when trying to write to a win32-style path', () => {
    expectFsError('ENOENT', () => fs.writeFileSync('C:\\foo.txt', ''));
  });

  test('throws when trying to read file with trailing slash', () => {
    fs.writeFileSync('/foo.txt', 'test');
    expectFsError('ENOTDIR', () => fs.readFileSync('/foo.txt/'));
  });

  test('throws when finding a symlink loop', () => {
    fs.symlinkSync('foo.txt', '/bar.txt');
    fs.symlinkSync('bar.txt', '/glo.txt');
    fs.symlinkSync('glo.txt', '/foo.txt');
    expectFsError('ELOOP', () => fs.readFileSync('/foo.txt'));
  });

  test('throws when trying to write to an inexistent file descriptor', () => {
    expectFsError('EBADF', () => fs.writeSync(42, Buffer.from([1])));
  });

  test('throws when trying to write to a read-only file descriptor', () => {
    fs.writeFileSync('/foo.txt', 'test');
    const fd = fs.openSync('/foo.txt', 'r');
    expectFsError('EBADF', () => fs.writeSync(fd, Buffer.from([1])));
  });

  test('throws when trying to open too many files', () => {
    fs.writeFileSync('/foo.txt', 'test');
    expectFsError('EMFILE', () => {
      for (let i = 0; i < 1000; ++i) {
        fs.openSync('/foo.txt', 'r');
      }
    });
  });

  test('supports copying files', () => {
    const source = '/source-file';
    const data = 'arbitrary data';
    fs.writeFileSync(source, data);

    const dest = '/dest-file';
    fs.copyFileSync(source, dest);
    expect(fs.readFileSync(dest, 'utf8')).toBe(data);

    const dest2 = '/dest-file-with-flags';
    fs.copyFileSync(source, dest2, fs.constants.COPYFILE_FICLONE);
    expect(fs.readFileSync(dest2, 'utf8')).toBe(data);
  });

  test('supports COPYFILE_EXCL for copyFile', () => {
    const data = 'arbitrary data';
    const source = '/source-file';
    const dest = '/dest-file';
    fs.writeFileSync(source, data);
    fs.writeFileSync(dest, '');

    expectFsError('EEXIST', () =>
      fs.copyFileSync(
        source,
        dest,
        // pass bitfield with more bits set, to avoid equality test.
        fs.constants.COPYFILE_EXCL | fs.constants.COPYFILE_FICLONE,
      ),
    );

    // ensure that copyFileSync can overwrite when COPYFILE_EXCL is NOT passed.
    fs.copyFileSync(source, dest);
    expect(fs.readFileSync(source, 'utf8')).toBe(data);
  });

  describe('renameSync', () => {
    test('errors when the source does not exist', () => {
      fs.writeFileSync('/dest', 'TRY_TO_OVERWRITE_ME');
      expectFsError('ENOENT', () => fs.renameSync('/source', '/dest'));
      expect(fs.readFileSync('/dest', 'utf8')).toBe('TRY_TO_OVERWRITE_ME');
    });

    test('errors when the destination is in a nonexistent directory', () => {
      fs.writeFileSync('/source', 'DATA');

      expectFsError('ENOENT', () => fs.renameSync('/source', '/bad/dest'));
      expect(fs.existsSync('/source')).toBe(true);
      expect(fs.existsSync('/dest')).toBe(false);
      expect(fs.readFileSync('/source', 'utf8')).toBe('DATA');
    });

    test('errors when making a directory its own subdirectory', () => {
      fs.mkdirSync('/source');
      fs.writeFileSync('/source/data', 'DATA');

      expectFsError('EINVAL', () => fs.renameSync('/source', '/source/subdir'));
      expect(fs.readFileSync('/source/data', 'utf8')).toBe('DATA');
    });

    test('errors when using a file as a directory in the source path', () => {
      fs.writeFileSync('/source', 'DATA');

      expectFsError('ENOTDIR', () => fs.renameSync('/source/nope', '/dest'));
      expect(fs.readFileSync('/source', 'utf8')).toBe('DATA');
    });

    test('errors when using a file as a directory in the destination path', () => {
      fs.writeFileSync('/source', 'DATA');
      fs.writeFileSync('/dest', 'TRY_TO_OVERWRITE_ME');

      expectFsError('ENOTDIR', () => fs.renameSync('/source', '/dest/nope'));
      expect(fs.readFileSync('/source', 'utf8')).toBe('DATA');
      expect(fs.readFileSync('/dest', 'utf8')).toBe('TRY_TO_OVERWRITE_ME');
    });

    describe('when the destination is valid and does not exist', () => {
      test('renames a file', () => {
        fs.writeFileSync('/source', 'DATA');

        fs.renameSync('/source', '/dest');
        expect(fs.existsSync('/source')).toBe(false);
        expect(fs.readFileSync('/dest', 'utf8')).toBe('DATA');
      });

      test('renames a symbolic link', () => {
        fs.writeFileSync('/sourceReal', 'DATA');
        fs.symlinkSync('/sourceReal', '/source');

        fs.renameSync('/source', '/dest');

        expect(fs.existsSync('/source')).toBe(false);
        expect(fs.readFileSync('/dest', 'utf8')).toBe('DATA');
        expect(fs.readlinkSync('/dest')).toBe('/sourceReal');
      });

      test('renames a directory', () => {
        fs.mkdirSync('/source');
        fs.writeFileSync('/source/data', 'DATA');

        fs.renameSync('/source', '/dest');
        expect(fs.existsSync('/source')).toBe(false);
        expect(fs.readFileSync('/dest/data', 'utf8')).toBe('DATA');
      });
    });

    describe('when the source is valid and the destination exists', () => {
      test('file -> file succeeds', () => {
        fs.writeFileSync('/source', 'DATA');
        fs.writeFileSync('/dest', 'OVERWRITE_ME');

        fs.renameSync('/source', '/dest');
        expect(fs.existsSync('/source')).toBe(false);
        expect(fs.readFileSync('/dest', 'utf8')).toBe('DATA');
      });

      test('file -> itself succeeds', () => {
        fs.writeFileSync('/source', 'DATA');

        fs.renameSync('/source', '/source');
        expect(fs.readFileSync('/source', 'utf8')).toBe('DATA');
      });

      test('file -> other hard link to itself succeeds', () => {
        fs.writeFileSync('/source', 'DATA');
        fs.linkSync('/source', '/source_alt');

        fs.renameSync('/source', '/source_alt');
        expect(fs.readFileSync('/source', 'utf8')).toBe('DATA');
        expect(fs.readFileSync('/source_alt', 'utf8')).toBe('DATA');

        // The two are still linked
        fs.writeFileSync('/source', 'NEW_DATA');
        expect(fs.readFileSync('/source', 'utf8')).toBe('NEW_DATA');
        expect(fs.readFileSync('/source_alt', 'utf8')).toBe('NEW_DATA');
      });

      test('file -> directory succeeds', () => {
        fs.writeFileSync('/source', 'DATA');
        fs.mkdirSync('/dest');

        fs.renameSync('/source', '/dest');
        expect(fs.existsSync('/source')).toBe(false);
        expect(fs.readFileSync('/dest', 'utf8')).toBe('DATA');
      });

      test('file -> symbolic link succeeds', () => {
        fs.writeFileSync('/source', 'DATA');
        fs.writeFileSync('/destReal', 'TRY_TO_OVERWRITE_ME');
        fs.symlinkSync('/destReal', '/dest');

        fs.renameSync('/source', '/dest');
        expect(fs.existsSync('/source')).toBe(false);
        expect(fs.readFileSync('/dest', 'utf8')).toBe('DATA');
        expect(fs.statSync('/dest').isSymbolicLink()).toBe(false);
        expect(fs.readFileSync('/destReal', 'utf8')).toBe(
          'TRY_TO_OVERWRITE_ME',
        );
      });

      test('symbolic link -> file succeeds', () => {
        fs.writeFileSync('/sourceReal', 'DATA');
        fs.symlinkSync('/sourceReal', '/source');
        fs.writeFileSync('/dest', 'OVERWRITE_ME');

        fs.renameSync('/source', '/dest');

        expect(fs.existsSync('/source')).toBe(false);
        expect(fs.readFileSync('/dest', 'utf8')).toBe('DATA');
        expect(fs.readlinkSync('/dest')).toBe('/sourceReal');
      });

      test('symbolic link -> directory succeeds', () => {
        fs.writeFileSync('/sourceReal', 'DATA');
        fs.symlinkSync('/sourceReal', '/source');
        fs.mkdirSync('/dest');

        fs.renameSync('/source', '/dest');

        expect(fs.existsSync('/source')).toBe(false);
        expect(fs.readFileSync('/dest', 'utf8')).toBe('DATA');
        expect(fs.readlinkSync('/dest')).toBe('/sourceReal');
      });

      test('symbolic link -> symbolic link succeeds', () => {
        fs.writeFileSync('/sourceReal', 'DATA');
        fs.symlinkSync('/sourceReal', '/source');
        fs.writeFileSync('/destReal', 'TRY_TO_OVERWRITE_ME');
        fs.symlinkSync('/destReal', '/dest');

        fs.renameSync('/source', '/dest');

        expect(fs.existsSync('/source')).toBe(false);
        expect(fs.readFileSync('/dest', 'utf8')).toBe('DATA');
        expect(fs.readlinkSync('/dest')).toBe('/sourceReal');
        expect(fs.readFileSync('/destReal', 'utf8')).toBe(
          'TRY_TO_OVERWRITE_ME',
        );
      });

      test('symbolic link -> itself succeeds', () => {
        fs.writeFileSync('/sourceReal', 'DATA');
        fs.symlinkSync('/sourceReal', '/source');

        fs.renameSync('/source', '/source');

        expect(fs.existsSync('/source')).toBe(true);
        expect(fs.readFileSync('/source', 'utf8')).toBe('DATA');
        expect(fs.readlinkSync('/source')).toBe('/sourceReal');
      });

      test('directory -> file errors', () => {
        fs.mkdirSync('/source');
        fs.writeFileSync('/dest', 'TRY_TO_OVERWRITE_ME');

        expectFsError('EISDIR', () => fs.renameSync('/source', '/dest'));
        expect(fs.statSync('/source').isDirectory()).toBe(true);
        expect(fs.readFileSync('/dest', 'utf8')).toBe('TRY_TO_OVERWRITE_ME');
      });

      test('directory -> symbolic link errors', () => {
        fs.mkdirSync('/source');
        fs.writeFileSync('/destReal', 'TRY_TO_OVERWRITE_ME');
        fs.symlinkSync('/destReal', '/dest');

        expectFsError('EISDIR', () => fs.renameSync('/source', '/dest'));
        expect(fs.statSync('/source').isDirectory()).toBe(true);
        expect(fs.readFileSync('/dest', 'utf8')).toBe('TRY_TO_OVERWRITE_ME');
        expect(fs.readlinkSync('/dest')).toBe('/destReal');
      });

      test('directory -> empty directory succeeds', () => {
        fs.mkdirSync('/source');
        fs.writeFileSync('/source/data', 'DATA');
        fs.mkdirSync('/dest');

        fs.renameSync('/source', '/dest');
        expect(fs.existsSync('/source')).toBe(false);
        expect(fs.readFileSync('/dest/data', 'utf8')).toBe('DATA');
      });

      test('directory -> non-empty directory errors', () => {
        fs.mkdirSync('/source');
        fs.writeFileSync('/source/data', 'DATA');
        fs.mkdirSync('/dest');
        fs.writeFileSync('/dest/nope', 'TRY_TO_OVERWRITE_ME');

        expectFsError('ENOTEMPTY', () => fs.renameSync('/source', '/dest'));
        expect(fs.readFileSync('/source/data', 'utf8')).toBe('DATA');
        expect(fs.readFileSync('/dest/nope', 'utf8')).toBe(
          'TRY_TO_OVERWRITE_ME',
        );
      });

      test('directory -> itself succeeds', () => {
        fs.mkdirSync('/source');
        fs.writeFileSync('/source/data', 'DATA');

        fs.renameSync('/source', '/source');
        expect(fs.readFileSync('/source/data', 'utf8')).toBe('DATA');
      });
    });
  });

  describe('linkSync', () => {
    test('errors when the source does not exist', () => {
      fs.writeFileSync('/dest', 'TRY_TO_OVERWRITE_ME');
      expectFsError('ENOENT', () => fs.linkSync('/source', '/dest'));
      expect(fs.readFileSync('/dest', 'utf8')).toBe('TRY_TO_OVERWRITE_ME');
    });

    test('errors when the destination is in a nonexistent directory', () => {
      fs.writeFileSync('/source', 'DATA');

      expectFsError('ENOENT', () => fs.linkSync('/source', '/bad/dest'));
      expect(fs.existsSync('/source')).toBe(true);
      expect(fs.existsSync('/dest')).toBe(false);
      expect(fs.readFileSync('/source', 'utf8')).toBe('DATA');
    });

    test('errors when using a file as a directory in the source path', () => {
      fs.writeFileSync('/source', 'DATA');

      expectFsError('ENOTDIR', () => fs.linkSync('/source/nope', '/dest'));
      expect(fs.readFileSync('/source', 'utf8')).toBe('DATA');
    });

    test('errors when using a file as a directory in the destination path', () => {
      fs.writeFileSync('/source', 'DATA');
      fs.writeFileSync('/dest', 'TRY_TO_OVERWRITE_ME');

      expectFsError('ENOTDIR', () => fs.linkSync('/source', '/dest/nope'));
      expect(fs.readFileSync('/source', 'utf8')).toBe('DATA');
      expect(fs.readFileSync('/dest', 'utf8')).toBe('TRY_TO_OVERWRITE_ME');
    });

    test('links a file', () => {
      fs.writeFileSync('/source', 'DATA');

      fs.linkSync('/source', '/dest');
      expect(fs.readFileSync('/source', 'utf8')).toBe('DATA');
      expect(fs.readFileSync('/dest', 'utf8')).toBe('DATA');
    });

    describe('relationship after linking', () => {
      test('unlinking the source keeps the destination in place', () => {
        fs.writeFileSync('/source', 'DATA');

        fs.linkSync('/source', '/dest');
        fs.unlinkSync('/source');
        expect(fs.existsSync('/source')).toBe(false);
        expect(fs.readFileSync('/dest', 'utf8')).toBe('DATA');
      });

      test('unlinking the destination keeps the source in place', () => {
        fs.writeFileSync('/source', 'DATA');

        fs.linkSync('/source', '/dest');
        fs.unlinkSync('/dest');
        expect(fs.existsSync('/dest')).toBe(false);
        expect(fs.readFileSync('/source', 'utf8')).toBe('DATA');
      });

      test('writing to the destination updates the source', () => {
        fs.writeFileSync('/source', 'DATA');

        fs.linkSync('/source', '/dest');
        fs.writeFileSync('/dest', 'NEW_DATA');
        expect(fs.readFileSync('/source', 'utf8')).toBe('NEW_DATA');
        expect(fs.readFileSync('/dest', 'utf8')).toBe('NEW_DATA');
      });

      test('writing to the source updates the destination', () => {
        fs.writeFileSync('/source', 'DATA');

        fs.linkSync('/source', '/dest');
        fs.writeFileSync('/source', 'NEW_DATA');
        expect(fs.readFileSync('/source', 'utf8')).toBe('NEW_DATA');
        expect(fs.readFileSync('/dest', 'utf8')).toBe('NEW_DATA');
      });
    });

    describe('never overwrites the destination', () => {
      test('file -> file', () => {
        fs.writeFileSync('/source', 'DATA');
        fs.writeFileSync('/dest', 'TRY_TO_OVERWRITE_ME');

        expectFsError('EEXIST', () => fs.linkSync('/source', '/dest'));
        expect(fs.readFileSync('/source', 'utf8')).toBe('DATA');
        expect(fs.readFileSync('/dest', 'utf8')).toBe('TRY_TO_OVERWRITE_ME');
      });

      test('file -> itself', () => {
        fs.writeFileSync('/source', 'DATA');

        expectFsError('EEXIST', () => fs.linkSync('/source', '/source'));
        expect(fs.readFileSync('/source', 'utf8')).toBe('DATA');
      });

      test('file -> directory', () => {
        fs.writeFileSync('/source', 'DATA');
        fs.mkdirSync('/dest');

        expectFsError('EEXIST', () => fs.linkSync('/source', '/dest'));
        expect(fs.readFileSync('/source', 'utf8')).toBe('DATA');
        expect(fs.statSync('/dest').isDirectory()).toBe(true);
      });

      test('file -> symbolic link', () => {
        fs.writeFileSync('/source', 'DATA');
        fs.writeFileSync('/destReal', 'TRY_TO_OVERWRITE_ME');
        fs.symlinkSync('/destReal', '/dest');

        expectFsError('EEXIST', () => fs.linkSync('/source', '/dest'));
        expect(fs.readFileSync('/source', 'utf8')).toBe('DATA');
        expect(fs.readlinkSync('/dest')).toBe('/destReal');
        expect(fs.readFileSync('/dest', 'utf8')).toBe('TRY_TO_OVERWRITE_ME');
      });

      test('symbolic link -> file', () => {
        fs.writeFileSync('/sourceReal', 'DATA');
        fs.symlinkSync('/sourceReal', '/source');
        fs.writeFileSync('/dest', 'TRY_TO_OVERWRITE_ME');

        expectFsError('EEXIST', () => fs.linkSync('/source', '/dest'));

        expect(fs.readFileSync('/source', 'utf8')).toBe('DATA');
        expect(fs.readFileSync('/dest', 'utf8')).toBe('TRY_TO_OVERWRITE_ME');
      });

      test('symbolic link -> directory', () => {
        fs.writeFileSync('/sourceReal', 'DATA');
        fs.symlinkSync('/sourceReal', '/source');
        fs.mkdirSync('/dest');

        expectFsError('EEXIST', () => fs.linkSync('/source', '/dest'));

        expect(fs.readFileSync('/source', 'utf8')).toBe('DATA');
        expect(fs.statSync('/dest').isDirectory()).toBe(true);
      });

      test('symbolic link -> symbolic link', () => {
        fs.writeFileSync('/sourceReal', 'DATA');
        fs.symlinkSync('/sourceReal', '/source');
        fs.writeFileSync('/destReal', 'TRY_TO_OVERWRITE_ME');
        fs.symlinkSync('/destReal', '/dest');

        expectFsError('EEXIST', () => fs.linkSync('/source', '/dest'));

        expect(fs.readFileSync('/source', 'utf8')).toBe('DATA');
        expect(fs.readlinkSync('/dest')).toBe('/destReal');
        expect(fs.readFileSync('/dest', 'utf8')).toBe('TRY_TO_OVERWRITE_ME');
      });

      test('symbolic link -> itself', () => {
        fs.writeFileSync('/sourceReal', 'DATA');
        fs.symlinkSync('/sourceReal', '/source');

        expectFsError('EEXIST', () => fs.linkSync('/source', '/source'));

        expect(fs.readFileSync('/source', 'utf8')).toBe('DATA');
        expect(fs.readlinkSync('/source')).toBe('/sourceReal');
      });
    });

    describe('errors when source is a directory', () => {
      test('directory -> file', () => {
        fs.mkdirSync('/source');
        fs.writeFileSync('/dest', 'TRY_TO_OVERWRITE_ME');

        expectFsError('EPERM', () => fs.linkSync('/source', '/dest'));
        expect(fs.statSync('/source').isDirectory()).toBe(true);
        expect(fs.readFileSync('/dest', 'utf8')).toBe('TRY_TO_OVERWRITE_ME');
      });

      test('directory -> symbolic link', () => {
        fs.mkdirSync('/source');
        fs.writeFileSync('/destReal', 'TRY_TO_OVERWRITE_ME');
        fs.symlinkSync('/destReal', '/dest');

        expectFsError('EPERM', () => fs.linkSync('/source', '/dest'));
        expect(fs.statSync('/source').isDirectory()).toBe(true);
        expect(fs.readFileSync('/dest', 'utf8')).toBe('TRY_TO_OVERWRITE_ME');
        expect(fs.readlinkSync('/dest')).toBe('/destReal');
      });

      test('directory -> empty directory', () => {
        fs.mkdirSync('/source');
        fs.writeFileSync('/source/data', 'DATA');
        fs.mkdirSync('/dest');

        expectFsError('EPERM', () => fs.linkSync('/source', '/dest'));
        expect(fs.readFileSync('/source/data', 'utf8')).toBe('DATA');
        expect(fs.existsSync('/dest/data')).toBe(false);
      });

      test('directory -> non-empty directory', () => {
        fs.mkdirSync('/source');
        fs.writeFileSync('/source/data', 'DATA');
        fs.mkdirSync('/dest');
        fs.writeFileSync('/dest/nope', 'TRY_TO_OVERWRITE_ME');

        expectFsError('EPERM', () => fs.linkSync('/source', '/dest'));
        expect(fs.readFileSync('/source/data', 'utf8')).toBe('DATA');
        expect(fs.readFileSync('/dest/nope', 'utf8')).toBe(
          'TRY_TO_OVERWRITE_ME',
        );
      });

      test('directory -> itself', () => {
        fs.mkdirSync('/source');
        fs.writeFileSync('/source/data', 'DATA');

        expectFsError('EPERM', () => fs.linkSync('/source', '/source'));
        expect(fs.readFileSync('/source/data', 'utf8')).toBe('DATA');
      });
    });
  });

  describe('truncateSync', () => {
    test('errors on truncating a directory', () => {
      fs.mkdirSync('/foo');

      expectFsError('EISDIR', () => fs.truncateSync('/foo'));
    });

    test('truncates an empty file', () => {
      fs.writeFileSync('/foo', Buffer.from([]));
      fs.truncateSync('/foo');
      expect(fs.readFileSync('/foo')).toEqual(Buffer.from([]));
    });

    test('truncates a non-empty file', () => {
      fs.writeFileSync('/foo', Buffer.from([42, 1337]));
      fs.truncateSync('/foo');
      expect(fs.readFileSync('/foo')).toEqual(Buffer.from([]));
    });

    test('zero pads an empty file to the specified length', () => {
      fs.writeFileSync('/foo', Buffer.from([]));
      fs.truncateSync('/foo', 3);
      expect(fs.readFileSync('/foo')).toEqual(Buffer.from([0, 0, 0]));
    });

    test('zero pads a non-empty file to the specified length', () => {
      fs.writeFileSync('/foo', Buffer.from([42]));
      fs.truncateSync('/foo', 3);
      expect(fs.readFileSync('/foo')).toEqual(Buffer.from([42, 0, 0]));
    });

    test('truncates a non-empty file to the specified length', () => {
      fs.writeFileSync('/foo', Buffer.from([0xfa, 0xce, 0xb0, 0x0c]));
      fs.truncateSync('/foo', 2);
      expect(fs.readFileSync('/foo')).toEqual(Buffer.from([0xfa, 0xce]));
    });

    test('truncates a non-empty file to its current length', () => {
      fs.writeFileSync('/foo', Buffer.from([42, 1337]));
      fs.truncateSync('/foo', 2);
      expect(fs.readFileSync('/foo')).toEqual(Buffer.from([42, 1337]));
    });

    test('explicitly specifying length 0 works', () => {
      fs.writeFileSync('/foo', Buffer.from([42, 1337]));
      fs.truncateSync('/foo', 0);
      expect(fs.readFileSync('/foo')).toEqual(Buffer.from([]));
    });

    describe('with file descriptor', () => {
      test('errors on truncating a a non-writable file', () => {
        fs.writeFileSync('/foo', '');
        const fd = fs.openSync('/foo', 'r');

        expectFsError('EBADF', () => fs.truncateSync(fd));

        fs.closeSync(fd);
      });

      test('errors on a nonexistent file descriptor', () => {
        expectFsError('EBADF', () => fs.truncateSync(42));
      });

      test('errors on a closed file descriptor', () => {
        fs.writeFileSync('/foo', 'DATA');
        const fd = fs.openSync('/foo', 'r');
        fs.closeSync(fd);
        expectFsError('EBADF', () => fs.truncateSync(fd));
        expect(fs.readFileSync('/foo', 'utf8')).toBe('DATA');
      });

      test('truncates a non-empty file to the specified length', () => {
        fs.writeFileSync('/foo', Buffer.from([0xfa, 0xce, 0xb0, 0x0c]));
        const fd = fs.openSync('/foo', 'r+');
        const buf = Buffer.alloc(100);

        fs.truncateSync(fd, 2);
        const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0);
        expect(buf.slice(0, bytesRead)).toEqual(Buffer.from([0xfa, 0xce]));

        fs.closeSync(fd);
      });

      test('truncates without changing the current read position', () => {
        fs.writeFileSync('/foo', Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]));
        const fd = fs.openSync('/foo', 'r+');
        const buf = Buffer.alloc(100);

        // Advance the position by 2
        fs.readSync(fd, buf, 0, 2);
        // Truncate to the first 4 bytes
        fs.truncateSync(fd, 4);
        // Read 2 bytes and reach the end
        const bytesRead = fs.readSync(fd, buf, 0, 6);
        expect(buf.slice(0, bytesRead)).toEqual(Buffer.from([3, 4]));

        fs.closeSync(fd);
      });

      test('truncates without changing the current write position', () => {
        fs.writeFileSync('/foo', Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]));
        const fd = fs.openSync('/foo', 'r+');

        // Advance the position by 2
        fs.writeSync(fd, Buffer.from([10, 20]));
        // Truncate to the first 4 bytes
        fs.truncateSync(fd, 4);
        // Write 1 more byte
        fs.writeSync(fd, Buffer.from([30]));
        fs.closeSync(fd);

        expect(fs.readFileSync('/foo')).toEqual(Buffer.from([10, 20, 30, 4]));
      });
    });
  });

  describe('chmod', () => {
    describe('chmodSync', () => {
      test('sets the file mode', () => {
        fs.writeFileSync('/foo.txt', 'test', {mode: 0o700});
        expect(fs.statSync('/foo.txt').mode).toBe(0o700);
        fs.chmodSync('/foo.txt', 0o400);
        expect(fs.statSync('/foo.txt').mode).toBe(0o400);
      });

      test('parses strings as octal integers', () => {
        fs.writeFileSync('/foo.txt', 'test');
        fs.chmodSync('/foo.txt', '400');
        expect(fs.statSync('/foo.txt').mode).toBe(0o400);
      });

      test('follows symlinks', () => {
        fs.writeFileSync('/foo.txt', 'test');
        fs.symlinkSync('/foo.txt', '/link.txt');
        fs.chmodSync('/link.txt', '400');
        expect(fs.statSync('/foo.txt').mode).toBe(0o400);
        expect(fs.lstatSync('/link.txt').mode).not.toBe(0o400);
      });
    });

    describe('lchmodSync', () => {
      test('sets the file mode', () => {
        fs.writeFileSync('/foo.txt', 'test', {mode: 0o700});
        expect(fs.statSync('/foo.txt').mode).toBe(0o700);
        fs.lchmodSync('/foo.txt', 0o400);
        expect(fs.statSync('/foo.txt').mode).toBe(0o400);
      });

      test('parses strings as octal integers', () => {
        fs.writeFileSync('/foo.txt', 'test');
        fs.lchmodSync('/foo.txt', '400');
        expect(fs.statSync('/foo.txt').mode).toBe(0o400);
      });

      test('does not follow symlinks', () => {
        fs.writeFileSync('/foo.txt', 'test');
        fs.symlinkSync('/foo.txt', '/link.txt');
        fs.lchmodSync('/link.txt', '400');
        expect(fs.statSync('/foo.txt').mode).not.toBe(0o400);
        expect(fs.lstatSync('/link.txt').mode).toBe(0o400);
      });
    });

    describe('fchmodSync', () => {
      test('sets the file mode', () => {
        const fd = fs.openSync('/foo.txt', 'w', 0o700);
        expect(fs.fstatSync(fd).mode).toBe(0o700);
        fs.fchmodSync(fd, 0o400);
        expect(fs.fstatSync(fd).mode).toBe(0o400);
      });

      test('parses strings as octal integers', () => {
        const fd = fs.openSync('/foo.txt', 'w');
        fs.fchmodSync(fd, '400');
        expect(fs.fstatSync(fd).mode).toBe(0o400);
      });
    });
  });

  describe('mkdtemp', () => {
    test('creates a directory', () => {
      const name = fs.mkdtempSync('/');
      expect(fs.statSync(name).isDirectory()).toBe(true);
    });

    test('creates the directory with mode 0700', () => {
      const name = fs.mkdtempSync('/');
      expect(fs.statSync(name).mode).toBe(0o700);
    });

    test('concatenates a random suffix to the given prefix', () => {
      fs.mkdirSync('/tmp');
      const name = fs.mkdtempSync('/tmp/prefix');
      expect(path.posix.dirname(name)).toBe('/tmp');
      expect(path.posix.basename(name)).toMatch(/^prefix.{6}$/);
    });

    test('fails to create in a nonexistent directory', () => {
      expectFsError(
        'ENOENT',
        () => {
          fs.mkdtempSync('/doesnotexist/');
        },
        {
          // The message will contain a random part so we can't snapshot it.
          noSnapshot: true,
        },
      );
    });

    test('returns a different name every time', () => {
      const name1 = fs.mkdtempSync('/');
      const name2 = fs.mkdtempSync('/');
      expect(name2).not.toBe(name1);
    });

    test('returns the directory name interpreted in the requested encoding', () => {
      const nameHex = fs.mkdtempSync('/', {encoding: 'hex'});
      const name = Buffer.from(nameHex, 'hex').toString('utf8');
      expect(name).toMatch(/^\/.{6}$/);
      expect(fs.statSync(name).isDirectory()).toBe(true);
    });
  });
});

describe('win32 support', () => {
  beforeEach(() => {
    fs = new MemoryFs({platform: 'win32'});
  });

  test('can write then read a file', () => {
    fs.writeFileSync('C:\\foo.txt', 'test');
    expect(fs.readFileSync('C:\\foo.txt', 'utf8')).toEqual('test');
  });

  test('gives the real path for a file', () => {
    fs.writeFileSync('C:\\foo.txt', 'test');
    expect(fs.realpathSync('c:/foo.txt')).toEqual('c:\\foo.txt');
  });

  test('can write then read via a symlinked file', () => {
    fs.symlinkSync('foo.txt', 'c:\\bar.txt');
    fs.writeFileSync('c:\\bar.txt', 'test');
    expect(fs.readFileSync('c:\\bar.txt', 'utf8')).toEqual('test');
    expect(fs.readFileSync('c:\\foo.txt', 'utf8')).toEqual('test');
  });

  test('can write then read via an absolutely symlinked file', () => {
    fs.symlinkSync('c:\\foo.txt', 'c:\\bar.txt');
    fs.writeFileSync('c:\\bar.txt', 'test');
    expect(fs.readFileSync('c:\\bar.txt', 'utf8')).toEqual('test');
    expect(fs.readFileSync('c:\\foo.txt', 'utf8')).toEqual('test');
  });
});

describe('promises', () => {
  beforeEach(() => {
    fs = new MemoryFs({cwd: () => '/current/working/dir'});
  });

  test('exists', () => {
    expect(fs.promises).toBeDefined();
  });

  test('can write then read a file', async () => {
    await fs.promises.writeFile('/foo.txt', 'test');

    expect(await fs.promises.readFile('/foo.txt', 'utf8')).toEqual('test');
  });

  test('throws when trying to read inexistent file', async () => {
    await expect(fs.promises.readFile('/foo.txt')).rejects.toEqual(
      expect.objectContaining({code: 'ENOENT'}),
    );
  });
});

function expectFsError(
  code: string,
  handler: () => $FlowFixMe,
  {noSnapshot}: {noSnapshot?: boolean} = {...null},
) {
  try {
    handler();
    throw new Error('an error was expected but did not happen');
  } catch (error) {
    if (error.code !== code) {
      throw error;
    }
    if (!noSnapshot) {
      expect(error.message).toMatchSnapshot();
    }
    expect(typeof error.errno).toBe('number');
  }
}
