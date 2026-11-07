/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 * @format
 * @oncall react_native
 */

'use strict';

import type {ChromeHeapSnapshot} from '../ChromeHeapSnapshot';

import {ChromeHeapSnapshotProcessor} from '../ChromeHeapSnapshot';

const SNAPSHOT_COMMON: Pick<ChromeHeapSnapshot, 'snapshot'> = {
  snapshot: {
    meta: {
      node_fields: [
        'type',
        'name',
        'id',
        'self_size',
        'edge_count',
        'trace_node_id',
        'detachedness',
      ],
      node_types: [
        [
          'hidden',
          'array',
          'string',
          'object',
          'code',
          'closure',
          'regexp',
          'number',
          'native',
          'synthetic',
          'concatenated string',
          'sliced string',
          'symbol',
          'bigint',
        ],
        'string',
        'number',
        'number',
        'number',
        'number',
        'number',
      ],
      edge_fields: ['type', 'name_or_index', 'to_node'],
      edge_types: [
        [
          'context',
          'element',
          'property',
          'internal',
          'hidden',
          'shortcut',
          'weak',
        ],
        'string_or_number',
        'node',
      ],
      trace_function_info_fields: [
        'function_id',
        'name',
        'script_name',
        'script_id',
        'line',
        'column',
      ],
      trace_node_fields: [
        'id',
        'function_info_index',
        'count',
        'size',
        'children',
      ],
      sample_fields: ['timestamp_us', 'last_assigned_id'],
      location_fields: ['object_index', 'script_id', 'line', 'column'],
    },
    node_count: 0,
    edge_count: 0,
    trace_function_count: 0,
  },
};

describe('ChromeHeapSnapshotProcessor', () => {
  describe('empty buffers', () => {
    let data: ChromeHeapSnapshot;
    beforeEach(() => {
      data = {
        ...SNAPSHOT_COMMON,
        edges: [],
        locations: [],
        nodes: [],
        samples: [],
        strings: [],
        trace_function_infos: [],
        trace_tree: [],
      };
    });

    test('iterating past the end', () => {
      const processor = new ChromeHeapSnapshotProcessor(data);
      const it = processor.nodes();
      expect(it.next().done).toBe(true);
      expect(it.next().done).toBe(true);
    });

    test('accessing data before start', () => {
      const processor = new ChromeHeapSnapshotProcessor(data);
      const it = processor.edges();
      expect(() => {
        it.getString('type');
      }).toThrowError('Position -3 is out of range');
    });

    test('accessing data after end', () => {
      const processor = new ChromeHeapSnapshotProcessor(data);
      const it = processor.edges();
      expect(it.next().done).toBe(true);
      expect(() => {
        it.getString('type');
      }).toThrowError('Position -3 is out of range');
    });

    test('using the iterator protocol', () => {
      const processor = new ChromeHeapSnapshotProcessor(data);
      const neverCalled = jest.fn();
      for (const it of processor.traceFunctionInfos()) {
        neverCalled(it);
      }
      expect(neverCalled).not.toBeCalled();
    });

    test('appending', () => {
      const processor = new ChromeHeapSnapshotProcessor(data);
      const it = processor.nodes();
      const index = it.append({
        type: 'synthetic',
        name: 'Node #0',
        id: 1,
        self_size: 0,
        edge_count: 0,
        trace_node_id: 0,
        detachedness: 0,
      });
      expect(index).toBe(0);

      expect(it.next().done).toBe(false);
      expect(it.getString('type')).toBe('synthetic');
      expect(it.getString('name')).toBe('Node #0');
      expect(it.getNumber('id')).toBe(1);
      expect(it.getNumber('self_size')).toBe(0);
      expect(it.getNumber('edge_count')).toBe(0);
      expect(it.getNumber('trace_node_id')).toBe(0);
      expect(it.getNumber('detachedness')).toBe(0);

      expect(it.next().done).toBe(true);
    });

    test('inserting', () => {
      const processor = new ChromeHeapSnapshotProcessor(data);
      const it = processor.nodes();
      const index = it.moveAndInsert(0, {
        type: 'synthetic',
        name: 'Node #0',
        id: 1,
        self_size: 0,
        edge_count: 0,
        trace_node_id: 0,
        detachedness: 0,
      });
      expect(index).toBe(0);

      expect(it.getString('type')).toBe('synthetic');
      expect(it.getString('name')).toBe('Node #0');
      expect(it.getNumber('id')).toBe(1);
      expect(it.getNumber('self_size')).toBe(0);
      expect(it.getNumber('edge_count')).toBe(0);
      expect(it.getNumber('trace_node_id')).toBe(0);
      expect(it.getNumber('detachedness')).toBe(0);

      expect(it.next().done).toBe(true);
    });
  });

  describe('accessing data', () => {
    let data: ChromeHeapSnapshot;
    beforeEach(() => {
      data = {
        ...SNAPSHOT_COMMON,
        locations: [] as Array<number>,
        nodes: [
          // -- Node #0 --
          /* type (synthetic) */ 9, /* name */ 0, /* id */ 1, /* self_size */ 0,
          /* edge_count */ 1, /* trace_node_id */ 0, /* detachedness */ 0,

          // -- Node #1 --
          /* type (native) */ 8, /* name */ 1, /* id */ 43,
          /* self_size */ 4320, /* edge_count */ 0, /* trace_node_id */ 0,
          /* detachedness */ 0,
        ],
        edges: [
          // -- Edge #0 --
          /* type (element) */ 1, /* name_or_index */ 1,
          /* to_node (Node #1) */ 7,
        ],
        samples: [],
        strings: [
          'Node #0',
          'Node #1',
          'Trace function info #0 name',
          'Trace function info #0 script_name',
        ],
        trace_function_infos: [
          // -- Trace function info #0 --
          /* function_id */ 0, /* name */ 2, /* script_name */ 3,
          /* script_id */ 0, /* line */ 10, /* column */ 20,
        ],
        trace_tree: [
          /* id */ 1,
          /* function_info_index */ 0,
          /* count */ 0,
          /* size */ 0,
          /* children */ [
            /* id */ 2,
            /* function_info_index */ 0,
            /* count */ 1,
            /* size */ 40,
            /* children */ [],

            /* id */ 3,
            /* function_info_index */ 0,
            /* count */ 0,
            /* size */ 42,
            /* children */ [],
          ],
        ],
      };
    });

    test('nodes', () => {
      const processor = new ChromeHeapSnapshotProcessor(data);
      const it = processor.nodes();

      expect(it.next().done).toBe(false);
      expect(it.getString('type')).toBe('synthetic');
      expect(it.getString('name')).toBe('Node #0');
      expect(it.getNumber('id')).toBe(1);
      expect(it.getNumber('self_size')).toBe(0);
      expect(it.getNumber('edge_count')).toBe(1);
      expect(it.getNumber('trace_node_id')).toBe(0);
      expect(it.getNumber('detachedness')).toBe(0);

      expect(it.next().done).toBe(false);
      expect(it.getString('type')).toBe('native');
      expect(it.getString('name')).toBe('Node #1');
      expect(it.getNumber('id')).toBe(43);
      expect(it.getNumber('self_size')).toBe(4320);
      expect(it.getNumber('edge_count')).toBe(0);
      expect(it.getNumber('trace_node_id')).toBe(0);
      expect(it.getNumber('detachedness')).toBe(0);

      expect(it.next().done).toBe(true);
    });

    test('nodes with moveToRecord', () => {
      const processor = new ChromeHeapSnapshotProcessor(data);
      const it = processor.nodes();

      it.moveToRecord(1);
      expect(it.getString('type')).toBe('native');
      expect(it.getString('name')).toBe('Node #1');
      expect(it.getNumber('id')).toBe(43);
      expect(it.getNumber('self_size')).toBe(4320);
      expect(it.getNumber('edge_count')).toBe(0);
      expect(it.getNumber('trace_node_id')).toBe(0);
      expect(it.getNumber('detachedness')).toBe(0);

      it.moveToRecord(0);
      expect(it.getString('type')).toBe('synthetic');
      expect(it.getString('name')).toBe('Node #0');
      expect(it.getNumber('id')).toBe(1);
      expect(it.getNumber('self_size')).toBe(0);
      expect(it.getNumber('edge_count')).toBe(1);
      expect(it.getNumber('trace_node_id')).toBe(0);
      expect(it.getNumber('detachedness')).toBe(0);

      // Invalid index doesn't move the iterator
      expect(() => it.moveToRecord(-1)).toThrow('Position -7 is out of range');
      expect(() => it.moveToRecord(2)).toThrow('Position 14 is out of range');

      // Can continue to advance from the last valid position
      expect(it.next().done).toBe(false);
      expect(it.next().done).toBe(true);
    });

    test('edges', () => {
      const processor = new ChromeHeapSnapshotProcessor(data);
      const it = processor.edges();

      expect(it.next().done).toBe(false);
      expect(it.getString('type')).toBe('element');
      expect(it.getNumber('name_or_index')).toBe(1);
      expect(it.getNumber('to_node')).toBe(7);

      expect(it.next().done).toBe(true);
    });

    test('trace_function_infos', () => {
      const processor = new ChromeHeapSnapshotProcessor(data);
      const it = processor.traceFunctionInfos();

      expect(it.next().done).toBe(false);
      expect(it.getNumber('function_id')).toBe(0);
      expect(it.getString('name')).toBe('Trace function info #0 name');
      expect(it.getString('script_name')).toBe(
        'Trace function info #0 script_name',
      );
      expect(it.getNumber('script_id')).toBe(0);
      expect(it.getNumber('line')).toBe(10);
      expect(it.getNumber('column')).toBe(20);

      expect(it.next().done).toBe(true);
    });

    test('trace_tree', () => {
      const processor = new ChromeHeapSnapshotProcessor(data);
      const it = processor.traceTree();

      expect(it.next().done).toBe(false);
      expect(it.getNumber('id')).toBe(1);
      expect(it.getNumber('function_info_index')).toBe(0);
      expect(it.getNumber('count')).toBe(0);
      expect(it.getNumber('size')).toBe(0);

      const childIt = it.getChildren('children');

      // childIt is its own iterator, we can advance the parent iterator
      expect(it.next().done).toBe(true);

      expect(childIt.next().done).toBe(false);
      expect(childIt.getNumber('id')).toBe(2);
      expect(childIt.getNumber('function_info_index')).toBe(0);
      expect(childIt.getNumber('count')).toBe(1);
      expect(childIt.getNumber('size')).toBe(40);
      expect(childIt.getChildren('children').next().done).toBe(true);

      expect(childIt.next().done).toBe(false);
      expect(childIt.getNumber('id')).toBe(3);
      expect(childIt.getNumber('function_info_index')).toBe(0);
      expect(childIt.getNumber('count')).toBe(0);
      expect(childIt.getNumber('size')).toBe(42);
      expect(childIt.getChildren('children').next().done).toBe(true);

      expect(childIt.next().done).toBe(true);
    });

    test('rewriting node name (string field)', () => {
      const processor = new ChromeHeapSnapshotProcessor(data);
      const it = processor.nodes();

      expect(it.next().done).toBe(false);
      expect(it.getString('name')).toBe('Node #0');

      // We can set the same field multiple times, to seen or unseen strings
      it.setString('name', 'foo');
      it.setString('name', 'Node #0');
      it.setString('name', 'Node #1');
      it.setString('name', 'foo');

      // We can read back the new data via the API
      expect(it.getString('name')).toBe('foo');

      // Confirm that the underlying data is what we wrote
      expect(
        data.strings[
          data.nodes[
            0 * data.snapshot.meta.node_fields.length +
              data.snapshot.meta.node_fields.indexOf('name')
          ]
        ],
      ).toBe('foo');

      // New strings are deduplicated, old strings are kept around for simplicity.
      expect(new Set(data.strings).size).toBe(data.strings.length);

      // Iteration continues correctly and we can keep reading data
      expect(it.next().done).toBe(false);
      expect(it.getString('name')).toBe('Node #1');

      expect(it.next().done).toBe(true);
    });

    test('rewriting node self_size (number field)', () => {
      const processor = new ChromeHeapSnapshotProcessor(data);
      const it = processor.nodes();

      expect(it.next().done).toBe(false);
      expect(it.next().done).toBe(false);
      expect(it.getNumber('self_size')).toBe(4320);

      // We can set the same field multiple times
      it.setNumber('self_size', 1);
      it.setNumber('self_size', 2);
      it.setNumber('self_size', 3);
      it.setNumber('self_size', 42);

      // We can read back the new data via the API
      expect(it.getNumber('self_size')).toBe(42);

      // Confirm that the underlying data is what we wrote
      expect(
        data.nodes[
          1 * data.snapshot.meta.node_fields.length +
            data.snapshot.meta.node_fields.indexOf('self_size')
        ],
      ).toBe(42);

      // Iteration ends correctly
      expect(it.next().done).toBe(true);
    });

    test('rewriting edge type (enum field)', () => {
      const processor = new ChromeHeapSnapshotProcessor(data);
      const it = processor.edges();

      expect(it.next().done).toBe(false);
      expect(it.getString('type')).toBe('element');
      it.setString('type', 'property');

      // We can read back the new data via the API
      expect(it.getString('type')).toBe('property');

      // Confirm that the underlying data is what we wrote
      expect(
        data.snapshot.meta.edge_types[
          data.snapshot.meta.edge_fields.indexOf('type')
        ][
          data.edges[
            0 * data.snapshot.meta.edge_fields.length +
              data.snapshot.meta.edge_fields.indexOf('type')
          ]
        ],
      ).toBe('property');

      expect(() => {
        it.setString('type', 'foo');
      }).toThrowError(/Cannot define new values in enum field/);

      // Iteration ends correctly
      expect(it.next().done).toBe(true);
    });

    test('inserting a node', () => {
      const processor = new ChromeHeapSnapshotProcessor(data);
      const it = processor.nodes();

      const index = it.moveAndInsert(1, {
        type: 'synthetic',
        name: 'Node #0.5',
        id: 1000,
        self_size: 0,
        edge_count: 0,
        trace_node_id: 0,
        detachedness: 0,
      });
      expect(index).toBe(1);
      expect(it.getString('name')).toBe('Node #0.5');

      it.moveToRecord(0);
      expect(it.getString('name')).toBe('Node #0');

      expect(it.next().done).toBe(false);
      expect(it.getString('name')).toBe('Node #0.5');

      expect(it.next().done).toBe(false);
      expect(it.getString('name')).toBe('Node #1');

      expect(it.next().done).toBe(true);
    });

    test('appending a node', () => {
      const processor = new ChromeHeapSnapshotProcessor(data);
      const it = processor.nodes();

      const index = it.append({
        type: 'synthetic',
        name: 'Node #2',
        id: 1000,
        self_size: 0,
        edge_count: 0,
        trace_node_id: 0,
        detachedness: 0,
      });
      expect(index).toBe(2);

      expect(it.next().done).toBe(false);
      expect(it.getString('name')).toBe('Node #0');

      expect(it.next().done).toBe(false);
      expect(it.getString('name')).toBe('Node #1');

      expect(it.next().done).toBe(false);
      expect(it.getString('name')).toBe('Node #2');

      expect(it.next().done).toBe(true);
    });

    test('appending a subtree to trace_tree', () => {
      const processor = new ChromeHeapSnapshotProcessor(data);
      const it = processor.traceTree();
      let childIt;

      const index = it.append({
        id: 100,
        function_info_index: 0,
        count: 100,
        size: 100,
        children: [
          {
            id: 101,
            function_info_index: 0,
            count: 50,
            size: 50,
            children: [],
          },
        ],
      });
      expect(index).toBe(1);

      // The existing data
      expect(it.next().done).toBe(false);
      expect(it.getNumber('id')).toBe(1);
      expect(it.getNumber('function_info_index')).toBe(0);
      expect(it.getNumber('count')).toBe(0);
      expect(it.getNumber('size')).toBe(0);

      childIt = it.getChildren('children');

      expect(childIt.next().done).toBe(false);
      expect(childIt.getNumber('id')).toBe(2);
      expect(childIt.getNumber('function_info_index')).toBe(0);
      expect(childIt.getNumber('count')).toBe(1);
      expect(childIt.getNumber('size')).toBe(40);
      expect(childIt.getChildren('children').next().done).toBe(true);

      expect(childIt.next().done).toBe(false);
      expect(childIt.getNumber('id')).toBe(3);
      expect(childIt.getNumber('function_info_index')).toBe(0);
      expect(childIt.getNumber('count')).toBe(0);
      expect(childIt.getNumber('size')).toBe(42);
      expect(childIt.getChildren('children').next().done).toBe(true);

      expect(childIt.next().done).toBe(true);

      // The data we appended
      expect(it.next().done).toBe(false);
      expect(it.getNumber('id')).toBe(100);
      expect(it.getNumber('function_info_index')).toBe(0);
      expect(it.getNumber('count')).toBe(100);
      expect(it.getNumber('size')).toBe(100);

      childIt = it.getChildren('children');

      expect(childIt.next().done).toBe(false);
      expect(childIt.getNumber('id')).toBe(101);
      expect(childIt.getNumber('function_info_index')).toBe(0);
      expect(childIt.getNumber('count')).toBe(50);
      expect(childIt.getNumber('size')).toBe(50);
      expect(childIt.getChildren('children').next().done).toBe(true);

      expect(childIt.next().done).toBe(true);

      expect(it.next().done).toBe(true);
    });
  });

  describe('field type checking', () => {
    let data: ChromeHeapSnapshot;
    beforeEach(() => {
      data = {
        ...SNAPSHOT_COMMON,
        edges: [] as Array<number>,
        locations: [] as Array<number>,
        nodes: [
          // -- Node #0 --
          /* type (synthetic) */ 9, /* name */ 0, /* id */ 1, /* self_size */ 0,
          /* edge_count */ 0, /* trace_node_id */ 0, /* detachedness */ 0,
        ],
        samples: [],
        strings: ['Node #0'],
        trace_function_infos: [
          // -- Trace function info #0 --
          /* function_id */ 0, /* name */ 2, /* script_name */ 3,
          /* script_id */ 0, /* line */ 10, /* column */ 20,
        ],
        trace_tree: [
          /* id */ 1,
          /* function_info_index */ 0,
          /* count */ 0,
          /* size */ 0,
          /* children */ [],
        ],
      };
    });

    test('getters and setters', () => {
      const processor = new ChromeHeapSnapshotProcessor(data);
      let it;

      it = processor.nodes();
      expect(it.next().done).toBe(false);
      expect(() => it.getNumber('name')).toThrowError(
        'Not a number field: name',
      );
      expect(() => it.setNumber('name', 0)).toThrowError(
        'Not a number field: name',
      );
      expect(() => it.getChildren('name')).toThrowError(
        'Not a children field: name',
      );
      expect(() => it.getNumber('type')).toThrowError(
        'Not a number field: type',
      );
      expect(() => it.setNumber('type', 1)).toThrowError(
        'Not a number field: type',
      );
      expect(() => it.setString('type', 'some new type')).toThrowError(
        'Cannot define new values in enum field',
      );
      expect(() => it.getChildren('type')).toThrowError(
        'Not a children field: type',
      );
      expect(() => it.getString('id')).toThrowError(
        'Not a string or enum field: id',
      );
      expect(() => it.setString('id', 'foo')).toThrowError(
        'Not a string or enum field: id',
      );
      expect(() => it.getChildren('id')).toThrowError(
        'Not a children field: id',
      );
      expect(it.next().done).toBe(true);

      it = processor.traceTree();
      expect(it.next().done).toBe(false);
      expect(() => it.getChildren('id')).toThrowError(
        'Not a children field: id',
      );
      expect(() => it.getNumber('children')).toThrowError(
        'Not a scalar field: children',
      );
      expect(() => it.getString('children')).toThrowError(
        'Not a scalar field: children',
      );
      expect(() => it.setString('children', 'foo')).toThrowError(
        'Not a string or enum field: children',
      );
      expect(() => it.setNumber('children', 1)).toThrowError(
        'Not a number field: children',
      );
      expect(it.next().done).toBe(true);
    });

    test('missing fields in append', () => {
      const processor = new ChromeHeapSnapshotProcessor(data);
      const it = processor.nodes();
      expect(() => it.append({name: 'Node #1'})).toThrow(
        'Missing value for field: type',
      );
      expect(it.next().done).toBe(false);
      expect(it.getString('name')).toBe('Node #0');
      expect(it.next().done).toBe(true);
    });

    test('missing fields in insert', () => {
      const processor = new ChromeHeapSnapshotProcessor(data);
      const it = processor.nodes();
      expect(() => it.moveAndInsert(0, {name: 'Node #-1'})).toThrow(
        'Missing value for field: type',
      );
      expect(it.getString('name')).toBe('Node #0');
      expect(it.next().done).toBe(true);
    });

    test('wrong type in append', () => {
      const processor = new ChromeHeapSnapshotProcessor(data);
      const it = processor.nodes();
      expect(() =>
        it.append({
          type: 'synthetic',
          name: 'Node #1',
          id: 'some_string',
          self_size: 0,
          edge_count: 0,
          trace_node_id: 0,
          detachedness: 0,
        }),
      ).toThrow('Not a string or enum field: id');
      expect(it.next().done).toBe(false);
      expect(it.getString('name')).toBe('Node #0');
      expect(it.next().done).toBe(true);
    });

    test('wrong type in insert', () => {
      const processor = new ChromeHeapSnapshotProcessor(data);
      const it = processor.nodes();
      expect(() =>
        it.moveAndInsert(0, {
          type: 9,
          name: 'Node #-1',
          id: 100,
          self_size: 0,
          edge_count: 0,
          trace_node_id: 0,
          detachedness: 0,
        }),
      ).toThrow('Not a number field: type');
      expect(it.getString('name')).toBe('Node #0');
      expect(it.next().done).toBe(true);
    });

    test('wrong type in child record', () => {
      const processor = new ChromeHeapSnapshotProcessor(data);
      const it = processor.traceTree();
      expect(() =>
        it.append({
          id: 100,
          function_info_index: 0,
          count: 10,
          size: 0,
          children: [
            {
              id: 'some_string',
              function_info_index: 0,
              count: 0,
              size: 0,
              children: [],
            },
          ],
        }),
      ).toThrow('Not a string or enum field: id');

      expect(it.next().done).toBe(false);
      expect(it.getNumber('id')).toBe(1);
      const childIt = it.getChildren('children');
      expect(childIt.next().done).toBe(true);
      expect(it.next().done).toBe(true);
    });

    test('wrong type in children field', () => {
      const processor = new ChromeHeapSnapshotProcessor(data);
      const it = processor.traceTree();
      expect(() =>
        it.append({
          id: 100,
          function_info_index: 0,
          count: 10,
          size: 0,
          children: 'foo',
        }),
      ).toThrow('Not a string or enum field: children');

      expect(it.next().done).toBe(false);
      expect(it.getNumber('id')).toBe(1);
      const childIt = it.getChildren('children');
      expect(childIt.next().done).toBe(true);
      expect(it.next().done).toBe(true);
    });
  });

  describe('validation', () => {
    test('invalid string table references', () => {
      const processor = new ChromeHeapSnapshotProcessor({
        ...SNAPSHOT_COMMON,
        edges: [],
        locations: [],
        nodes: [
          // -- Node #0 --
          /* type (synthetic) */ 9, /* name */ 0, /* id */ 1, /* self_size */ 0,
          /* edge_count */ 0, /* trace_node_id */ 0, /* detachedness */ 0,

          // -- Node #1 --
          /* type (native) */ 8, /* name */ -1, /* id */ 43,
          /* self_size */ 4320, /* edge_count */ 0, /* trace_node_id */ 0,
          /* detachedness */ 0,
        ],
        samples: [],
        strings: [],
        trace_function_infos: [],
        trace_tree: [],
      });
      const it = processor.nodes();
      expect(it.next().done).toBe(false);
      expect(() => it.getString('name')).toThrowError(
        /index out of string table range/,
      );
      expect(it.next().done).toBe(false);
      expect(() => it.getString('name')).toThrowError(
        /index out of string table range/,
      );
      expect(it.next().done).toBe(true);
    });

    test('invalid enum references', () => {
      const processor = new ChromeHeapSnapshotProcessor({
        ...SNAPSHOT_COMMON,
        edges: [],
        locations: [],
        nodes: [
          // -- Node #0 --
          /* type */ 42, /* name */ 0, /* id */ 1, /* self_size */ 0,
          /* edge_count */ 0, /* trace_node_id */ 0, /* detachedness */ 0,

          // -- Node #1 --
          /* type */ -1, /* name */ 0, /* id */ 43, /* self_size */ 4320,
          /* edge_count */ 0, /* trace_node_id */ 0, /* detachedness */ 0,
        ],
        samples: [],
        strings: [''],
        trace_function_infos: [],
        trace_tree: [],
      });
      const it = processor.nodes();
      expect(it.next().done).toBe(false);
      expect(() => it.getString('type')).toThrowError(
        /raw value does not match field enum type/,
      );
      expect(it.next().done).toBe(false);
      expect(() => it.getString('type')).toThrowError(
        /raw value does not match field enum type/,
      );
      expect(it.next().done).toBe(true);
    });

    test('truncated data', () => {
      const processor = new ChromeHeapSnapshotProcessor({
        ...SNAPSHOT_COMMON,
        edges: [],
        locations: [],
        nodes: [
          // -- Node #0 --
          /* type (synthetic) */ 9, /* name */ 0, /* id */ 1, /* self_size */ 0,
          /* edge_count */ 0, /* trace_node_id */ 0, /* detachedness */ 0,

          // -- Node #1 --
          /* type (native) */ 9, /* name */ 0, /* id */ 43,
          /* self_size */ 4320,
          // Missing fields:
          /* edge_count */
          /* trace_node_id */
          /* detachedness */
        ],
        samples: [],
        strings: [''],
        trace_function_infos: [],
        trace_tree: [],
      });
      expect(() => processor.nodes()).toThrow(
        'Record accessor constructed with wrong size buffer',
      );
      expect(() => processor.traceFunctionInfos()).not.toThrow();
    });

    test('data truncated while iterating', () => {
      const data: ChromeHeapSnapshot = {
        ...SNAPSHOT_COMMON,
        edges: [] as Array<number>,
        locations: [] as Array<number>,
        nodes: [
          // -- Node #0 --
          /* type (synthetic) */ 9, /* name */ 0, /* id */ 1, /* self_size */ 0,
          /* edge_count */ 0, /* trace_node_id */ 0, /* detachedness */ 0,

          // -- Node #1 --
          /* type (native) */ 8, /* name */ 0, /* id */ 43,
          /* self_size */ 4320, /* edge_count */ 0, /* trace_node_id */ 0,
          /* detachedness */ 0,
        ],
        samples: [],
        strings: [''],
        trace_function_infos: [] as Array<number>,
        trace_tree: [],
      };
      const processor = new ChromeHeapSnapshotProcessor(data);
      const it = processor.nodes();

      // Move to the first node.
      expect(it.next().done).toBe(false);
      // Cut off part of the second node.
      data.nodes.pop();
      // Attempt to move to the second node.
      expect(() => it.next()).toThrow(
        'Record at position 7 is truncated: expected 7 fields but found 6',
      );

      // Restore the cut-off part of the second node so we can advance.
      data.nodes.push(0);
      expect(it.next().done).toBe(false);
      // Cut off part of the second node again.
      data.nodes.pop();

      // We're not allowed read or write _any_ field in a truncated node.
      expect(() => it.getNumber('detachedness')).toThrow(
        'Record at position 7 is truncated: expected 7 fields but found 6',
      );
      expect(() => it.getString('type')).toThrow(
        'Record at position 7 is truncated: expected 7 fields but found 6',
      );
      expect(() => it.setNumber('detachedness', 1)).toThrow(
        'Record at position 7 is truncated: expected 7 fields but found 6',
      );
      expect(() => it.setString('type', 'closure')).toThrow(
        'Record at position 7 is truncated: expected 7 fields but found 6',
      );
      // Confirm that nothing got written.
      expect(
        data.nodes[
          1 * data.snapshot.meta.node_fields.length +
            data.snapshot.meta.node_fields.indexOf('detachedness')
        ],
      ).toBe(undefined);
      expect(
        data.nodes[
          1 * data.snapshot.meta.node_fields.length +
            data.snapshot.meta.node_fields.indexOf('type')
        ],
      ).toBe(8);

      // Attempt to move past the end of the buffer.
      expect(() => it.next()).toThrow('Position 14 is out of range');

      // Resize the buffer to just one node.
      data.nodes.length = data.snapshot.meta.node_fields.length * 1;
      // We were at the second node, so now we're at the end of the buffer.
      expect(it.next().done).toBe(true);

      // Can restart with a new iterator now that the array is at a valid length again
      const it2 = processor.nodes();
      expect(it2.next().done).toBe(false);
      expect(it2.getString('type')).toBe('synthetic');
      expect(it2.getString('name')).toBe('');
      expect(it2.getNumber('id')).toBe(1);
      expect(it2.getNumber('self_size')).toBe(0);
      expect(it2.getNumber('edge_count')).toBe(0);
      expect(it2.getNumber('trace_node_id')).toBe(0);
      expect(it2.getNumber('detachedness')).toBe(0);
      expect(it2.next().done).toBe(true);

      // Can reset our old iterator too
      it.moveToRecord(0);
      expect(it.getString('type')).toBe('synthetic');
      expect(it.getString('name')).toBe('');
      expect(it.getNumber('id')).toBe(1);
      expect(it.getNumber('self_size')).toBe(0);
      expect(it.getNumber('edge_count')).toBe(0);
      expect(it.getNumber('trace_node_id')).toBe(0);
      expect(it.getNumber('detachedness')).toBe(0);
      expect(it.next().done).toBe(true);
    });
  });
});
