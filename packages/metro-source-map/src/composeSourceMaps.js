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
import type {IConsumer, MixedSourceMap} from './source-map';
import type {Number0, Number1} from 'ob1';

import Consumer from './Consumer';
import {SourceMapGenerator} from 'source-map';

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

  const generator = new SourceMapGenerator({
    file: consumers[0].file,
  });

  const earlierConsumers = consumers.slice(1);
  consumers[0].eachMapping(mapping => {
    const original =
      mapping.originalLine == null || mapping.originalColumn == null
        ? {line: null, column: null, source: null, name: null}
        : earlierConsumers.length === 0
          ? {
              line: mapping.originalLine,
              column: mapping.originalColumn,
              source: mapping.source,
              name: mapping.name,
            }
          : findOriginalPosition(
              earlierConsumers,
              mapping.originalLine,
              mapping.originalColumn,
            );
    generator.addMapping({
      generated: {
        line: mapping.generatedLine,
        column: mapping.generatedColumn,
      },
      original:
        original.line != null
          ? {
              line: original.line,
              column: original.column,
            }
          : null,
      source: original.source,
      name: original.name,
    });
  });

  const composedMap = generator.toJSON();

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
