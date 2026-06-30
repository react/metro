/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<a3a499a683d5ea557e429489802510ae>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-source-map/src/source-map.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {IConsumer} from './Consumer/types';

import {BundleBuilder, createIndexMap} from './BundleBuilder';
import composeSourceMaps from './composeSourceMaps';
import Consumer from './Consumer';
import normalizeSourcePath from './Consumer/normalizeSourcePath';
import {
  functionMapBabelPlugin,
  generateFunctionMap,
} from './generateFunctionMap';
import Generator from './Generator';

export type {IConsumer};
type GeneratedCodeMapping = [number, number];
type SourceMapping = [number, number, number, number];
type SourceMappingWithName = [number, number, number, number, string];
export type MetroSourceMapSegmentTuple =
  | SourceMappingWithName
  | SourceMapping
  | GeneratedCodeMapping;
type BabelDecodedMapSegment =
  | [number]
  | [number, number, number, number]
  | [number, number, number, number, number];
export type BabelDecodedMap = {
  readonly mappings: ReadonlyArray<ReadonlyArray<BabelDecodedMapSegment>>;
  readonly names: ReadonlyArray<string>;
};
export type VlqMap = {
  readonly mappings: string;
  readonly names: ReadonlyArray<string>;
};
export type HermesFunctionOffsets = {
  [$$Key$$: number]: ReadonlyArray<number>;
};
export type FBSourcesArray = ReadonlyArray<null | undefined | FBSourceMetadata>;
export type FBSourceMetadata = [null | undefined | FBSourceFunctionMap];
export type FBSourceFunctionMap = {
  readonly names: ReadonlyArray<string>;
  readonly mappings: string;
};
export type BabelSourceMapSegment = Readonly<{
  generated: Readonly<{column: number; line: number}>;
  original?: Readonly<{column: number; line: number}>;
  source?: null | undefined | string;
  name?: null | undefined | string;
}>;
export type FBSegmentMap = {[id: string]: MixedSourceMap};
export type BasicSourceMap = {
  readonly file?: string;
  readonly mappings: string;
  readonly names: Array<string>;
  readonly sourceRoot?: string;
  readonly sources: Array<string>;
  readonly sourcesContent?: Array<null | undefined | string>;
  readonly version: number;
  readonly x_facebook_offsets?: Array<number>;
  readonly x_metro_module_paths?: Array<string>;
  readonly x_facebook_sources?: FBSourcesArray;
  readonly x_facebook_segments?: FBSegmentMap;
  readonly x_hermes_function_offsets?: HermesFunctionOffsets;
  readonly x_google_ignoreList?: Array<number>;
};
export type IndexMapSection = {
  map: IndexMap | BasicSourceMap;
  offset: {line: number; column: number};
};
export type IndexMap = {
  readonly file?: string;
  readonly mappings?: void;
  readonly sourcesContent?: void;
  readonly sections: Array<IndexMapSection>;
  readonly version: number;
  readonly x_facebook_offsets?: Array<number>;
  readonly x_metro_module_paths?: Array<string>;
  readonly x_facebook_sources?: void;
  readonly x_facebook_segments?: FBSegmentMap;
  readonly x_hermes_function_offsets?: HermesFunctionOffsets;
  readonly x_google_ignoreList?: void;
};
export type MixedSourceMap = IndexMap | BasicSourceMap;
export type RawMappingsModule = {
  readonly map:
    | (null | undefined | ReadonlyArray<MetroSourceMapSegmentTuple>)
    | VlqMap;
  readonly functionMap: null | undefined | FBSourceFunctionMap;
  readonly path: string;
  readonly source: string;
  readonly code: string;
  readonly isIgnored: boolean;
  readonly lineCount?: number;
};
export interface SourceMapGenerator {
  toMap(file?: string, options?: {excludeSource?: boolean}): MixedSourceMap;
  toString(file?: string, options?: {excludeSource?: boolean}): string;
}
/**
 * Result of `fromRawMappingsIndexed`: a sectioned (indexed) source map where
 * each module is one section. VLQ-stored modules pass through verbatim, which is
 * why building this is cheap compared to flattening into a single map.
 */
declare class IndexedSourceMapResult implements SourceMapGenerator {
  constructor(sections: Array<IndexMapSection>);
  toMap(file?: string, options?: {excludeSource?: boolean}): MixedSourceMap;
  toString(file?: string, options?: {excludeSource?: boolean}): string;
}
declare function isVlqMap(
  map: (null | undefined | ReadonlyArray<MetroSourceMapSegmentTuple>) | VlqMap,
): map is VlqMap;
/**
 * Creates a source map from modules with "raw mappings", i.e. an array of
 * tuples with either 2, 4, or 5 elements:
 * generated line, generated column, source line, source line, symbol name.
 * Accepts an `offsetLines` argument in case modules' code is to be offset in
 * the resulting bundle, e.g. by some prefix code.
 */
declare function fromRawMappings(
  modules: ReadonlyArray<RawMappingsModule>,
  offsetLines?: number,
): Generator;
declare function fromRawMappingsNonBlocking(
  modules: ReadonlyArray<RawMappingsModule>,
  offsetLines?: number,
): Promise<Generator>;
/**
 * Like `fromRawMappings`, but produces an indexed (sectioned) source map with
 * one section per module. VLQ-stored modules pass through verbatim — no
 * decode/re-encode — which is the whole point: it's much cheaper to serialize
 * than the flat path, at the cost of emitting an indexed map that consumers must
 * understand. Per-module work is trivial, so this runs synchronously.
 */
declare function fromRawMappingsIndexed(
  modules: ReadonlyArray<RawMappingsModule>,
  offsetLines?: number,
): IndexedSourceMapResult;
/**
 * Transforms a standard source map object into a Raw Mappings object, to be
 * used across the bundler.
 */
declare function toBabelSegments(
  sourceMap: BasicSourceMap,
): Array<BabelSourceMapSegment>;
declare function toSegmentTuple(
  mapping: BabelSourceMapSegment,
): MetroSourceMapSegmentTuple;
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
declare function tuplesFromBabelDecodedMap(
  decodedMap: BabelDecodedMap,
): Array<MetroSourceMapSegmentTuple>;
/**
 * Encodes raw mapping tuples into a compact VLQ `mappings` string + `names`
 * table. Decode the inverse via `decodeVlqMap` (or `toBabelSegments` +
 * `toSegmentTuple`). Storing maps in this form uses far less memory than the
 * equivalent decoded tuple arrays.
 */
declare function vlqMapFromTuples(
  mappings: ReadonlyArray<MetroSourceMapSegmentTuple>,
): VlqMap;
/**
 * Encodes a `VlqMap` directly from a Babel/gen-mapping "decoded" source map
 * (`result.decodedMap` from `@babel/generator`), without ever materialising the
 * intermediate `Array<MetroSourceMapSegmentTuple>`.
 *
 * `@babel/generator` computes `decodedMap` eagerly while generating, so reusing
 * it avoids the separate, more expensive `result.rawMappings` decode (which
 * allocates a flat array of segment objects) plus the per-segment tuple
 * allocation that `vlqMapFromTuples` would otherwise consume. The result is
 * byte-identical to `vlqMapFromTuples(decoded -> tuples)`.
 *
 * `terminatingMapping` is a `[generatedLine1Based, generatedColumn0Based]`
 * generated-only mapping appended at the end (matching the transform worker's
 * `countLinesAndTerminateMap`) unless the last real mapping already sits there.
 */
declare function vlqMapFromBabelDecodedMap(
  decodedMap: BabelDecodedMap,
  terminatingMapping: [number, number],
): VlqMap;
export {
  BundleBuilder,
  composeSourceMaps,
  Consumer,
  createIndexMap,
  generateFunctionMap,
  fromRawMappings,
  fromRawMappingsIndexed,
  fromRawMappingsNonBlocking,
  functionMapBabelPlugin,
  isVlqMap,
  normalizeSourcePath,
  toBabelSegments,
  toSegmentTuple,
  tuplesFromBabelDecodedMap,
  vlqMapFromBabelDecodedMap,
  vlqMapFromTuples,
};
