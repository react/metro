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

import invariant from 'invariant';

type RawBuffer = Array<number | RawBuffer>;

export type ChromeHeapSnapshot = {
  snapshot: {
    meta: {
      trace_function_info_fields: Array<string>,
      location_fields: Array<string>,
      edge_fields: Array<string>,
      edge_types: Array<string | Array<string>>,
      node_fields: Array<string>,
      node_types: Array<string | Array<string>>,
      trace_node_fields: Array<string>,
      ...
    },
    ...
  },
  trace_function_infos: Array<number>,
  locations: Array<number>,
  edges: Array<number>,
  nodes: Array<number>,
  strings: Array<string>,
  trace_tree: RawBuffer,
  ...
};

// The snapshot metadata doesn't have a type describing the `children` field
// of `trace_tree`, but modeling it as a type works really well. So we make up
// our own name for it and use that internally.
const CHILDREN_FIELD_TYPE = '__CHILDREN__';

// An adapter for reading and mutating a Chrome heap snapshot in-place,
// including safely decoding and encoding fields that point into the global
// string table and into enum types.
// Care is taken to adhere to the self-describing heap snapshot schema, but
// we make some additional assumptions based on what Chrome hardcodes (where
// the format leaves us no other choice).
export class ChromeHeapSnapshotProcessor {
  // The raw snapshot data provided to this processor. Mutable.
  readonly _snapshotData: ChromeHeapSnapshot;

  // An adapter for the global string table in the raw snapshot data.
  // This is shared across all the iterators we will create.
  readonly _globalStringTable: ChromeHeapSnapshotStringTable;

  constructor(snapshotData: ChromeHeapSnapshot) {
    this._snapshotData = snapshotData;
    this._globalStringTable = new ChromeHeapSnapshotStringTable(
      this._snapshotData.strings,
    );
  }

  traceFunctionInfos(): ChromeHeapSnapshotRecordIterator {
    return new ChromeHeapSnapshotRecordIterator(
      // Flow is being conservative here, but we'll never change a number into RawBuffer or vice versa.
      // $FlowFixMe[incompatible-type]
      this._snapshotData.trace_function_infos,
      this._snapshotData.snapshot.meta.trace_function_info_fields,
      {name: 'string', script_name: 'string'},
      this._globalStringTable,
      undefined /* start position */,
    );
  }

  locations(): ChromeHeapSnapshotRecordIterator {
    return new ChromeHeapSnapshotRecordIterator(
      // Flow is being conservative here, but we'll never change a number into RawBuffer or vice versa.
      // $FlowFixMe[incompatible-type]
      this._snapshotData.locations,
      this._snapshotData.snapshot.meta.location_fields,
      null,
      this._globalStringTable,
      undefined /* start position */,
    );
  }

  nodes(): ChromeHeapSnapshotRecordIterator {
    return new ChromeHeapSnapshotRecordIterator(
      // Flow is being conservative here, but we'll never change a number into RawBuffer or vice versa.
      // $FlowFixMe[incompatible-type]
      this._snapshotData.nodes,
      this._snapshotData.snapshot.meta.node_fields,
      this._snapshotData.snapshot.meta.node_types,
      this._globalStringTable,
      undefined /* start position */,
    );
  }

  edges(): ChromeHeapSnapshotRecordIterator {
    return new ChromeHeapSnapshotRecordIterator(
      // Flow is being conservative here, but we'll never change a number into RawBuffer or vice versa.
      // $FlowFixMe[incompatible-type]
      this._snapshotData.edges,
      this._snapshotData.snapshot.meta.edge_fields,
      this._snapshotData.snapshot.meta.edge_types,
      this._globalStringTable,
      undefined /* start position */,
    );
  }

  traceTree(): ChromeHeapSnapshotRecordIterator {
    return new ChromeHeapSnapshotRecordIterator(
      this._snapshotData.trace_tree,
      this._snapshotData.snapshot.meta.trace_node_fields,
      {children: CHILDREN_FIELD_TYPE},
      this._globalStringTable,
      undefined /* start position */,
    );
  }
}

// An uniquing adapter for the heap snapshot's string table that allows
// retrieving and adding strings.
//
// Assumptions:
// 1. The string table is only manipulated via this class, and only via a
//    single instance of it.
// 2. The string table array is always mutated in-place rather than being
//    copied / replaced with a new array in its containing object.
class ChromeHeapSnapshotStringTable {
  readonly _strings: Array<string>;
  readonly _indexCache: Map<string, number>;

  constructor(strings: Array<string>) {
    this._strings = strings;
    this._indexCache = new Map();
    // NOTE: _indexCache is lazily initialised in _syncIndexCache.
  }

  // Looks up a string in the string table, adds it if necessary, and returns
  // its index.
  add(value: string): number {
    this._syncIndexCache();
    let index = this._indexCache.get(value);
    if (index != null) {
      return index;
    }
    index = this._strings.length;
    this._strings.push(value);
    this._indexCache.set(value, index);
    return index;
  }

  // Retrieve the string at the given index.
  get(index: number): string {
    invariant(
      index >= 0 && index < this._strings.length,
      'index out of string table range',
    );
    return this._strings[index];
  }

  // Indexes the string table for fast lookup.
  _syncIndexCache() {
    // Because we only grow the string table and we assume it's unique to begin
    // with, we only need to scan any strings that we may have appended since
    // the last time we synced the index.
    // NOTE: This is not even strictly necessary other than for the very first
    // add() call, but it might allow us to do more complicated string table
    // manipulation down the line.
    if (this._strings.length > this._indexCache.size) {
      for (let i = this._indexCache.size; i < this._strings.length; ++i) {
        this._indexCache.set(this._strings[i], i);
      }
    }
  }
}

type ChromeHeapSnapshotFieldType =
  // enum
  | Array<string>
  // type name
  | string;

// The input type to functions that accept record objects.
type DenormalizedRecordInput = Readonly<{
  [field: string]: string | number | ReadonlyArray<DenormalizedRecordInput>,
}>;

// A cursor pointing to a record-aligned position in a 1D array of N records
// each with K fields in a fixed order. Supports encoding/decoding field values
// in the raw array according to a schema passed to the constructor.
//
// Field values are stored as either numbers (representing scalars) or arrays
// (representing lists of nested records). Scalar fields may represent strings
// in the string table, strings in an enum, or numbers. Nested record lists are
// processed according to the same schema as their parent record.
//
// Setters directly mutate raw data in the buffer and in the string table.
class ChromeHeapSnapshotRecordAccessor {
  // Fast lookup tables from field names to their offsets (required) and types
  // (optional). These are shared with any child iterators.
  readonly _fieldToOffset: ReadonlyMap<string, number>;
  readonly _fieldToType: ReadonlyMap<string, ChromeHeapSnapshotFieldType>;

  // The number of fields in every record (i.e. K).
  readonly _recordSize: number;

  // The raw buffer. Mutable.
  readonly _buffer: RawBuffer;

  // The global string table. Mutable in the ways allowed by the string table
  // class.
  readonly _globalStringTable: ChromeHeapSnapshotStringTable;

  // The current position in the raw buffer.
  _position: number;

  constructor(
    buffer: RawBuffer,
    recordFields: Array<string>,
    // recordTypes can be:
    // 1. An array: Field types as described in the snapshot itself, e.g.
    //    node_types, edge_types.
    // 2. An object: Field types that are implicit (hardcoded in V8 / DevTools)
    //    so we pass them in by field name.
    // 3. null: No field types are known.
    // Fields with unknown types are assumed to be numeric.
    recordTypes:
      | Array<ChromeHeapSnapshotFieldType>
      | Readonly<{
          [string]: ChromeHeapSnapshotFieldType,
        }>
      | null,
    globalStringTable: ChromeHeapSnapshotStringTable,
    position: number,
    parent?: ChromeHeapSnapshotRecordAccessor,
  ) {
    if (parent) {
      this._recordSize = parent._recordSize;
      this._fieldToOffset = parent._fieldToOffset;
      this._fieldToType = parent._fieldToType;
    } else {
      this._recordSize = recordFields.length;
      this._fieldToOffset = new Map(
        // $FlowFixMe[not-an-object]
        Object.entries(recordFields).map(([offsetStr, name]) => [
          String(name),
          Number(offsetStr),
        ]),
      );
      if (Array.isArray(recordTypes)) {
        this._fieldToType = new Map<string, ChromeHeapSnapshotFieldType>(
          // $FlowFixMe[not-an-object]
          Object.entries(recordTypes).map(([offsetStr, type]) => [
            recordFields[Number(offsetStr)],
            type,
          ]),
        );
      } else {
        // $FlowFixMe[incompatible-type] Object.entries is incompletely typed
        this._fieldToType = new Map(Object.entries(recordTypes || {}));
      }
    }
    this._buffer = buffer;
    this._position = position;
    invariant(
      this._position % this._recordSize === 0,
      'Record accessor constructed at invalid offset',
    );
    invariant(
      this._buffer.length % this._recordSize === 0,
      'Record accessor constructed with wrong size buffer',
    );
    this._globalStringTable = globalStringTable;
  }

  /** Public API */

  // Reads a scalar string or enum value from the given field.
  // It's an error to read a number (or other non-string) field as a string.
  // NOTE: The type "string_or_number" is always treated as a number and cannot
  // be read using this method.
  getString(field: string): string {
    const dynamicValue = this._getScalar(field);
    if (typeof dynamicValue === 'string') {
      return dynamicValue;
    }
    throw new Error('Not a string or enum field: ' + field);
  }

  // Reads a scalar numeric value from the given field.
  // It's an error to read a string (or other non-number) field as a number.
  // NOTE: The type "string_or_number" is always treated as a number.
  getNumber(field: string): number {
    const dynamicValue = this._getScalar(field);
    if (typeof dynamicValue === 'number') {
      return dynamicValue;
    }
    throw new Error('Not a number field: ' + field);
  }

  // Returns an iterator over the children of this record that are stored in
  // the given field (typically 'children'). Children conform to the same
  // schema as the current record.
  getChildren(field: string): ChromeHeapSnapshotRecordIterator {
    const fieldType = this._fieldToType.get(field);
    if (fieldType !== CHILDREN_FIELD_TYPE) {
      throw new Error('Not a children field: ' + field);
    }
    const childrenBuffer = this._getRaw(field);
    invariant(
      Array.isArray(childrenBuffer),
      'Expected array in children-typed field',
    );
    return new ChromeHeapSnapshotRecordIterator(
      childrenBuffer,
      [], // recordFields ignored when there's a parent
      null, // recordTypes ignored when there's a parent
      this._globalStringTable,
      -this._fieldToOffset.size /* start position */,
      this,
    );
  }

  // Writes a scalar string or enum value into the given field, updating the
  // global string table as needed.
  // It's an error to write anything other than a string into a string or enum
  // field.
  // It's an error to write an unknown enum value into an enum field.
  // NOTE: The type "string_or_number" is always treated as a number and cannot
  // be written using this method.
  setString(field: string, value: string): void {
    this._setRaw(field, this._encodeString(field, value));
  }

  // Writes a scalar numeric value into the given field.
  // It's an error to write anything other than a number into a numeric field.
  // NOTE: The type "string_or_number" is always treated as a number.
  setNumber(field: string, value: number): void {
    const fieldType = this._fieldToType.get(field);
    if (
      Array.isArray(fieldType) ||
      fieldType === 'string' ||
      fieldType === CHILDREN_FIELD_TYPE
    ) {
      throw new Error('Not a number field: ' + field);
    }
    this._setRaw(field, value);
  }

  // Moves the cursor to a given index in the buffer (expressed in # of
  // records, NOT fields).
  moveToRecord(recordIndex: number) {
    this._moveToPosition(recordIndex * this._recordSize);
  }

  // Appends a new record at the end of the buffer.
  //
  // Returns the index of the appended record. All fields must be specified and
  // have values of the correct types. The cursor may move while writing, but
  // is guaranteed to return to its initial position when this function returns
  // (or throws).
  append(record: DenormalizedRecordInput): number {
    const savedPosition = this._position;
    try {
      return this.moveAndInsert(this._buffer.length / this._recordSize, record);
    } finally {
      this._position = savedPosition;
    }
  }

  // Moves the cursor to a given index in the buffer (expressed in # of
  // records, NOT fields) and inserts a record.
  //
  // Returns the index of the inserted record. All fields must be specified and
  // have values of the correct types. The given index may be the end of the
  // buffer; otherwise existing records starting at the given index will be
  // shifted to the right to accommodate the new record.
  //
  // NOTE: Inserting is a risky, low-level operation. Care must be taken not to
  // desync buffers that implicitly or explicitly depend on one another (e.g.
  // edge.to_node -> node position, cumulative node.edge_count -> edge indices).
  moveAndInsert(recordIndex: number, record: DenormalizedRecordInput): number {
    this._moveToPosition(recordIndex * this._recordSize, /* allowEnd */ true);
    let didResizeBuffer = false;
    try {
      for (const field of this._fieldToOffset.keys()) {
        /* $FlowFixMe[invalid-this-arg] Error exposed after fixing this typing
         * unsoundness in flow */
        if (!Object.prototype.hasOwnProperty.call(record, field)) {
          throw new Error('Missing value for field: ' + field);
        }
      }
      this._buffer.splice(
        this._position,
        0,
        ...new Array<number | RawBuffer>(this._recordSize),
      );
      didResizeBuffer = true;
      for (const field of Object.keys(record)) {
        this._set(field, record[field]);
      }
      return this._position / this._recordSize;
    } catch (e) {
      if (didResizeBuffer) {
        // Roll back the write
        this._buffer.splice(this._position, this._recordSize);
      }
      throw e;
    }
  }

  /** "Protected" methods (please don't use) */

  // Return true if we can advance the position by one record (including from
  // the last record to the "end" position).
  protectedHasNext(): boolean {
    if (this._position < 0) {
      // We haven't started iterating yet, so this might _be_ the end position.
      return this._buffer.length > 0;
    }
    return this._position < this._buffer.length;
  }

  // Move to the next record (or the end) if we're not already at the end.
  protectedTryMoveNext(): void {
    if (this.protectedHasNext()) {
      this._moveToPosition(
        this._position + this._recordSize,
        /* allowEnd */ true,
      );
    }
  }

  /** Private methods */

  // Reads the raw numeric value of a field.
  _getRaw(field: string): number | RawBuffer {
    this._validatePosition();
    const offset = this._fieldToOffset.get(field);
    if (offset == null) {
      throw new Error('Unknown field: ' + field);
    }
    return this._buffer[this._position + offset];
  }

  // Decodes a scalar (string or number) field.
  _getScalar(field: string): string | number {
    const rawValue = this._getRaw(field);
    if (Array.isArray(rawValue)) {
      throw new Error('Not a scalar field: ' + field);
    }
    const fieldType = this._fieldToType.get(field);
    if (Array.isArray(fieldType)) {
      invariant(
        rawValue >= 0 && rawValue < fieldType.length,
        'raw value does not match field enum type',
      );
      return fieldType[rawValue];
    }
    if (fieldType === 'string') {
      return this._globalStringTable.get(rawValue);
    }
    return rawValue;
  }

  // Writes the raw value of a field.
  _setRaw(field: string, rawValue: number | RawBuffer): void {
    this._validatePosition();
    const offset = this._fieldToOffset.get(field);
    if (offset == null) {
      throw new Error('Unknown field: ' + field);
    }
    this._buffer[this._position + offset] = rawValue;
  }

  // Writes a scalar or children value to `field`, inferring the intended type
  // based on the runtime type of `value`.
  _set(
    field: string,
    value: string | number | ReadonlyArray<DenormalizedRecordInput>,
  ): void {
    if (typeof value === 'string') {
      this.setString(field, value);
    } else if (typeof value === 'number') {
      this.setNumber(field, value);
    } else if (Array.isArray(value)) {
      this._setChildren(field, value);
    } else {
      throw new Error('Unsupported value for field: ' + field);
    }
  }

  // Writes a children array to `field` by appending each element of `value` to
  // a new buffer using `append()`s semantics.
  _setChildren(
    field: string,
    value: ReadonlyArray<DenormalizedRecordInput>,
  ): void {
    const fieldType = this._fieldToType.get(field);
    if (fieldType !== CHILDREN_FIELD_TYPE) {
      throw new Error('Not a children field: ' + field);
    }
    this._setRaw(field, []);
    const childIt = this.getChildren(field);
    for (const child of value) {
      childIt.append(child);
    }
  }

  // Encodes a string value according to its field schema.
  // The global string table may be updated as a side effect.
  _encodeString(field: string, value: string): number {
    const fieldType = this._fieldToType.get(field);
    if (Array.isArray(fieldType)) {
      const index = fieldType.indexOf(value);
      invariant(index >= 0, 'Cannot define new values in enum field');
      return index;
    }
    if (fieldType === 'string') {
      return this._globalStringTable.add(value);
    }
    throw new Error('Not a string or enum field: ' + field);
  }

  // Asserts that the given position (default: the current position) is either
  // a valid position for reading a record, or (if allowEnd is true) the end of
  // the buffer.
  _validatePosition(
    allowEnd?: boolean = false,
    position?: number = this._position,
  ): void {
    if (!Number.isInteger(position)) {
      throw new Error(`Position ${position} is not an integer`);
    }
    if (position % this._recordSize !== 0) {
      throw new Error(
        `Position ${position} is not a multiple of record size ${this._recordSize}`,
      );
    }
    if (position < 0) {
      throw new Error(`Position ${position} is out of range`);
    }
    const maxPosition = allowEnd
      ? this._buffer.length
      : this._buffer.length - 1;
    if (position > maxPosition) {
      throw new Error(`Position ${position} is out of range`);
    }
    if (this._buffer.length - position < this._recordSize) {
      if (!(allowEnd && this._buffer.length === position)) {
        throw new Error(
          `Record at position ${position} is truncated: expected ${this._recordSize} fields but found ${this._buffer.length - position}`,
        );
      }
    }
  }

  // Move to the given position or throw an error if it is invalid.
  _moveToPosition(nextPosition: number, allowEnd: boolean = false) {
    this._validatePosition(allowEnd, nextPosition);
    this._position = nextPosition;
  }
}

class ChromeHeapSnapshotRecordIterator
  extends ChromeHeapSnapshotRecordAccessor
  implements Iterable<ChromeHeapSnapshotRecordAccessor>
{
  constructor(
    buffer: RawBuffer,
    recordFields: Array<string>,
    recordTypes:
      | Array<ChromeHeapSnapshotFieldType>
      | Readonly<{
          [string]: ChromeHeapSnapshotFieldType,
        }>
      | null,
    globalStringTable: ChromeHeapSnapshotStringTable,
    // Initialise to "before the first iteration".
    // The Accessor constructor intentionally checks only alignment, not range,
    // so this works as long as we don't try to read/write (at which point
    // validation will kick in).
    position: number = -recordFields.length,
    parent?: ChromeHeapSnapshotRecordAccessor,
  ) {
    super(
      buffer,
      recordFields,
      recordTypes,
      globalStringTable,
      position,
      parent,
    );
  }

  // JS Iterator protocol
  next(): IteratorResult<ChromeHeapSnapshotRecordIterator, void> {
    this.protectedTryMoveNext();
    const done = !this.protectedHasNext();
    return done ? {done} : {done, value: this};
  }

  // JS Iterable protocol
  [Symbol.iterator](): ChromeHeapSnapshotRecordIterator {
    return this;
  }
}
