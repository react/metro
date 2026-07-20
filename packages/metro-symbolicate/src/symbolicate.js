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

// Symbolicates a JavaScript stack trace using a source map.
// In our first form, we read a stack trace from stdin and symbolicate it via
// the provided source map.
// In our second form, we symbolicate using an explicit line number, and
// optionally a column.
// In our third form, we symbolicate using a module ID, a line number, and
// optionally a column.

import type {Readable, Writable} from 'node:stream';
import type {ReadStream} from 'node:tty';

import * as Symbolication from './Symbolication';
import fs from 'node:fs';
import {Transform} from 'node:stream';
// $FlowFixMe[untyped-import] source-map
import {SourceMapConsumer} from 'source-map';

function printHelp() {
  const usages = [
    'Usage: ' + __filename + ' <source-map-file>',
    '       ' + __filename + ' <source-map-file> <line> [column]',
    '       ' + __filename + ' <source-map-file> <moduleId>.js <line> [column]',
    '       ' + __filename + ' <source-map-file> <mapfile>.profmap',
    '       ' +
      __filename +
      ' <source-map-file> --attribution < in.jsonl > out.jsonl',
    '       ' + __filename + ' <source-map-file> <tracefile>.cpuprofile',
    ' Optional flags:',
    '  --no-function-names',
    '  --hermes-crash (mutually exclusive with --hermes-coverage)',
    '  --hermes-coverage (mutually exclusive with --hermes-crash)',
    '  --input-line-start <line> (default: 1)',
    '  --input-column-start <column> (default: 0)',
    '  --output-line-start <line> (default: 1)',
    '  --output-column-start <column> (default: 0)',
  ];
  console.error(usages.join('\n'));
}

export default async function main(
  argvInput: Array<string> = process.argv.slice(2),
  {
    stdin,
    stderr,
    stdout,
  }: Readonly<{
    stdin: Readable | ReadStream,
    stderr: Writable,
    stdout: Writable,
    ...
  }> = process as $FlowFixMe,
): Promise<number> {
  const argv = argvInput.slice();
  function checkAndRemoveArg(arg: string, valuesPerArg: number = 0) {
    let values: null | Array<Array<string>> = null;
    for (let idx = argv.indexOf(arg); idx !== -1; idx = argv.indexOf(arg)) {
      argv.splice(idx, 1);
      values = values || [];
      values.push(argv.splice(idx, valuesPerArg));
    }
    return values;
  }

  function checkAndRemoveArgWithValue(arg: string) {
    const values = checkAndRemoveArg(arg, 1);
    return values ? values[0][0] : null;
  }
  try {
    const noFunctionNames = checkAndRemoveArg('--no-function-names');
    const isHermesCrash = checkAndRemoveArg('--hermes-crash');
    const isCoverage = checkAndRemoveArg('--hermes-coverage');
    const inputLineStart = Number.parseInt(
      checkAndRemoveArgWithValue('--input-line-start') || '1',
      10,
    );
    const inputColumnStart = Number.parseInt(
      checkAndRemoveArgWithValue('--input-column-start') || '0',
      10,
    );
    const outputLineStart = Number.parseInt(
      checkAndRemoveArgWithValue('--output-line-start') || '1',
      10,
    );
    const outputColumnStart = Number.parseInt(
      checkAndRemoveArgWithValue('--output-column-start') || '0',
      10,
    );

    if (argv.length < 1 || argv.length > 4) {
      /* eslint no-path-concat: "off" */
      printHelp();
      return 1;
    }

    if (isHermesCrash && isCoverage) {
      console.error(
        'Pass either --hermes-crash or --hermes-coverage, not both',
      );
      printHelp();
      return 1;
    }

    // Read the source map.
    const sourceMapFileName = argv.shift();
    const options = {
      nameSource: noFunctionNames ? 'identifier_names' : 'function_names',
      inputLineStart,
      inputColumnStart,
      outputLineStart,
      outputColumnStart,
    };
    let context;
    // $FlowFixMe[incompatible-type]
    if (fs.lstatSync(sourceMapFileName).isDirectory()) {
      context = Symbolication.unstable_createDirectoryContext(
        SourceMapConsumer,
        // $FlowFixMe[incompatible-type]
        sourceMapFileName,
        /* $FlowFixMe[incompatible-type] Natural Inference rollout. See
         * https://fburl.com/workplace/6291gfvu */
        options,
      );
    } else {
      // $FlowFixMe[incompatible-type]
      const content = fs.readFileSync(sourceMapFileName, 'utf8');
      context = Symbolication.createContext(
        SourceMapConsumer,
        content,
        /* $FlowFixMe[incompatible-type] Natural Inference rollout. See
         * https://fburl.com/workplace/6291gfvu */
        options,
      );
    }
    if (argv.length === 0) {
      const stackTrace = await readAll(stdin);
      if (isHermesCrash) {
        const stackTraceJSON = JSON.parse(stackTrace);
        const symbolicatedTrace =
          context.symbolicateHermesMinidumpTrace(stackTraceJSON);
        stdout.write(JSON.stringify(symbolicatedTrace));
      } else if (isCoverage) {
        const stackTraceJSON = JSON.parse(stackTrace);
        const symbolicatedTrace =
          context.symbolicateHermesCoverageTrace(stackTraceJSON);
        stdout.write(JSON.stringify(symbolicatedTrace));
      } else {
        stdout.write(context.symbolicate(stackTrace));
      }
    } else if (argv[0].endsWith('.profmap')) {
      stdout.write(context.symbolicateProfilerMap(argv[0]));
    } else if (
      argv[0].endsWith('.heapsnapshot') ||
      argv[0].endsWith('.heaptimeline')
    ) {
      stdout.write(
        JSON.stringify(
          context.symbolicateHeapSnapshot(fs.readFileSync(argv[0], 'utf8')),
        ),
      );
    } else if (argv[0] === '--attribution') {
      let lineBuffer = '';

      const streamToLines: Transform = new Transform({
        transform(data, _enc, callback) {
          // Take arbitrary strings, output single lines
          lineBuffer += data.toString();
          const lines = lineBuffer.split('\n');
          for (let i = 0, e = lines.length - 1; i < e; i++) {
            streamToLines.push(lines[i]);
          }
          lineBuffer = lines[lines.length - 1];
          callback();
        },
      });

      const symbolicateLines: Transform = new Transform({
        transform(data, enc, callback) {
          // This is JSONL, so each line is a separate JSON object
          const obj = JSON.parse(data.toString());
          context.symbolicateAttribution(obj);
          symbolicateLines.push(JSON.stringify(obj) + '\n');
          callback();
        },
        objectMode: true,
      });

      await waitForStream(
        stdin.pipe(streamToLines).pipe(symbolicateLines).pipe(stdout),
      );
    } else if (argv[0].endsWith('.cpuprofile')) {
      // NOTE: synchronous
      context.symbolicateChromeTrace(argv[0], {stdout, stderr});
    } else {
      // read-from-argv form.
      let moduleIds;
      if (argv[0].endsWith('.js')) {
        moduleIds = context.parseFileName(argv[0]);
        argv.shift();
      } else {
        moduleIds = null;
      }
      const lineNumber = argv.shift();
      const columnNumber = argv.shift() || 0;
      const original = context.getOriginalPositionFor(
        +lineNumber,
        +columnNumber,
        // $FlowFixMe[incompatible-type] context is a union here and so this parameter is a union
        moduleIds,
      );
      stdout.write(
        [
          original.source ?? 'null',
          original.line ?? 'null',
          original.name ?? 'null',
        ].join(':') + '\n',
      );
    }
  } catch (error) {
    stderr.write(error + '\n');
    return 1;
  }
  return 0;
}

function readAll(stream: Readable | ReadStream) {
  return new Promise<string>(resolve => {
    let data = '';
    if (stream.isTTY === true) {
      resolve(data);
      return;
    }

    stream.setEncoding('utf8');
    stream.on('readable', () => {
      let chunk;
      // flowlint-next-line sketchy-null-string:off
      while ((chunk = stream.read())) {
        data += chunk.toString();
      }
    });
    stream.on('end', () => {
      resolve(data);
    });
  });
}

function waitForStream(stream: $FlowFixMe) {
  return new Promise(resolve => {
    stream.on('finish', resolve);
  });
}
