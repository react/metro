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

import type {BasicSourceMap, IndexMap, MixedSourceMap} from 'metro-source-map';

import {normalizeSourcePath} from 'metro-source-map';

type SourceNameNormalizer = (
  v0: string,
  v1: {readonly sourceRoot?: ?string, ...},
) => string;

/**
  * Consumes the `x_google_ignoreList` metadata field from a source map and
  * exposes various queries on it.
  *
  * By default, source names are normalized using the same logic that the
  * `source-map@0.5.6` package uses internally. This is crucial for keeping the
  * sources list in sync with a `SourceMapConsumer` instance.

  * If you're using this with a different source map reader (e.g. one that
  * doesn't normalize source names at all), you can switch out the normalization
  * function in the constructor, e.g.
  *
  *     new GoogleIgnoreListConsumer(map, source => source) // Don't normalize
  */
export default class GoogleIgnoreListConsumer {
  constructor(
    map: MixedSourceMap,
    normalizeSourceFn: SourceNameNormalizer = normalizeSourcePath,
  ) {
    this._sourceMap = map;
    this._normalizeSource = normalizeSourceFn;
  }

  _sourceMap: MixedSourceMap;
  _normalizeSource: SourceNameNormalizer;
  _ignoredSourceSet: ?Set<string>;

  /**
   * Returns `true` if the given source is in this map's ignore list, `false`
   * otherwise.
   *
   * When used with the `source-map` package, you'll first use
   * `SourceMapConsumer#originalPositionFor` to retrieve a source location,
   * then pass that location to `isIgnored`.
   */
  isIgnored({source}: {readonly source: ?string, ...}): boolean {
    return source != null && this._getIgnoredSourceSet().has(source);
  }

  /**
   * Returns this map's ignore list as a new array with indices based on
   * `sources`.
   *
   * This array can be used as the `x_google_ignoreList` field of a map whose
   * `sources` field is the array that was passed into this method.
   */
  toArray(sources: ReadonlyArray<?string>): Array<number> {
    const ignoredSourceSet = this._getIgnoredSourceSet();
    const encoded = [];
    for (const [sourceIndex, source] of sources.entries()) {
      if (source != null && ignoredSourceSet.has(source)) {
        encoded.push(sourceIndex);
      }
    }
    return encoded;
  }

  /**
   * Prepares and caches a set of ignored sources for this map.
   */
  _getIgnoredSourceSet(): ReadonlySet<string> {
    if (!this._ignoredSourceSet) {
      const ignoredSourceSet = new Set<string>();

      this._buildIgnoredSourceSet(this._sourceMap, ignoredSourceSet);
      this._ignoredSourceSet = ignoredSourceSet;
    }
    return this._ignoredSourceSet;
  }

  /**
   * Collects ignored sources from the given map using the current source name
   * normalization function. Handles both index maps (with sections) and plain
   * maps.
   *
   * NOTE: If any sources are repeated in the map, we consider a source to be
   * ignored as long as a source with the same normalized name is listed in AT
   * LEAST one `x_google_ignoreList` array. Technically, this means we lose
   * the granularity afforded by index maps and by the ability to repeat source
   * names within a single `sources` array.
   *
   * Chrome's handling of duplicates is different: only the first occurrence of
   * a given source is considered when determining if a source is ignored. It's
   * unclear whether this is intentional. Absent a formal spec for
   * `x_google_ignoreList`, we will diverge from Chrome for now.
   *
   * See: https://github.com/ChromeDevTools/devtools-frontend/blob/7afc9157b8d05de06e273284119e9c55a4eadb72/front_end/core/sdk/SourceMap.ts#L425-L429
   */
  _buildIgnoredSourceSet(
    map: MixedSourceMap,
    ignoredSourceSet: Set<string>,
  ): void {
    // eslint-disable-next-line lint/strictly-null
    if (map.mappings === undefined) {
      const indexMap: IndexMap = map;
      indexMap.sections.forEach(section =>
        this._buildIgnoredSourceSet(section.map, ignoredSourceSet),
      );
      return;
    }

    if ('x_google_ignoreList' in map) {
      const basicMap: BasicSourceMap = map;
      (basicMap.x_google_ignoreList || []).forEach(sourceIndex => {
        let source = basicMap.sources[sourceIndex];
        if (source != null) {
          source = this._normalizeSource(source, basicMap);
          ignoredSourceSet.add(source);
        }
      });
    }
  }
}
