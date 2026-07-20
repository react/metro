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

const {ChromeHeapSnapshotProcessor} = require('../ChromeHeapSnapshot');
const fs = require('node:fs');
const path = require('node:path');
const {PassThrough} = require('node:stream');

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

describe('heap snapshots/timelines', () => {
  test('symbolicating allocation stacks', async () => {
    function findKnownAllocationStack(heapSnapshotStr: string) {
      const rawData = JSON.parse(heapSnapshotStr);
      const data = new ChromeHeapSnapshotProcessor(rawData);
      const node = findObjectByInboundProperty('RETAIN_ME', data, rawData);
      return getStackTrace(node.getNumber('trace_node_id'), data);
    }

    const symbolicated = await execute([
      resolve('GenSampleHeapSnapshotBundle.js.map'),
      resolve('GenSampleHeapSnapshotBundle.js.heaptimeline'),
    ]);

    // Snapshot the original unsymbolicated trace for easy comparison
    const unsymbolicated = read('GenSampleHeapSnapshotBundle.js.heaptimeline');
    expect(findKnownAllocationStack(unsymbolicated)).toMatchSnapshot(
      'unsymbolicated',
    );
    expect(findKnownAllocationStack(symbolicated)).toMatchSnapshot(
      'symbolicated',
    );
  });
});

// Returns a node in the heap snapshot that has an incoming property edge with
// the name passed as `propertyName`.
function findObjectByInboundProperty(
  propertyName: string,
  data: ChromeHeapSnapshotProcessor,
  rawData: $FlowFixMe,
) {
  const sigilStrIndex = rawData.strings.indexOf(propertyName);
  for (const edge of data.edges()) {
    if (
      edge.getNumber('name_or_index') === sigilStrIndex &&
      edge.getString('type') === 'property'
    ) {
      const nodeIt = data.nodes();
      nodeIt.moveToRecord(
        edge.getNumber('to_node') / rawData.snapshot.meta.node_fields.length,
      );
      return nodeIt;
    }
  }
  throw new Error(
    `Could not find an object with an inbound property edge '${propertyName}'`,
  );
}

// Find a given trace node in the trace tree and record the path from the root
// (reversed and translated into readable stack frames).
function getStackTrace(traceNodeId: number, data: ChromeHeapSnapshotProcessor) {
  const functionInfoStack = [];
  const FOUND = Symbol('FOUND');

  /* $FlowFixMe[missing-local-annot] The type annotation(s) required by Flow's
   * LTI update could not be added via codemod */
  function visit(traceNode): void {
    functionInfoStack.push(traceNode.getNumber('function_info_index'));
    if (traceNode.getNumber('id') === traceNodeId) {
      throw FOUND;
    }
    for (const child of traceNode.getChildren('children')) {
      visit(child);
    }
    functionInfoStack.pop();
  }

  for (const traceRoot of data.traceTree()) {
    try {
      visit(traceRoot);
    } catch (e) {
      if (e === FOUND) {
        break;
      }
      throw e;
    }
  }

  const frameIt = data.traceFunctionInfos();
  return functionInfoStack
    .reverse()
    .map(index => {
      frameIt.moveToRecord(index);
      const name = frameIt.getString('name');
      const scriptName = frameIt.getString('script_name');
      const line = frameIt.getNumber('line');
      const column = frameIt.getNumber('column');
      return `${name} @ ${scriptName}:${line}:${column}`;
    })
    .join('\n');
}
