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

import symbolicate from '../symbolicate';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {PassThrough} = require('node:stream');

jest.useRealTimers();

const resolve = (fileName: string) =>
  path.resolve(__dirname, '__fixtures__', fileName);
const read = (fileName: string) => fs.readFileSync(resolve(fileName), 'utf8');

const execute = async (
  args: Array<string>,
  stdin?: string,
): Promise<string> => {
  const streams = {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
  };
  const stdout = [];
  const errorMessage = ['Process failed with the following output:\n======\n'];
  streams.stdout.on('data', data => {
    errorMessage.push(data);
    stdout.push(data);
  });
  streams.stderr.on('data', data => {
    errorMessage.push(data);
  });
  if (stdin != null) {
    streams.stdin.write(stdin);
    streams.stdin.end();
  }
  const code = await symbolicate(args, streams);

  if (code !== 0) {
    errorMessage.push('======\n');
    throw new Error(errorMessage.join(''));
  }
  return stdout.join('');
};

const TEMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'symbolicate-'));
const TEMP_FILE = path.resolve(TEMP_DIR, 'testfile.temp.cpuprofile');
afterAll(() => {
  try {
    fs.rmdirSync(TEMP_DIR);
  } catch (e) {}
});

const TESTFILE_MAP = resolve('testfile.js.map');
const WITH_FUNCTION_MAP_MAP = resolve('with-function-map.js.map');
const TESTFILE_RAM_MAP = resolve('testfile.ram.js.map');
const HERMES_MAP = resolve('hermes.js.hbc.map');
const HERMES_MAP_CJS = resolve('hermescjs.js.hbc.map');

describe('hermes-crash option', () => {
  test('symbolicating a hermes stack trace', async () => {
    const output = JSON.parse(
      await execute(
        [HERMES_MAP, '--hermes-crash'],
        read('hermesStackTrace.json'),
      ),
    );
    expect(output).toMatchSnapshot();
  });

  test('symbolicating a hermes stack trace with input-line-start and input-column-start', async () => {
    const output0Based = JSON.parse(
      await execute(
        [
          HERMES_MAP,
          '--hermes-crash',
          '--input-line-start',
          '0',
          '--input-column-start',
          '0',
        ],
        read('hermesStackTrace.json'),
      ),
    );
    const output1Based = JSON.parse(
      await execute(
        [
          HERMES_MAP,
          '--hermes-crash',
          '--input-line-start',
          '1',
          '--input-column-start',
          '1',
        ],
        read('hermesStackTrace.json'),
      ),
    );
    const outputNoFlag = JSON.parse(
      await execute(
        [HERMES_MAP, '--hermes-crash'],
        read('hermesStackTrace.json'),
      ),
    );
    expect(outputNoFlag).toMatchObject(output0Based);
    expect(outputNoFlag).toMatchObject(output1Based);
  });

  test('symbolicating a hermes stack trace CJS', async () => {
    const output = JSON.parse(
      await execute(
        [HERMES_MAP_CJS, '--hermes-crash'],
        read('hermesStackTraceCJS.json'),
      ),
    );
    expect(output).toMatchSnapshot();
  });

  test('symbolicating a hermes stack trace CJS with SegmentID', async () => {
    const output = JSON.parse(
      await execute(
        [HERMES_MAP_CJS, '--hermes-crash'],
        read('hermesStackTraceCJS-SegmentID.json'),
      ),
    );
    expect(output).toMatchSnapshot();
  });
});

describe('coverage option', () => {
  test('ignores input-line-start and input-column-start', async () => {
    const output0Based = JSON.parse(
      await execute(
        [
          HERMES_MAP_CJS,
          '--hermes-coverage',
          '--input-line-start',
          '0',
          '--input-column-start',
          '0',
        ],
        read('coverageStackTraceCJS.json'),
      ),
    );
    const output1Based = JSON.parse(
      await execute(
        [
          HERMES_MAP_CJS,
          '--hermes-coverage',
          '--input-line-start',
          '1',
          '--input-column-start',
          '1',
        ],
        read('coverageStackTraceCJS.json'),
      ),
    );
    const outputNoFlag = JSON.parse(
      await execute(
        [HERMES_MAP_CJS, '--hermes-coverage'],
        read('coverageStackTraceCJS.json'),
      ),
    );
    expect(outputNoFlag).toMatchObject(output0Based);
    expect(outputNoFlag).toMatchObject(output1Based);
  });

  test('symbolicating a coverage stack trace CJS', async () => {
    const output = JSON.parse(
      await execute(
        [HERMES_MAP_CJS, '--hermes-coverage'],
        read('coverageStackTraceCJS.json'),
      ),
    );
    expect(output).toMatchSnapshot();
  });

  test('symbolicating a coverage stack trace Classic', async () => {
    const output = JSON.parse(
      await execute(
        [HERMES_MAP, '--hermes-coverage'],
        read('coverageStackTrace.json'),
      ),
    );
    expect(output).toMatchSnapshot();
  });

  test('symbolicating a CJS stack trace ignores the module id of the file name', async () => {
    const output = await execute([HERMES_MAP_CJS, '5.js', '52', '83']);
    expect(output).toMatchSnapshot();
  });

  test('symbolicating a CJS stack trace ignores the segment id of the file name', async () => {
    const output = await execute([HERMES_MAP_CJS, 'seg-5.js', '52', '83']);
    expect(output).toMatchSnapshot();
  });
});

test('symbolicating a stack trace', async () =>
  await expect(
    execute([TESTFILE_MAP], read('testfile.stack')),
  ).resolves.toMatchSnapshot());

test('symbolicating a stack trace in Node format', async () =>
  await expect(
    execute([TESTFILE_MAP], read('testfile.node.stack')),
  ).resolves.toMatchSnapshot());

test('symbolicating a single entry', async () =>
  await expect(execute([TESTFILE_MAP, '1', '161'])).resolves.toEqual(
    'thrower.js:18:null\n',
  ));

test('symbolicating a single entry with 0-based line output', async () =>
  await expect(
    execute([TESTFILE_MAP, '1', '161', '--output-line-start', '0']),
  ).resolves.toEqual('thrower.js:17:null\n'));

test('symbolicating a single entry with 1-based column input', async () =>
  await expect(
    execute([TESTFILE_MAP, '1', '161', '--input-column-start', '1']),
  ).resolves.toEqual('thrower.js:18:Error\n'));

test('symbolicating a single entry with 0-based line input', async () =>
  await expect(
    execute([TESTFILE_MAP, '0', '161', '--input-line-start', '0']),
  ).resolves.toEqual('thrower.js:18:null\n'));

test('symbolicating a single entry with an out of range column', async () =>
  await expect(execute([TESTFILE_MAP, '1', '1000000'])).resolves.toEqual(
    'thrower.js:1:null\n',
  ));

test('symbolicating a single entry with out of range line', async () =>
  await expect(execute([TESTFILE_MAP, '1000000', '161'])).resolves.toEqual(
    'null:null:null\n',
  ));

test('symbolicating a sectioned source map', async () =>
  await expect(
    execute([resolve('testfile.sectioned.js.map'), '353.js', '1', '72']),
  ).resolves.toEqual('nested-thrower.js:6:start\n'));

test('symbolicating a profiler map', async () =>
  await expect(
    execute([TESTFILE_MAP, resolve('testfile.profmap')]),
  ).resolves.toMatchSnapshot());

test('symbolicating an attribution file', async () =>
  await expect(
    execute(
      [TESTFILE_MAP, '--attribution'],
      read('testfile.attribution.input'),
    ),
  ).resolves.toMatchSnapshot());

test('symbolicating an attribution file with 1-based column output', async () =>
  await expect(
    execute(
      [TESTFILE_MAP, '--attribution', '--output-column-start', '1'],
      read('testfile.attribution.input'),
    ),
  ).resolves.toMatchSnapshot());

describe('symbolicating an attribution file specifying unmapped offsets', () => {
  const attribute = async (
    obj:
      | {
          functionId: number,
          location: {bytecodeSize: number, virtualOffset: number},
          usage: Array<$FlowFixMe>,
        }
      | {
          functionId: number,
          location: {virtualOffset: number},
          usage: Array<$FlowFixMe>,
        },
  ) =>
    (
      await execute(
        [resolve('testfile.partial.js.map'), '--attribution'],
        JSON.stringify(obj) + '\n',
      )
    )
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line));

  test('Lookup falls before all mappings with no non-null mapping in range', async () =>
    await expect(
      attribute({
        functionId: 0,
        location: {virtualOffset: 0, bytecodeSize: 5},
        usage: [],
      }),
    ).resolves.toMatchInlineSnapshot(`
            Array [
              Object {
                "functionId": 0,
                "location": Object {
                  "column": null,
                  "file": null,
                  "line": null,
                },
                "usage": Array [],
              },
            ]
          `));

  test('Lookup finds a null mapping and falls back to a non-null mapping in range', async () =>
    await expect(
      attribute({
        functionId: 1,
        location: {virtualOffset: 5, bytecodeSize: 2},
        usage: [],
      }),
    ).resolves.toMatchInlineSnapshot(`
            Array [
              Object {
                "functionId": 1,
                "location": Object {
                  "column": 1,
                  "file": "foo.js",
                  "line": 2,
                },
                "usage": Array [],
              },
            ]
          `));

  test('Lookup finds a null mapping with no bytecodeSize specified', async () =>
    await expect(
      attribute({
        functionId: 1,
        location: {virtualOffset: 5},
        usage: [],
      }),
    ).resolves.toMatchInlineSnapshot(`
            Array [
              Object {
                "functionId": 1,
                "location": Object {
                  "column": null,
                  "file": null,
                  "line": null,
                },
                "usage": Array [],
              },
            ]
          `));

  test('Lookup finds a null mapping with no non-null mapping in range', async () =>
    await expect(
      attribute({
        functionId: 2,
        location: {virtualOffset: 11, bytecodeSize: 1},
        usage: [],
      }),
    ).resolves.toMatchInlineSnapshot(`
            Array [
              Object {
                "functionId": 2,
                "location": Object {
                  "column": null,
                  "file": null,
                  "line": null,
                },
                "usage": Array [],
              },
            ]
          `));

  test('Lookup finds the last mapping and it is null', async () =>
    await expect(
      attribute({
        functionId: 3,
        location: {virtualOffset: 17, bytecodeSize: 1},
        usage: [],
      }),
    ).resolves.toMatchInlineSnapshot(`
            Array [
              Object {
                "functionId": 3,
                "location": Object {
                  "column": null,
                  "file": null,
                  "line": null,
                },
                "usage": Array [],
              },
            ]
          `));
});

test('symbolicating with a cpuprofile', async () => {
  fs.copyFileSync(resolve('testfile.cpuprofile'), TEMP_FILE);

  await execute([resolve('testfile.cpuprofile.map'), TEMP_FILE]);

  expect(JSON.parse(read(TEMP_FILE))).toMatchSnapshot();
});

test('symbolicating with a cpuprofile ignoring a function map', async () => {
  fs.copyFileSync(resolve('testfile.cpuprofile'), TEMP_FILE);

  await execute([
    '--no-function-names',
    resolve('testfile.cpuprofile.map'),
    TEMP_FILE,
  ]);

  expect(JSON.parse(read(TEMP_FILE))).toMatchSnapshot();
});

test('symbolicating a stack trace with a function map', async () =>
  await expect(
    execute([WITH_FUNCTION_MAP_MAP], read('with-function-map.stack')),
  ).resolves.toMatchSnapshot());

test('symbolicating a stack trace with a segmented RAM bundle map', async () =>
  await expect(
    execute([TESTFILE_RAM_MAP], read('testfile.ram.stack')),
  ).resolves.toMatchSnapshot());

test('symbolicating a stack trace ignoring a function map', async () =>
  await expect(
    execute(
      ['--no-function-names', WITH_FUNCTION_MAP_MAP],
      read('with-function-map.stack'),
    ),
  ).resolves.toMatchSnapshot());

describe('directory context', () => {
  test('symbolicating a stack trace', async () =>
    await expect(
      execute([resolve('directory')], read('directory/test.stack')),
    ).resolves.toMatchSnapshot());

  test('symbolicating a stack trace with absolute paths', async () => {
    const dirPath = resolve('directory');
    const stack =
      `someFunc@${dirPath}/foo.js:4:0` +
      '\n' +
      `someOtherFunc@${dirPath}/subdir1/bar.js:255:6` +
      '\n' +
      `fn@${dirPath}/fileThatDoesntExist.js:10:20` +
      '\n';
    const symbolicated = (await execute([dirPath], stack))
      // No replaceAll in Node 12.x
      .split(__dirname)
      .join('<testDir>');
    expect(symbolicated).toMatchSnapshot();
  });

  test('does not read source maps outside the root dir, with relative or absolute paths', async () => {
    const dirPath = resolve('directory');
    const parentDirPath = path.resolve(dirPath, '..');
    const stack =
      `func@${parentDirPath}/testfile.js:1:1` +
      '\n' +
      'func@../testfile.js:1:1' +
      '\n';
    const symbolicated = (await execute([dirPath], stack))
      // No replaceAll in Node 12.x
      .split(__dirname)
      .join('<testDir>');
    expect(symbolicated).toMatchSnapshot();
  });
});
