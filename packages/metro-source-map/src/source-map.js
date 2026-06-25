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

import type {IConsumer} from './Consumer/types';

import {BundleBuilder, createIndexMap} from './BundleBuilder';
import composeSourceMaps from './composeSourceMaps';
import Consumer from './Consumer';
// We need to export this for `metro-symbolicate`
import normalizeSourcePath from './Consumer/normalizeSourcePath';
import {
  functionMapBabelPlugin,
  generateFunctionMap,
} from './generateFunctionMap';
import Generator from './Generator';
import nullthrows from 'nullthrows';
// $FlowFixMe[untyped-import] - source-map
import SourceMap from 'source-map';

export type {IConsumer};

type GeneratedCodeMapping = [number, number];
type SourceMapping = [number, number, number, number];
type SourceMappingWithName = [number, number, number, number, string];

export type MetroSourceMapSegmentTuple =
  | SourceMappingWithName
  | SourceMapping
  | GeneratedCodeMapping;

// A single segment of a standard "decoded" source map (as produced by
// `@babel/generator`'s `result.decodedMap` / `@jridgewell/gen-mapping`),
// grouped by generated line. All fields are 0-based, including the source line
// (unlike Metro's `MetroSourceMapSegmentTuple`, whose source line is 1-based):
//   [generatedColumn]
//   [generatedColumn, sourceIndex, sourceLine, sourceColumn]
//   [generatedColumn, sourceIndex, sourceLine, sourceColumn, nameIndex]
type BabelDecodedMapSegment =
  | [number]
  | [number, number, number, number]
  | [number, number, number, number, number];

export type BabelDecodedMap = {
  readonly mappings: ReadonlyArray<ReadonlyArray<BabelDecodedMapSegment>>,
  readonly names: ReadonlyArray<string>,
  ...
};

export type VlqMap = {
  readonly mappings: string,
  readonly names: ReadonlyArray<string>,
};

export type HermesFunctionOffsets = {[number]: ReadonlyArray<number>, ...};

export type FBSourcesArray = ReadonlyArray<?FBSourceMetadata>;
export type FBSourceMetadata = [?FBSourceFunctionMap];
export type FBSourceFunctionMap = {
  readonly names: ReadonlyArray<string>,
  readonly mappings: string,
};

export type BabelSourceMapSegment = Readonly<{
  generated: Readonly<{column: number, line: number, ...}>,
  original?: Readonly<{column: number, line: number, ...}>,
  source?: ?string,
  name?: ?string,
  ...
}>;

export type FBSegmentMap = {[id: string]: MixedSourceMap, ...};

export type BasicSourceMap = {
  readonly file?: string,
  readonly mappings: string,
  readonly names: Array<string>,
  readonly sourceRoot?: string,
  readonly sources: Array<string>,
  readonly sourcesContent?: Array<?string>,
  readonly version: number,
  readonly x_facebook_offsets?: Array<number>,
  readonly x_metro_module_paths?: Array<string>,
  readonly x_facebook_sources?: FBSourcesArray,
  readonly x_facebook_segments?: FBSegmentMap,
  readonly x_hermes_function_offsets?: HermesFunctionOffsets,
  readonly x_google_ignoreList?: Array<number>,
};

export type IndexMapSection = {
  map: IndexMap | BasicSourceMap,
  offset: {
    line: number,
    column: number,
    ...
  },
  ...
};

export type IndexMap = {
  readonly file?: string,
  readonly mappings?: void, // avoids SourceMap being a disjoint union
  readonly sourcesContent?: void,
  readonly sections: Array<IndexMapSection>,
  readonly version: number,
  readonly x_facebook_offsets?: Array<number>,
  readonly x_metro_module_paths?: Array<string>,
  readonly x_facebook_sources?: void,
  readonly x_facebook_segments?: FBSegmentMap,
  readonly x_hermes_function_offsets?: HermesFunctionOffsets,
  readonly x_google_ignoreList?: void,
};

export type MixedSourceMap = IndexMap | BasicSourceMap;

type SourceMapConsumerMapping = {
  generatedLine: number,
  generatedColumn: number,
  originalLine: ?number,
  originalColumn: ?number,
  source: ?string,
  name: ?string,
};

export type RawMappingsModule = {
  readonly map: ?ReadonlyArray<MetroSourceMapSegmentTuple> | VlqMap,
  readonly functionMap: ?FBSourceFunctionMap,
  readonly path: string,
  readonly source: string,
  readonly code: string,
  readonly isIgnored: boolean,
  readonly lineCount?: number,
};

function isVlqMap(
  map: ?ReadonlyArray<MetroSourceMapSegmentTuple> | VlqMap,
): implies map is VlqMap {
  return map != null && !Array.isArray(map) && typeof map.mappings === 'string';
}

function fromRawMappingsImpl(
  isBlocking: boolean,
  onDone: Generator => void,
  modules: ReadonlyArray<RawMappingsModule>,
  offsetLines: number,
): void {
  const modulesToProcess = modules.slice();
  const generator = new Generator();
  let carryOver = offsetLines;

  function processNextModule() {
    if (modulesToProcess.length === 0) {
      return true;
    }

    const mod = nullthrows(modulesToProcess.shift());
    const {code, map} = mod;
    if (isVlqMap(map)) {
      // Modules may store their map compactly as VLQ. Decode it back to tuples
      // just-in-time so it can be folded into the flat Generator like any other
      // module. Decoding one module at a time keeps the transient tuple arrays
      // short-lived, preserving the memory win of VLQ storage.
      addMappingsForFile(generator, decodeVlqMap(map), mod, carryOver);
    } else if (Array.isArray(map)) {
      addMappingsForFile(generator, map, mod, carryOver);
    } else if (map != null) {
      throw new Error(
        `Unexpected module with full source map found: ${mod.path}`,
      );
    }
    carryOver = carryOver + countLines(code);
    return false;
  }

  function workLoop() {
    const time = process.hrtime();
    while (true) {
      const isDone = processNextModule();
      if (isDone) {
        onDone(generator);
        break;
      }
      if (!isBlocking) {
        // Keep the loop running but try to avoid blocking
        // for too long because this is not in a worker yet.
        const diff = process.hrtime(time);
        const NS_IN_MS = 1000000;
        if (diff[1] > 50 * NS_IN_MS) {
          // We've blocked for more than 50ms.
          // This code currently runs on the main thread,
          // so let's give Metro an opportunity to handle requests.
          setImmediate(workLoop);
          break;
        }
      }
    }
  }

  workLoop();
}

/**
 * Creates a source map from modules with "raw mappings", i.e. an array of
 * tuples with either 2, 4, or 5 elements:
 * generated line, generated column, source line, source line, symbol name.
 * Accepts an `offsetLines` argument in case modules' code is to be offset in
 * the resulting bundle, e.g. by some prefix code.
 */
function fromRawMappings(
  modules: ReadonlyArray<RawMappingsModule>,
  offsetLines: number = 0,
): Generator {
  let generator: void | Generator;
  fromRawMappingsImpl(
    true,
    g => {
      generator = g;
    },
    modules,
    offsetLines,
  );
  if (generator == null) {
    throw new Error('Expected fromRawMappingsImpl() to finish synchronously.');
  }
  return generator;
}

async function fromRawMappingsNonBlocking(
  modules: ReadonlyArray<RawMappingsModule>,
  offsetLines: number = 0,
): Promise<Generator> {
  return new Promise(resolve => {
    fromRawMappingsImpl(false, resolve, modules, offsetLines);
  });
}

/**
 * Transforms a standard source map object into a Raw Mappings object, to be
 * used across the bundler.
 */
function toBabelSegments(
  sourceMap: BasicSourceMap,
): Array<BabelSourceMapSegment> {
  const rawMappings: Array<BabelSourceMapSegment> = [];

  new SourceMap.SourceMapConsumer(sourceMap).eachMapping(
    (map: SourceMapConsumerMapping) => {
      rawMappings.push(
        map.originalLine == null || map.originalColumn == null
          ? {
              generated: {
                line: map.generatedLine,
                column: map.generatedColumn,
              },
              source: map.source,
              name: map.name,
            }
          : {
              generated: {
                line: map.generatedLine,
                column: map.generatedColumn,
              },
              original: {
                line: map.originalLine,
                column: map.originalColumn,
              },
              source: map.source,
              name: map.name,
            },
      );
    },
  );

  return rawMappings;
}

function toSegmentTuple(
  mapping: BabelSourceMapSegment,
): MetroSourceMapSegmentTuple {
  const {column, line} = mapping.generated;
  const {name, original} = mapping;

  if (original == null) {
    return [line, column];
  }

  if (typeof name !== 'string') {
    return [line, column, original.line, original.column];
  }

  return [line, column, original.line, original.column, name];
}

/**
 * Converts a Babel/gen-mapping "decoded" source map (`result.decodedMap` from
 * `@babel/generator`) into raw mapping tuples, byte-identical to
 * `result.rawMappings.map(toSegmentTuple)`.
 *
 * Preferred over `result.rawMappings` because `decodedMap` is computed eagerly
 * during generation, whereas accessing `rawMappings` triggers a second decode
 * (`allMappings`) that allocates ~4-5 objects per segment. No terminating
 * mapping is appended (callers that need one use `countLinesAndTerminateMap`).
 */
function tuplesFromBabelDecodedMap(
  decodedMap: BabelDecodedMap,
): Array<MetroSourceMapSegmentTuple> {
  const {mappings, names} = decodedMap;
  const tuples: Array<MetroSourceMapSegmentTuple> = [];
  for (let line = 0, n = mappings.length; line < n; ++line) {
    // Decoded mappings are grouped by generated line (0-based); tuples use
    // 1-based generated lines.
    const generatedLine = line + 1;
    const segments = mappings[line];
    for (let i = 0, m = segments.length; i < m; ++i) {
      const segment = segments[i];
      switch (segment.length) {
        case 1:
          tuples.push([generatedLine, segment[0]]);
          break;
        case 4:
          // Decoded source lines are 0-based; tuples use 1-based source lines.
          tuples.push([generatedLine, segment[0], segment[2] + 1, segment[3]]);
          break;
        case 5:
          tuples.push([
            generatedLine,
            segment[0],
            segment[2] + 1,
            segment[3],
            names[segment[4]],
          ]);
          break;
      }
    }
  }
  return tuples;
}

function addMappingsForFile(
  generator: Generator,
  mappings: ReadonlyArray<MetroSourceMapSegmentTuple>,
  module: RawMappingsModule,
  carryOver: number,
) {
  generator.startFile(module.path, module.source, module.functionMap, {
    addToIgnoreList: module.isIgnored,
  });

  for (let i = 0, n = mappings.length; i < n; ++i) {
    addMapping(generator, mappings[i], carryOver);
  }

  generator.endFile();
}

function addMapping(
  generator: Generator,
  mapping: MetroSourceMapSegmentTuple,
  carryOver: number,
) {
  const line = mapping[0] + carryOver;
  // lines start at 1, columns start at 0
  const column = mapping[1];
  switch (mapping.length) {
    case 2:
      generator.addSimpleMapping(line, column);
      return;
    case 4:
      generator.addSourceMapping(line, column, mapping[2], mapping[3]);
      return;
    case 5:
      generator.addNamedSourceMapping(
        line,
        column,
        mapping[2],
        mapping[3],
        mapping[4],
      );
      return;
  }
  throw new Error(`Invalid mapping: [${mapping.join(', ')}]`);
}

const newline = /\r\n?|\n|\u2028|\u2029/g;

const countLines = (string: string): number =>
  (string.match(newline) || []).length + 1;

/**
 * Decodes a compact VLQ map back into raw mapping tuples — the inverse of
 * `vlqMapFromTuples`, reusing Metro's existing source-map consumer.
 */
function decodeVlqMap(vlqMap: VlqMap): Array<MetroSourceMapSegmentTuple> {
  return toBabelSegments({
    version: 3,
    sources: [''],
    names: [...vlqMap.names],
    mappings: vlqMap.mappings,
  }).map(toSegmentTuple);
}

/**
 * Encodes raw mapping tuples into a compact VLQ `mappings` string + `names`
 * table. Decode the inverse via `decodeVlqMap` (or `toBabelSegments` +
 * `toSegmentTuple`). Storing maps in this form uses far less memory than the
 * equivalent decoded tuple arrays.
 */
function vlqMapFromTuples(
  mappings: ReadonlyArray<MetroSourceMapSegmentTuple>,
): VlqMap {
  const generator = new Generator();
  generator.startFile('', '', null);
  for (const mapping of mappings) {
    addMapping(generator, mapping, 0);
  }
  generator.endFile();
  const map = generator.toMap();
  return {mappings: map.mappings, names: map.names};
}

export {
  BundleBuilder,
  composeSourceMaps,
  Consumer,
  createIndexMap,
  generateFunctionMap,
  fromRawMappings,
  fromRawMappingsNonBlocking,
  functionMapBabelPlugin,
  isVlqMap,
  normalizeSourcePath,
  toBabelSegments,
  toSegmentTuple,
  tuplesFromBabelDecodedMap,
  vlqMapFromTuples,
};

/**
 * Backwards-compatibility with CommonJS consumers using interopRequireDefault.
 * Do not add to this list.
 *
 * @deprecated Default import from 'metro-source-map' is deprecated, use named exports.
 */
export default {
  BundleBuilder,
  composeSourceMaps,
  Consumer,
  createIndexMap,
  generateFunctionMap,
  fromRawMappings,
  fromRawMappingsNonBlocking,
  functionMapBabelPlugin,
  normalizeSourcePath,
  toBabelSegments,
  toSegmentTuple,
};
