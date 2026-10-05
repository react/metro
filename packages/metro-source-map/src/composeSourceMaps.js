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

import type {SourcePosition} from './Consumer/types';
import type {
  FBSourcesArray,
  HermesFunctionOffsets,
  IConsumer,
  MixedSourceMap,
} from './source-map';
import type {Number0, Number1} from 'ob1';

import B64Builder from './B64Builder';
import Consumer from './Consumer';
import {get0, get1} from 'ob1';

// TODO(t67648443): Bypass the `sort-requires` rule for this file because of a dependency cycle.
Consumer;

// Originally based on https://github.com/jakobwesthoff/source-map-merger
export default function composeSourceMaps(
  maps: ReadonlyArray<MixedSourceMap>,
): MixedSourceMap {
  // NOTE: require() here to break dependency cycle
  const SourceMetadataMapConsumer =
    // eslint-disable-next-line import/no-commonjs
    require('metro-symbolicate/private/SourceMetadataMapConsumer').default;
  const GoogleIgnoreListConsumer =
    // eslint-disable-next-line import/no-commonjs
    require('metro-symbolicate/private/GoogleIgnoreListConsumer').default;
  if (maps.length < 1) {
    throw new Error('composeSourceMaps: Expected at least one map');
  }
  const firstMap = maps[0];

  const consumers = maps
    .map(function (map) {
      return new Consumer(map);
    })
    .reverse();

  const sources: Array<string> = [];
  const names: Array<string> = [];
  const sourceIndices: Map<string, number> = new Map();
  const nameIndices: Map<string, number> = new Map();

  // The composed mappings as parallel arrays, in the order the last map
  // yields them. An unmapped position has source index -1 and original
  // line and column 0.
  const generatedLines: Array<number> = [];
  const generatedColumns: Array<number> = [];
  const mappingSources: Array<number> = [];
  const originalLines: Array<number> = [];
  const originalColumns: Array<number> = [];
  const mappingNames: Array<number> = [];
  let sorted = true;

  const earlierConsumers = consumers.slice(1);
  consumers[0].eachMapping(mapping => {
    let originalLine: ?number = null;
    let originalColumn: ?number = null;
    let source: ?string = null;
    let name: ?string = null;
    const mappingOriginalLine = mapping.originalLine;
    const mappingOriginalColumn = mapping.originalColumn;
    if (mappingOriginalLine != null && mappingOriginalColumn != null) {
      if (earlierConsumers.length === 0) {
        originalLine = get1(mappingOriginalLine);
        originalColumn = get0(mappingOriginalColumn);
        source = mapping.source;
        name = mapping.name;
      } else {
        const original = findOriginalPosition(
          earlierConsumers,
          mappingOriginalLine,
          mappingOriginalColumn,
        );
        originalLine = original.line;
        originalColumn = original.column;
        source = original.source;
        name = original.name;
      }
    }
    const generatedLine = get1(mapping.generatedLine);
    const generatedColumn = get0(mapping.generatedColumn);
    const hasOriginal = originalLine != null;
    if (!(
      generatedLine > 0 &&
      generatedColumn >= 0 &&
      (originalLine != null
        ? originalLine > 0 && (originalColumn ?? 0) >= 0 && source
        : !source && !name)
    )) {
      throw new Error(
        'Invalid mapping: ' +
          JSON.stringify({
            generated: {line: generatedLine, column: generatedColumn},
            source,
            original: hasOriginal
              ? {line: originalLine, column: originalColumn}
              : null,
            name,
          }),
      );
    }

    const count = generatedLines.length;
    if (
      count > 0 &&
      (generatedLine < generatedLines[count - 1] ||
        (generatedLine === generatedLines[count - 1] &&
          generatedColumn < generatedColumns[count - 1]))
    ) {
      sorted = false;
    }
    generatedLines.push(generatedLine);
    generatedColumns.push(generatedColumn);
    if (originalLine != null && source != null) {
      let sourceIndex = sourceIndices.get(source);
      if (sourceIndex == null) {
        sourceIndex = sources.length;
        sources.push(source);
        sourceIndices.set(source, sourceIndex);
      }
      mappingSources.push(sourceIndex);
      originalLines.push(originalLine);
      originalColumns.push(originalColumn ?? 0);
    } else {
      mappingSources.push(-1);
      originalLines.push(0);
      originalColumns.push(0);
    }
    if (name != null) {
      let nameIndex = nameIndices.get(name);
      if (nameIndex == null) {
        nameIndex = names.length;
        names.push(name);
        nameIndices.set(name, nameIndex);
      }
      mappingNames.push(nameIndex);
    } else {
      mappingNames.push(-1);
    }
  });

  // Orders two composed mappings by generated position, then source,
  // original position and name.
  const compare = (a: number, b: number): number =>
    generatedLines[a] - generatedLines[b] ||
    generatedColumns[a] - generatedColumns[b] ||
    compareStrings(
      mappingSources[a] === -1 ? null : sources[mappingSources[a]],
      mappingSources[b] === -1 ? null : sources[mappingSources[b]],
    ) ||
    originalLines[a] - originalLines[b] ||
    originalColumns[a] - originalColumns[b] ||
    compareStrings(
      mappingNames[a] === -1 ? null : names[mappingNames[a]],
      mappingNames[b] === -1 ? null : names[mappingNames[b]],
    );

  const count = generatedLines.length;
  let order: ?Array<number> = null;
  if (!sorted) {
    order = Array.from({length: count}, (_, i) => i);
    order.sort(compare);
  }

  // Encode the mappings, dropping any identical to the one before it.
  const builder = new B64Builder();
  let previousIndex = -1;
  let previousGeneratedLine = 1;
  let previousGeneratedColumn = 0;
  let previousSource = 0;
  let previousOriginalLine = 0;
  let previousOriginalColumn = 0;
  let previousName = 0;
  for (let position = 0; position < count; position++) {
    const index = order == null ? position : order[position];
    const generatedLine = generatedLines[index];
    if (generatedLine !== previousGeneratedLine) {
      builder.markLines(generatedLine - previousGeneratedLine);
      previousGeneratedLine = generatedLine;
      previousGeneratedColumn = 0;
    } else if (previousIndex !== -1 && compare(index, previousIndex) === 0) {
      previousIndex = index;
      continue;
    }
    previousIndex = index;

    builder.startSegment(generatedColumns[index] - previousGeneratedColumn);
    previousGeneratedColumn = generatedColumns[index];
    const sourceIndex = mappingSources[index];
    if (sourceIndex !== -1) {
      builder.append(sourceIndex - previousSource);
      previousSource = sourceIndex;
      // Original lines are 0-based in the encoding.
      builder.append(originalLines[index] - 1 - previousOriginalLine);
      previousOriginalLine = originalLines[index] - 1;
      builder.append(originalColumns[index] - previousOriginalColumn);
      previousOriginalColumn = originalColumns[index];
      const nameIndex = mappingNames[index];
      if (nameIndex !== -1) {
        builder.append(nameIndex - previousName);
        previousName = nameIndex;
      }
    }
  }

  const composedMap: {
    version: number,
    sources: Array<string>,
    names: Array<string>,
    mappings: string,
    file?: string,
    sourcesContent?: Array<?string>,
    x_facebook_sources?: FBSourcesArray,
    x_hermes_function_offsets?: HermesFunctionOffsets,
    x_google_ignoreList?: Array<number>,
  } = {version: 3, sources, names, mappings: builder.toString()};
  const {file} = consumers[0];
  if (file != null) {
    composedMap.file = file;
  }

  composedMap.sourcesContent = composedMap.sources.map(source =>
    consumers[consumers.length - 1].sourceContentFor(source, true),
  );
  if (composedMap.sourcesContent.every(content => content == null)) {
    delete composedMap.sourcesContent;
  }
  const metadataConsumer = new SourceMetadataMapConsumer(firstMap);
  composedMap.x_facebook_sources = metadataConsumer.toArray(
    composedMap.sources,
  );
  const function_offsets = maps[maps.length - 1].x_hermes_function_offsets;
  if (function_offsets) {
    composedMap.x_hermes_function_offsets = function_offsets;
  }
  const ignoreListConsumer = new GoogleIgnoreListConsumer(firstMap);
  const x_google_ignoreList = ignoreListConsumer.toArray(composedMap.sources);
  if (x_google_ignoreList.length) {
    composedMap.x_google_ignoreList = x_google_ignoreList;
  }
  return composedMap;
}

function compareStrings(a: ?string, b: ?string): number {
  if (a === b) {
    return 0;
  }
  // $FlowFixMe[invalid-compare] Matches `source-map`'s ordering, null included
  return a > b ? 1 : -1;
}

function findOriginalPosition(
  consumers: ReadonlyArray<IConsumer>,
  generatedLine: Number1,
  generatedColumn: Number0,
): {
  line: ?number,
  column: ?number,
  source: ?string,
  name: ?string,
  ...
} {
  let currentLine: ?Number1 = generatedLine;
  let currentColumn: ?Number0 = generatedColumn;
  let original: SourcePosition = {
    line: null,
    column: null,
    source: null,
    name: null,
  };

  for (const consumer of consumers) {
    if (currentLine == null || currentColumn == null) {
      return {line: null, column: null, source: null, name: null};
    }
    original = consumer.originalPositionFor({
      line: currentLine,
      column: currentColumn,
    });

    currentLine = original.line;
    currentColumn = original.column;

    if (currentLine == null) {
      return {
        line: null,
        column: null,
        source: null,
        name: null,
      };
    }
  }
  // $FlowFixMe[incompatible-type] `Number0`, `Number1` is incompatible with number
  return original;
}
