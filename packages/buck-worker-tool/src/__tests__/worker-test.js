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

jest
  .mock('node:console', () => {
    // Automocking is no longer working with jest after https://github.com/nodejs/node/pull/35399
    // because the typeof console is now 'console' and no longer Object.
    const mock = jest.fn();
    const Console = mock;

    Console.prototype.error = mock;

    return {Console};
  })
  .mock('node:fs', () => new (require('metro-memory-fs'))())
  .useRealTimers();

const JSONStream = require('../third-party/JSONStream');
const {buckWorker} = require('../worker-tool');
const path = require('node:path');
const through = require('through');

// mocked
const {Console} = jest.requireMock('node:console');
const fs = jest.requireMock('node:fs');

const {any, anything} = expect;

const UNKNOWN_MESSAGE = 1;
const INVALID_MESSAGE = 2;

describe('Buck worker:', () => {
  let commands, inStream, worker, written;

  beforeEach(() => {
    commands = {};
    worker = buckWorker(commands);

    inStream = JSONStream.stringify();
    inStream.pipe(worker);
    written = [];
    worker.on('data', chunk => written.push(chunk));
  });

  describe('handshake:', () => {
    test('responds to a correct handshake', () => {
      inStream.write(handshake());

      return end().then(data => expect(data).toEqual([handshake()]));
    });

    test('responds to a handshake with a `protocol_version` different from "0"', () => {
      inStream.write({
        id: 0,
        type: 'handshake',
        protocol_version: '2',
        capabilities: [],
      });

      return end().then(responses =>
        expect(responses).toEqual([
          {
            id: 0,
            type: 'error',
            exit_code: INVALID_MESSAGE,
          },
        ]),
      );
    });

    test('errors for a second handshake', () => {
      inStream.write(handshake());
      inStream.write(handshake(1));

      return end().then(([, response]) =>
        expect(response).toEqual({
          id: 1,
          type: 'error',
          exit_code: UNKNOWN_MESSAGE,
        }),
      );
    });
  });

  test('errors for unknown message types', () => {
    inStream.write(handshake());
    inStream.write({id: 1, type: 'arbitrary'});
    return end().then(([, response]) =>
      expect(response).toEqual({
        id: 1,
        type: 'error',
        exit_code: UNKNOWN_MESSAGE,
      }),
    );
  });

  describe('commands:', () => {
    let createWriteStreamImpl;
    let streamClosedPromises = [];

    function mockFiles(files) {
      writeFiles(files, '/');
    }

    function writeFiles(files, dirPath) {
      for (const key in files) {
        const entry = files[key];
        if (entry == null || typeof entry === 'string') {
          fs.writeFileSync(path.join(dirPath, key), entry || '');
        } else {
          const subDirPath = path.join(dirPath, key);
          fs.mkdirSync(subDirPath, {recursive: true});
          writeFiles(entry, subDirPath);
        }
      }
    }

    beforeAll(() => {
      createWriteStreamImpl = fs.createWriteStream;
      fs.createWriteStream = (path, options) => {
        const writeStream = createWriteStreamImpl(path, {
          ...options,
          emitClose: true,
        });
        streamClosedPromises.push(
          new Promise(resolve => {
            writeStream.on('close', resolve);
          }),
        );

        return writeStream;
      };
    });

    afterAll(() => {
      fs.createWriteStream = createWriteStreamImpl;
    });

    beforeEach(() => {
      fs.reset();
      streamClosedPromises = [];
      mockFiles({
        arbitrary: {
          args: '',
          stdout: '',
          stderr: '',
        },
        // When an error happens, the worker writes a repro file to the
        // temporary folder.
        tmp: {},
      });

      inStream.write(handshake());
    });

    afterEach(function assertThatAllWriteStreamsWereClosed() {
      return Promise.all(streamClosedPromises);
    });

    test('errors if `args_path` cannot be opened', () => {
      mockFiles({some: {'args-path': undefined}});
      inStream.write(command({id: 5, args_path: '/some/args-path'}));
      return end(2).then(([, response]) => {
        expect(response).toEqual({
          id: 5,
          type: 'error',
          exit_code: INVALID_MESSAGE,
        });
      });
    });

    test('errors if `stdout_path` cannot be opened', () => {
      const path = '/does/not/exist';
      inStream.write(command({id: 5, stdout_path: path}));
      return end(2).then(([, response]) => {
        expect(response).toEqual({
          id: 5,
          type: 'error',
          exit_code: INVALID_MESSAGE,
        });
      });
    });

    test('errors if `stderr_path` cannot be opened', () => {
      const path = '/does/not/exist';
      inStream.write(command({id: 5, stderr_path: path}));
      return end(2).then(([, response]) => {
        expect(response).toEqual({
          id: 5,
          type: 'error',
          exit_code: INVALID_MESSAGE,
        });
      });
    });

    test('errors for unspecified commands', () => {
      mockFiles({
        arbitrary: {
          file: '--flag-without-preceding-command',
        },
      });

      inStream.write(
        command({
          id: 1,
          args_path: '/arbitrary/file',
        }),
      );
      return end(2).then(([, response]) =>
        expect(response).toEqual({
          id: 1,
          type: 'error',
          exit_code: INVALID_MESSAGE,
        }),
      );
    });

    test('errors for empty commands', () => {
      mockFiles({
        arbitrary: {
          file: '',
        },
      });

      inStream.write(
        command({
          id: 2,
          args_path: '/arbitrary/file',
        }),
      );
      return end(2).then(([, response]) =>
        expect(response).toEqual({
          id: 2,
          type: 'error',
          exit_code: INVALID_MESSAGE,
        }),
      );
    });

    test('errors for unknown commands', () => {
      mockFiles({
        arbitrary: {
          file: 'arbitrary',
        },
      });

      inStream.write(
        command({
          id: 3,
          args_path: '/arbitrary/file',
        }),
      );
      return end(2).then(([, response]) =>
        expect(response).toEqual({
          id: 3,
          type: 'error',
          exit_code: INVALID_MESSAGE,
        }),
      );
    });

    test('errors if no `args_path` is specified', () => {
      inStream.write({
        id: 1,
        type: 'command',
        stdout_path: '/arbitrary',
        stderr_path: '/arbitrary',
      });
      return end().then(([, response]) =>
        expect(response).toEqual({
          id: 1,
          type: 'error',
          exit_code: INVALID_MESSAGE,
        }),
      );
    });

    test('errors if no `stdout_path` is specified', () => {
      inStream.write({
        id: 1,
        type: 'command',
        args_path: '/arbitrary',
        stderr_path: '/arbitrary',
      });
      return end().then(([, response]) =>
        expect(response).toEqual({
          id: 1,
          type: 'error',
          exit_code: INVALID_MESSAGE,
        }),
      );
    });

    test('errors if no `stderr_path` is specified', () => {
      inStream.write({
        id: 1,
        type: 'command',
        args_path: '/arbitrary',
        stdout_path: '/arbitrary',
      });
      return end(2).then(([, response]) =>
        expect(response).toEqual({
          id: 1,
          type: 'error',
          exit_code: INVALID_MESSAGE,
        }),
      );
    });

    test('passes arguments to an existing command', async () => {
      commands.transform = jest.fn();
      const args = 'foo  bar baz\tmore';
      mockFiles({
        arbitrary: {
          file: 'transform ' + args,
        },
      });

      inStream.write(
        command({
          args_path: '/arbitrary/file',
        }),
      );

      await end(2);
      expect(commands.transform).toBeCalledWith(
        args.split(/\s+/),
        null,
        anything(),
      );
    });

    test('passes JSON/structured arguments to an existing command', async () => {
      commands.transform = jest.fn();
      const args = {foo: 'bar', baz: 'glo'};
      mockFiles({
        arbitrary: {
          file: JSON.stringify({...args, command: 'transform'}),
        },
      });

      inStream.write(
        command({
          args_path: '/arbitrary/file',
        }),
      );

      await end(2);
      expect(commands.transform).toBeCalledWith([], args, anything());
    });

    test('passes a console object to the command', () => {
      mockFiles({
        args: 'transform',
        stdio: {},
      });

      commands.transform = jest.fn();

      inStream.write(
        command({
          args_path: '/args',
          stdout_path: '/stdio/out',
          stderr_path: '/stdio/err',
        }),
      );

      return end(2).then(() => {
        const streams = last(Console.mock.calls);
        expect(streams[0].path).toEqual('/stdio/out');
        expect(streams[1].path).toEqual('/stdio/err');
        expect(commands.transform).toBeCalledWith(
          anything(),
          null,
          any(Console),
        );
      });
    });

    test('responds with success if the command finishes succesfully', () => {
      commands.transform = (args, _) => {};
      mockFiles({path: {to: {args: 'transform'}}});
      inStream.write(
        command({
          id: 123,
          args_path: '/path/to/args',
        }),
      );

      return end(2).then(([, response]) =>
        expect(response).toEqual({
          id: 123,
          type: 'result',
          exit_code: 0,
        }),
      );
    });

    test('responds with error if the command does not exist', async () => {
      commands.transform = jest.fn(() => Promise.resolve());
      mockFiles({path: {to: {args: 'inexistent_command'}}});
      inStream.write(
        command({
          id: 123,
          args_path: '/path/to/args',
        }),
      );

      const [, response] = await end(2);
      expect(response).toEqual({
        id: 123,
        type: 'error',
        exit_code: 2,
      });
      expect(fs.readFileSync('/arbitrary/stderr', 'utf8')).toEqual(
        'This worker does not have a command named `inexistent_command`. Available commands are: transform',
      );
    });

    test('responds with error if the command errors asynchronously', () => {
      commands.transform = jest.fn((args, _, callback) =>
        Promise.reject(new Error('arbitrary')),
      );
      mockFiles({path: {to: {args: 'transform'}}});
      inStream.write(
        command({
          id: 123,
          args_path: '/path/to/args',
        }),
      );

      return end(2).then(([, response]) =>
        expect(response).toEqual({
          id: 123,
          type: 'error',
          exit_code: 3,
        }),
      );
    });

    test('responds with error if the command throws synchronously', () => {
      commands.transform = (args, _) => {
        throw new Error('arbitrary');
      };
      mockFiles({path: {to: {args: 'transform'}}});
      inStream.write(
        command({
          id: 456,
          args_path: '/path/to/args',
        }),
      );

      return end(2).then(([, response]) =>
        expect(response).toEqual({
          id: 456,
          type: 'error',
          exit_code: 3,
        }),
      );
    });
  });

  function end(afterMessages) {
    return new Promise((resolve, reject) => {
      worker.once('error', reject).once('end', () => resolve(written.join('')));

      if (afterMessages == null || written.length >= afterMessages) {
        inStream.end();
      } else {
        worker.on('data', () => {
          if (written.length === afterMessages) {
            inStream.end();
          }
        });
      }
    }).then(JSON.parse);
  }
});

test('terminates on ] even if stdin remains open', async () => {
  const output = [];
  await new Promise((resolve, reject) => {
    const worker = buckWorker({});
    worker.on('data', chunk => output.push(chunk));
    worker.once('error', reject);
    worker.once('end', resolve);

    const inStream = through();
    inStream.pipe(worker);
    inStream.write('[');
    inStream.write(JSON.stringify(handshake()));
    inStream.write(']');
    // do not end() the input stream
  });
  expect(JSON.parse(output.join(''))).toMatchInlineSnapshot(`
    Array [
      Object {
        "capabilities": Array [],
        "id": 0,
        "protocol_version": "0",
        "type": "handshake",
      },
    ]
  `);
});

function command(overrides) {
  return {
    id: 4, // chosen by fair dice roll
    type: 'command',
    args_path: '/arbitrary/args',
    stdout_path: '/arbitrary/stdout',
    stderr_path: '/arbitrary/stderr',
    ...overrides,
  };
}

function handshake(id = 0) {
  return {
    id,
    type: 'handshake',
    protocol_version: '0',
    capabilities: [],
  };
}

function last(arrayLike) {
  return arrayLike[arrayLike.length - 1];
}
