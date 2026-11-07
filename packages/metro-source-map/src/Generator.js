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

import type {
  BasicSourceMap,
  FBSourceFunctionMap,
  FBSourceMetadata,
} from './source-map';

import B64Builder from './B64Builder';

type FileFlags = Readonly<{
  addToIgnoreList?: boolean,
}>;

/**
 * Generates a source map from raw mappings.
 *
 * Raw mappings are a set of 2, 4, or five elements:
 *
 * - line and column number in the generated source
 * - line and column number in the original source
 * - symbol name in the original source
 *
 * Mappings have to be passed in the order appearance in the generated source.
 */
export default class Generator {
  builder: B64Builder;
  last: {
    generatedColumn: number,
    generatedLine: number,
    name: number,
    source: number,
    sourceColumn: number,
    sourceLine: number,
  };
  names: IndexedSet;
  source: number;
  sources: Array<string>;
  sourcesContent: Array<?string>;
  x_facebook_sources: Array<?FBSourceMetadata>;
  // https://developer.chrome.com/blog/devtools-better-angular-debugging/#the-x_google_ignorelist-source-map-extension
  x_google_ignoreList: Array<number>;

  constructor() {
    this.builder = new B64Builder();
    this.last = {
      generatedColumn: 0,
      generatedLine: 1, // lines are passed in 1-indexed
      name: 0,
      source: 0,
      sourceColumn: 0,
      sourceLine: 1,
    };
    this.names = new IndexedSet();
    this.source = -1;
    this.sources = [];
    this.sourcesContent = [];
    this.x_facebook_sources = [];
    this.x_google_ignoreList = [];
  }

  /**
   * Mark the beginning of a new source file.
   */
  startFile(
    file: string,
    code: string,
    functionMap: ?FBSourceFunctionMap,
    flags?: FileFlags,
  ) {
    const {addToIgnoreList = false} = flags ?? {};
    const sourceIndex = this.sources.push(file) - 1;
    this.source = sourceIndex;
    this.sourcesContent.push(code);
    this.x_facebook_sources.push(functionMap ? [functionMap] : null);
    if (addToIgnoreList) {
      this.x_google_ignoreList.push(sourceIndex);
    }
  }

  /**
   * Mark the end of the current source file
   */
  endFile() {
    this.source = -1;
  }

  /**
   * Adds a mapping for generated code without a corresponding source location.
   */
  addSimpleMapping(generatedLine: number, generatedColumn: number): void {
    const last = this.last;
    if (
      this.source === -1 ||
      (generatedLine === last.generatedLine &&
        generatedColumn < last.generatedColumn) ||
      generatedLine < last.generatedLine
    ) {
      const msg =
        this.source === -1
          ? 'Cannot add mapping before starting a file with `addFile()`'
          : 'Mapping is for a position preceding an earlier mapping';
      throw new Error(msg);
    }

    if (generatedLine > last.generatedLine) {
      this.builder.markLines(generatedLine - last.generatedLine);
      last.generatedLine = generatedLine;
      last.generatedColumn = 0;
    }

    this.builder.startSegment(generatedColumn - last.generatedColumn);
    last.generatedColumn = generatedColumn;
  }

  /**
   * Adds a mapping for generated code with a corresponding source location.
   */
  addSourceMapping(
    generatedLine: number,
    generatedColumn: number,
    sourceLine: number,
    sourceColumn: number,
  ): void {
    this.addSimpleMapping(generatedLine, generatedColumn);

    const last = this.last;
    this.builder
      .append(this.source - last.source)
      .append(sourceLine - last.sourceLine)
      .append(sourceColumn - last.sourceColumn);

    last.source = this.source;
    last.sourceColumn = sourceColumn;
    last.sourceLine = sourceLine;
  }

  /**
   * Adds a mapping for code with a corresponding source location + symbol name.
   */
  addNamedSourceMapping(
    generatedLine: number,
    generatedColumn: number,
    sourceLine: number,
    sourceColumn: number,
    name: string,
  ): void {
    this.addSourceMapping(
      generatedLine,
      generatedColumn,
      sourceLine,
      sourceColumn,
    );

    const last = this.last;
    const nameIndex = this.names.indexFor(name);
    this.builder.append(nameIndex - last.name);
    last.name = nameIndex;
  }

  /**
   * Return the source map as object.
   */
  toMap(
    file?: string,
    options?: {excludeSource?: boolean, ...},
  ): BasicSourceMap {
    const content: {
      sourcesContent?: Array<?string>,
    } =
      options && options.excludeSource === true
        ? {}
        : {sourcesContent: this.sourcesContent.slice()};

    const sourcesMetadata: {
      x_facebook_sources?: Array<FBSourceMetadata>,
    } = this.hasSourcesMetadata()
      ? {
          x_facebook_sources: JSON.parse(
            JSON.stringify(this.x_facebook_sources),
          ),
        }
      : {};

    const ignoreList: {
      x_google_ignoreList?: Array<number>,
    } = this.x_google_ignoreList.length
      ? {
          x_google_ignoreList: this.x_google_ignoreList,
        }
      : {};

    return {
      version: 3,
      file,
      sources: this.sources.slice(),
      ...content,
      ...sourcesMetadata,
      ...ignoreList,
      names: this.names.items(),
      mappings: this.builder.toString(),
    } as BasicSourceMap;
  }

  /**
   * Return the source map as string.
   *
   * This is ~2.5x faster than calling `JSON.stringify(generator.toMap())`
   */
  toString(file?: string, options?: {excludeSource?: boolean, ...}): string {
    let content;
    if (options && options.excludeSource === true) {
      content = '';
    } else {
      content = `"sourcesContent":${JSON.stringify(this.sourcesContent)},`;
    }

    let sourcesMetadata;
    if (this.hasSourcesMetadata()) {
      sourcesMetadata = `"x_facebook_sources":${JSON.stringify(
        this.x_facebook_sources,
      )},`;
    } else {
      sourcesMetadata = '';
    }

    let ignoreList;
    if (this.x_google_ignoreList.length) {
      ignoreList = `"x_google_ignoreList":${JSON.stringify(
        this.x_google_ignoreList,
      )},`;
    } else {
      ignoreList = '';
    }

    return (
      '{' +
      '"version":3,' +
      (file != null ? `"file":${JSON.stringify(file)},` : '') +
      `"sources":${JSON.stringify(this.sources)},` +
      content +
      sourcesMetadata +
      ignoreList +
      `"names":${JSON.stringify(this.names.items())},` +
      `"mappings":"${this.builder.toString()}"` +
      '}'
    );
  }

  /**
   * Determine whether we need to write the `x_facebook_sources` field.
   * If the metadata is all `null`s, we can omit the field entirely.
   */
  hasSourcesMetadata(): boolean {
    return this.x_facebook_sources.some(
      metadata => metadata != null && metadata.some(value => value != null),
    );
  }
}

class IndexedSet {
  map: Map<string, number>;
  nextIndex: number;

  constructor() {
    this.map = new Map();
    this.nextIndex = 0;
  }

  indexFor(x: string): number {
    let index = this.map.get(x);
    if (index == null) {
      index = this.nextIndex++;
      this.map.set(x, index);
    }
    return index;
  }

  items(): Array<string> {
    return Array.from(this.map.keys());
  }
}
