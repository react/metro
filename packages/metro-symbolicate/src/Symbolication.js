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

import type {ChromeHeapSnapshot} from './ChromeHeapSnapshot';
import type {HermesFunctionOffsets, MixedSourceMap} from 'metro-source-map';
import type {Writable} from 'node:stream';

import {ChromeHeapSnapshotProcessor} from './ChromeHeapSnapshot';
import GoogleIgnoreListConsumer from './GoogleIgnoreListConsumer';
import SourceMetadataMapConsumer from './SourceMetadataMapConsumer';
import invariant from 'invariant';
import fs from 'node:fs';
import path from 'node:path';
import nullthrows from 'nullthrows';
// flowlint-next-line untyped-type-import:off
import {typeof SourceMapConsumer} from 'source-map';

type SingleMapModuleIds = {
  segmentId: number,
  localId: ?number,
  ...
};

type ContextOptionsInput = {
  readonly nameSource?: 'function_names' | 'identifier_names',
  readonly inputLineStart?: number,
  readonly inputColumnStart?: number,
  readonly outputLineStart?: number,
  readonly outputColumnStart?: number,
  ...
};

type SizeAttributionMap = {
  location: {
    file: ?string,
    filename?: string,
    bytecodeSize?: number,
    virtualOffset?: number,
    line: ?number,
    column: ?number,
  },
  ...
};

type ChromeTraceEntry = {
  column: number,
  funcColumn: number,
  funcLine: number,
  funcVirtAddr: number,
  line: number,
  name: string,
  offset: number,
};

type ChromeTrace = {
  stackFrames: {[string]: ChromeTraceEntry},
};

type HermesMinidumpCrashInfo = {
  readonly callstack: ReadonlyArray<
    HermesMinidumpStackFrame | NativeCodeStackFrame,
  >,
  ...
};

type HermesMinidumpStackFrame = Readonly<{
  ByteCodeOffset: number,
  FunctionID: number,
  // NOTE: CJSModuleOffset has been renamed to SegmentID. Support both formats for now.
  CJSModuleOffset?: number,
  SegmentID?: number,
  SourceURL: string,
  StackFrameRegOffs: string,
  SourceLocation?: string,
}>;

type HermesCoverageInfo = {
  readonly executedFunctions: ReadonlyArray<HermesCoverageStackFrame>,
};

type HermesCoverageStackFrame = Readonly<{
  line: number, // SegmentID or zero-based line,
  column: number, // VirtualOffset or zero-based column,
  SourceURL: ?string,
}>;

type NativeCodeStackFrame = Readonly<{
  NativeCode: true,
  StackFrameRegOffs: string,
}>;

type SymbolicatedStackTrace = ReadonlyArray<
  SymbolicatedStackFrame | NativeCodeStackFrame,
>;

type SymbolicatedStackFrame = Readonly<{
  line: ?number,
  column: ?number,
  source: ?string,
  functionName: ?string,
  name: ?string,
  isIgnored: boolean,
}>;

const UNKNOWN_MODULE_IDS: SingleMapModuleIds = {
  segmentId: 0,
  localId: undefined,
};

class SymbolicationContext<ModuleIdsT> {
  readonly options: {
    readonly nameSource: 'function_names' | 'identifier_names',
    readonly inputLineStart: number,
    readonly inputColumnStart: number,
    readonly outputLineStart: number,
    readonly outputColumnStart: number,
    ...
  };

  constructor(options: ContextOptionsInput) {
    this.options = {
      inputLineStart: 1,
      inputColumnStart: 0,
      outputLineStart: 1,
      outputColumnStart: 0,
      nameSource: 'function_names',
    };
    if (options) {
      for (const option of [
        'inputLineStart',
        'inputColumnStart',
        'outputLineStart',
        'outputColumnStart',
      ] as const) {
        if (options[option] != null) {
          /* $FlowFixMe[incompatible-type] error found during natural inference
           * roll-out. See https://fburl.com/workplace/tc9m3tcf */
          this.options[option] = options[option];
        }
      }
      if (options.nameSource != null) {
        // $FlowFixMe[cannot-write]
        this.options.nameSource = options.nameSource;
      }
    }
  }

  // parse stack trace with String.replace
  // replace the matched part of stack trace to symbolicated result
  // sample stack trace:
  //  IOS: foo@4:18131, Android: bar:4:18063
  // sample stack trace with module id:
  //  IOS: foo@123.js:4:18131, Android: bar:123.js:4:18063
  // sample stack trace without function name:
  //  123.js:4:18131
  // sample result:
  //  IOS: foo.js:57:foo, Android: bar.js:75:bar
  symbolicate(stackTrace: string): string {
    return stackTrace.replace(
      /(?:([^@: \n(]+)(@|:))?(?:(?:([^@: \n(]+):)?(\d+):(\d+)|\[native code\])/g,
      (match, func, delimiter, fileName, line, column) => {
        if (delimiter === ':' && func && !fileName) {
          fileName = func;
          func = null;
        }
        const original = this.getOriginalPositionFor(
          line,
          column,
          this.parseFileName(fileName || ''),
        );
        return (
          (original.source ?? 'null') +
          ':' +
          (original.line ?? 'null') +
          ':' +
          (original.name ?? 'null')
        );
      },
    );
  }

  // Taking in a map like
  // trampoline offset (optional js function name)
  // JS_0158_xxxxxxxxxxxxxxxxxxxxxx fe 91081
  // JS_0159_xxxxxxxxxxxxxxxxxxxxxx Ft 68651
  // JS_0160_xxxxxxxxxxxxxxxxxxxxxx value 50700
  // JS_0161_xxxxxxxxxxxxxxxxxxxxxx setGapAtCursor 0
  // JS_0162_xxxxxxxxxxxxxxxxxxxxxx (unknown) 50818
  // JS_0163_xxxxxxxxxxxxxxxxxxxxxx value 108267

  symbolicateProfilerMap(mapFile: string): string {
    return fs
      .readFileSync(mapFile, 'utf8')
      .split('\n')
      .slice(0, -1)
      .map(line => {
        const line_list = line.split(' ');
        const trampoline = line_list[0];
        const js_name = line_list[1];
        const offset = parseInt(line_list[2], 10);

        if (!offset) {
          return trampoline + ' ' + trampoline;
        }

        const original = this.getOriginalPositionFor(
          this.options.inputLineStart,
          offset,
        );

        return (
          trampoline +
          ' ' +
          (original.name || js_name) +
          '::' +
          [original.source, original.line, original.column].join(':')
        );
      })
      .join('\n');
  }

  symbolicateAttribution(obj: SizeAttributionMap): void {
    const loc = obj.location;
    const line = loc.line != null ? loc.line : this.options.inputLineStart;
    let column = Number(loc.column != null ? loc.column : loc.virtualOffset);
    const file = loc.filename ? this.parseFileName(loc.filename) : null;
    let original = this.getOriginalPositionFor(line, column, file);

    const isBytecodeRange =
      loc.bytecodeSize != null &&
      loc.virtualOffset != null &&
      loc.column == null;
    const virtualOffset = Number(loc.virtualOffset);
    const bytecodeSize = Number(loc.bytecodeSize);

    // Functions compiled from Metro-bundled modules will often have a little bit
    // of unmapped wrapper code right at the beginning - which is where we query.
    // Let's attribute them to where the inner module code originates instead.
    // This loop is O(n*log(n)) in the size of the function, but we will generally
    // either:
    // 1. Find a non-null mapping within one or two iterations; or
    // 2. Reach the end of the function without encountering mappings - this might
    //    happen for function bodies that never throw (generally very short).
    while (
      isBytecodeRange &&
      original.source == null &&
      ++column < virtualOffset + bytecodeSize
    ) {
      original = this.getOriginalPositionFor(line, column, file);
    }

    obj.location = {
      file: original.source,
      line: original.line,
      column: original.column,
    };
  }

  // Symbolicate chrome trace "stackFrames" section.
  // Each frame in it has three fields: name, funcVirtAddr(optional), offset(optional).
  // funcVirtAddr and offset are only available if trace is generated from
  // hbc bundle without debug info.
  symbolicateChromeTrace(
    traceFile: string,
    {
      stdout,
      stderr,
    }: {
      stdout: Writable,
      stderr: Writable,
      ...
    },
  ): void {
    const content: ChromeTrace = JSON.parse(fs.readFileSync(traceFile, 'utf8'));
    if (content.stackFrames == null) {
      throw new Error('Unable to locate `stackFrames` section in trace.');
    }
    const keys = Object.keys(content.stackFrames);
    stdout.write('Processing ' + keys.length + ' frames\n');
    keys.forEach(key => {
      const entry = content.stackFrames[key];
      let line;
      let column;

      // Function entrypoint line/column; used for symbolicating function name
      // with legacy source maps (or when --no-function-names is set).
      let funcLine;
      let funcColumn;

      if (entry.funcVirtAddr != null && entry.offset != null) {
        // Without debug information.
        const funcVirtAddr = parseInt(entry.funcVirtAddr, 10);
        const offsetInFunction = parseInt(entry.offset, 10);
        // Main bundle always use hard-coded line value 1.
        // TODO: support multiple bundle/module.
        line = this.options.inputLineStart;
        column = funcVirtAddr + offsetInFunction;
        funcLine = this.options.inputLineStart;
        funcColumn = funcVirtAddr;
      } else if (entry.line != null && entry.column != null) {
        // For hbc bundle with debug info, name field may already have source
        // information for the bundle; we still can use the Metro
        // source map to symbolicate the bundle frame addresses further to its
        // original source code.
        line = entry.line;
        column = entry.column;

        funcLine = entry.funcLine;
        funcColumn = entry.funcColumn;
      } else {
        // Native frames.
        return;
      }

      // Symbolicate original file/line/column.
      const addressOriginal = this.getOriginalPositionDetailsFor(line, column);

      let frameName;
      if (addressOriginal.functionName) {
        frameName = addressOriginal.functionName;
      } else {
        frameName = entry.name;
        // Symbolicate function name.
        if (funcLine != null && funcColumn != null) {
          const funcOriginal = this.getOriginalPositionFor(
            funcLine,
            funcColumn,
          );
          if (funcOriginal.name != null) {
            frameName = funcOriginal.name;
          }
        } else {
          // No function line/column info.
          (stderr || stdout).write(
            'Warning: no function prolog line/column info; name may be wrong\n',
          );
        }
      }

      // Output format is: funcName(file:line:column)
      entry.name = [
        frameName,
        '(',
        [
          addressOriginal.source ?? 'null',
          addressOriginal.line ?? 'null',
          addressOriginal.column ?? 'null',
        ].join(':'),
        ')',
      ].join('');
    });
    stdout.write('Writing to ' + traceFile + '\n');
    fs.writeFileSync(traceFile, JSON.stringify(content));
  }

  /*
   * A helper function to return a mapping {line, column} object for a given input
   * line and column, and optionally a module ID.
   */
  getOriginalPositionFor(
    lineNumber: ?number,
    columnNumber: ?number,
    moduleIds: ?ModuleIdsT,
  ): {
    line: ?number,
    column: ?number,
    source: ?string,
    name: ?string,
  } {
    const position = this.getOriginalPositionDetailsFor(
      lineNumber,
      columnNumber,
      moduleIds,
    );
    return {
      line: position.line,
      column: position.column,
      source: position.source,
      name: position.functionName ? position.functionName : position.name,
    };
  }

  /*
   * Symbolicates the JavaScript stack trace extracted from the minidump
   * produced by hermes
   */
  symbolicateHermesMinidumpTrace(
    crashInfo: HermesMinidumpCrashInfo,
  ): SymbolicatedStackTrace {
    throw new Error('Not implemented');
  }

  /**
   * Symbolicates heap alloction stacks in a Chrome-formatted heap
   * snapshot/timeline.
   * Line and column offsets in options (both input and output) are _ignored_,
   * because this format has a well-defined convention (1-based lines and
   * columns).
   */
  symbolicateHeapSnapshot(
    snapshotContents: string | ChromeHeapSnapshot,
  ): ChromeHeapSnapshot {
    const snapshotData: ChromeHeapSnapshot =
      typeof snapshotContents === 'string'
        ? JSON.parse(snapshotContents)
        : snapshotContents;
    const processor = new ChromeHeapSnapshotProcessor(snapshotData);
    for (const frame of processor.traceFunctionInfos()) {
      const moduleIds = this.parseFileName(frame.getString('script_name'));
      const generatedLine = frame.getNumber('line');
      const generatedColumn = frame.getNumber('column');
      if (generatedLine === 0 && generatedColumn === 0) {
        continue;
      }
      const {
        line: originalLine,
        column: originalColumn,
        source: originalSource,
        functionName: originalFunctionName,
      } = this.getOriginalPositionDetailsFor(
        frame.getNumber('line') - 1 + this.options.inputLineStart,
        frame.getNumber('column') - 1 + this.options.inputColumnStart,
        moduleIds,
      );
      if (originalSource != null) {
        frame.setString('script_name', originalSource);
        if (originalLine != null) {
          frame.setNumber(
            'line',
            originalLine - this.options.outputLineStart + 1,
          );
        } else {
          frame.setNumber('line', 0);
        }
        if (originalColumn != null) {
          frame.setNumber(
            'column',
            originalColumn - this.options.outputColumnStart + 1,
          );
        } else {
          frame.setNumber('column', 0);
        }
      }
      frame.setString('name', originalFunctionName ?? frame.getString('name'));
    }
    return snapshotData;
  }

  /*
   * Symbolicates the JavaScript stack trace extracted from the coverage information
   * produced by HermesRuntime::getExecutedFunctions.
   */
  symbolicateHermesCoverageTrace(
    coverageInfo: HermesCoverageInfo,
  ): SymbolicatedStackTrace {
    const symbolicatedTrace = [];
    const {executedFunctions} = coverageInfo;

    if (executedFunctions != null) {
      for (const stackItem of executedFunctions) {
        const {line, column, SourceURL} = stackItem;
        const generatedLine = line + this.options.inputLineStart;
        const generatedColumn = column + this.options.inputColumnStart;
        const originalPosition = this.getOriginalPositionDetailsFor(
          generatedLine,
          generatedColumn,
          this.parseFileName(SourceURL || ''),
        );
        symbolicatedTrace.push(originalPosition);
      }
    }
    return symbolicatedTrace;
  }
  /*
   * An internal helper function similar to getOriginalPositionFor. This one
   * returns both `name` and `functionName` fields so callers can distinguish the
   * source of the name.
   */
  getOriginalPositionDetailsFor(
    lineNumber: ?number,
    columnNumber: ?number,
    moduleIds: ?ModuleIdsT,
  ): SymbolicatedStackFrame {
    throw new Error('Not implemented');
  }

  parseFileName(str: string): ModuleIdsT {
    throw new Error('Not implemented');
  }
}

class SingleMapSymbolicationContext extends SymbolicationContext<SingleMapModuleIds> {
  readonly _segments: {
    readonly [id: string]: {
      // $FlowFixMe[value-as-type]
      readonly consumer: SourceMapConsumer,
      readonly moduleOffsets: ReadonlyArray<number>,
      readonly sourceFunctionsConsumer: ?SourceMetadataMapConsumer,
      readonly hermesOffsets: ?HermesFunctionOffsets,
      readonly googleIgnoreListConsumer: GoogleIgnoreListConsumer,
    },
    ...
  };
  readonly _legacyFormat: boolean;
  // $FlowFixMe[value-as-type]
  readonly _SourceMapConsumer: SourceMapConsumer;

  constructor(
    // $FlowFixMe[value-as-type]
    SourceMapConsumer: SourceMapConsumer,
    sourceMapContent: string | MixedSourceMap,
    options: ContextOptionsInput = {},
  ) {
    super(options);
    this._SourceMapConsumer = SourceMapConsumer;
    const sourceMapJson: MixedSourceMap =
      typeof sourceMapContent === 'string'
        ? JSON.parse(sourceMapContent.replace(/^\)\]\}'/, ''))
        : sourceMapContent;
    const segments = {
      '0': this._initSegment(sourceMapJson),
    };
    if (sourceMapJson.x_facebook_segments) {
      for (const key of Object.keys(sourceMapJson.x_facebook_segments)) {
        // $FlowFixMe[incompatible-use]
        const map = sourceMapJson.x_facebook_segments[key];
        // $FlowFixMe[prop-missing]
        segments[key] = this._initSegment(map);
      }
    }
    this._legacyFormat =
      sourceMapJson.x_facebook_segments != null ||
      sourceMapJson.x_facebook_offsets != null;
    this._segments = segments;
  }

  // $FlowFixMe[missing-local-annot]
  _initSegment(map: MixedSourceMap) {
    const useFunctionNames = this.options.nameSource === 'function_names';
    const {_SourceMapConsumer: SourceMapConsumer} = this;
    return {
      get consumer() {
        // $FlowFixMe[object-this-reference]
        Object.defineProperty(this, 'consumer', {
          value: new SourceMapConsumer(map),
        });
        // $FlowFixMe[object-this-reference]
        return this.consumer;
      },
      moduleOffsets: map.x_facebook_offsets || [],
      get sourceFunctionsConsumer() {
        // $FlowFixMe[object-this-reference]
        Object.defineProperty(this, 'sourceFunctionsConsumer', {
          value: useFunctionNames ? new SourceMetadataMapConsumer(map) : null,
        });
        // $FlowFixMe[object-this-reference]
        return this.sourceFunctionsConsumer;
      },
      get googleIgnoreListConsumer() {
        // $FlowFixMe[object-this-reference]
        Object.defineProperty(this, 'googleIgnoreListConsumer', {
          value: new GoogleIgnoreListConsumer(map),
        });
        // $FlowFixMe[object-this-reference]
        return this.googleIgnoreListConsumer;
      },
      hermesOffsets: map.x_hermes_function_offsets,
    };
  }

  symbolicateHermesMinidumpTrace(
    crashInfo: HermesMinidumpCrashInfo,
  ): SymbolicatedStackTrace {
    const symbolicatedTrace = [];
    const {callstack} = crashInfo;
    if (callstack != null) {
      for (const stackItem of callstack) {
        if (stackItem.NativeCode) {
          symbolicatedTrace.push(stackItem);
        } else {
          const {
            CJSModuleOffset,
            SegmentID,
            SourceURL,
            FunctionID,
            ByteCodeOffset: localOffset,
          } = stackItem;
          const cjsModuleOffsetOrSegmentID = nullthrows(
            CJSModuleOffset ?? SegmentID,
            'Either CJSModuleOffset or SegmentID must be specified in the Hermes stack frame',
          );
          const moduleInformation = this.parseFileName(SourceURL);
          const generatedLine =
            cjsModuleOffsetOrSegmentID + this.options.inputLineStart;
          const segment =
            this._segments[moduleInformation.segmentId.toString()];
          const hermesOffsets = segment?.hermesOffsets;
          if (!hermesOffsets) {
            symbolicatedTrace.push({
              line: null,
              column: null,
              source: null,
              functionName: null,
              name: null,
              isIgnored: false,
            });
          } else {
            const segmentOffsets =
              hermesOffsets[Number(cjsModuleOffsetOrSegmentID)];
            const generatedColumn =
              segmentOffsets[FunctionID] +
              localOffset +
              this.options.inputColumnStart;
            const originalPosition = this.getOriginalPositionDetailsFor(
              generatedLine,
              generatedColumn,
              moduleInformation,
            );
            symbolicatedTrace.push(originalPosition);
          }
        }
      }
    }
    return symbolicatedTrace;
  }

  symbolicateHermesCoverageTrace(
    coverageInfo: HermesCoverageInfo,
  ): SymbolicatedStackTrace {
    const symbolicatedTrace = [];
    const {executedFunctions} = coverageInfo;

    if (executedFunctions != null) {
      for (const stackItem of executedFunctions) {
        const {line, column, SourceURL} = stackItem;
        const generatedLine = line + this.options.inputLineStart;
        const generatedColumn = column + this.options.inputColumnStart;
        const originalPosition = this.getOriginalPositionDetailsFor(
          generatedLine,
          generatedColumn,
          this.parseFileName(SourceURL || ''),
        );
        symbolicatedTrace.push(originalPosition);
      }
    }
    return symbolicatedTrace;
  }

  /*
   * An internal helper function similar to getOriginalPositionFor. This one
   * returns both `name` and `functionName` fields so callers can distinguish the
   * source of the name.
   */
  getOriginalPositionDetailsFor(
    lineNumber: ?number,
    columnNumber: ?number,
    moduleIds: ?SingleMapModuleIds,
  ): SymbolicatedStackFrame {
    // Adjust arguments to source-map's input coordinates
    lineNumber =
      lineNumber != null
        ? lineNumber - this.options.inputLineStart + 1
        : lineNumber;
    columnNumber =
      columnNumber != null
        ? columnNumber - this.options.inputColumnStart + 0
        : columnNumber;

    if (!moduleIds) {
      moduleIds = UNKNOWN_MODULE_IDS;
    }

    let moduleLineOffset = 0;
    const metadata = this._segments[moduleIds.segmentId + ''];
    const {localId} = moduleIds;
    if (localId != null) {
      const {moduleOffsets} = metadata;
      if (!moduleOffsets) {
        throw new Error(
          'Module ID given for a source map that does not have ' +
            'an x_facebook_offsets field',
        );
      }
      if (moduleOffsets[localId] == null) {
        throw new Error('Unknown module ID: ' + localId);
      }
      moduleLineOffset = moduleOffsets[localId];
    }
    const original = metadata.consumer.originalPositionFor({
      line: Number(lineNumber) + moduleLineOffset,
      column: Number(columnNumber),
    });
    if (metadata.sourceFunctionsConsumer) {
      original.functionName =
        metadata.sourceFunctionsConsumer.functionNameFor(original) || null;
    } else {
      original.functionName = null;
    }
    original.isIgnored = metadata.googleIgnoreListConsumer.isIgnored(original);
    return {
      ...original,
      line:
        original.line != null
          ? original.line - 1 + this.options.outputLineStart
          : original.line,
      column:
        original.column != null
          ? original.column - 0 + this.options.outputColumnStart
          : original.column,
    };
  }

  parseFileName(str: string): SingleMapModuleIds {
    if (this._legacyFormat) {
      return parseSingleMapFileName(str);
    }

    return UNKNOWN_MODULE_IDS;
  }
}

class DirectorySymbolicationContext extends SymbolicationContext<string> {
  readonly _fileMaps: Map<string, SingleMapSymbolicationContext>;
  readonly _rootDir: string;
  // $FlowFixMe[value-as-type]
  readonly _SourceMapConsumer: SourceMapConsumer;

  constructor(
    // $FlowFixMe[value-as-type]
    SourceMapConsumer: SourceMapConsumer,
    rootDir: string,
    options: ContextOptionsInput = {},
  ) {
    super(options);
    this._fileMaps = new Map();
    this._rootDir = rootDir;
    this._SourceMapConsumer = SourceMapConsumer;
  }

  _loadMap(mapFilename: string): SingleMapSymbolicationContext {
    invariant(
      fs.existsSync(mapFilename),
      `Could not read source map from '${mapFilename}'`,
    );
    let fileMap = this._fileMaps.get(mapFilename);
    if (fileMap == null) {
      fileMap = new SingleMapSymbolicationContext(
        this._SourceMapConsumer,
        fs.readFileSync(mapFilename, 'utf8'),
        this.options,
      );
      this._fileMaps.set(mapFilename, fileMap);
    }
    return fileMap;
  }

  /*
   * An internal helper function similar to getOriginalPositionFor. This one
   * returns both `name` and `functionName` fields so callers can distinguish the
   * source of the name.
   */
  getOriginalPositionDetailsFor(
    lineNumber: ?number,
    columnNumber: ?number,
    filename: ?string,
  ): SymbolicatedStackFrame {
    invariant(
      filename != null,
      'filename is required for DirectorySymbolicationContext',
    );
    let mapFilename;
    const relativeFilename = path.relative(
      this._rootDir,
      path.resolve(this._rootDir, filename),
    );
    // Lock down access to files outside the root dir.
    if (!relativeFilename.startsWith('..')) {
      mapFilename = path.join(this._rootDir, relativeFilename + '.map');
    }
    if (mapFilename == null || !fs.existsSync(mapFilename)) {
      // Adjust arguments to the output coordinates
      lineNumber =
        lineNumber != null
          ? lineNumber -
            this.options.inputLineStart +
            this.options.outputLineStart
          : lineNumber;
      columnNumber =
        columnNumber != null
          ? columnNumber -
            this.options.inputColumnStart +
            this.options.outputColumnStart
          : columnNumber;

      return {
        line: lineNumber,
        column: columnNumber,
        source: filename,
        name: null,
        functionName: null,
        isIgnored: false,
      };
    }
    return this._loadMap(mapFilename).getOriginalPositionDetailsFor(
      lineNumber,
      columnNumber,
    );
  }

  parseFileName(str: string): string {
    return str;
  }
}

/*
 * If the file name of a stack frame is numeric (+ ".js"), we assume it's a
 * lazily injected module coming from a "random access bundle". We are using
 * special source maps for these bundles, so that we can symbolicate stack
 * traces for multiple injected files with a single source map.
 *
 * There is also a convention for callsites that are in split segments of a
 * bundle, named either `seg-3.js` for segment #3 for example, or `seg-3_5.js`
 * for module #5 of segment #3 of a segmented RAM bundle.
 */
function parseSingleMapFileName(str: string): SingleMapModuleIds {
  const modMatch = str.match(/^(\d+).js$/);
  if (modMatch != null) {
    return {segmentId: 0, localId: Number(modMatch[1])};
  }
  const segMatch = str.match(/^seg-(\d+)(?:_(\d+))?.js$/);
  if (segMatch != null) {
    return {
      segmentId: Number(segMatch[1]),
      localId: segMatch[2] ? Number(segMatch[2]) : null,
    };
  }
  return UNKNOWN_MODULE_IDS;
}

function createContext(
  // $FlowFixMe[value-as-type]
  SourceMapConsumer: SourceMapConsumer,
  sourceMapContent: string | MixedSourceMap,
  options: ContextOptionsInput = {},
): SingleMapSymbolicationContext {
  return new SingleMapSymbolicationContext(
    SourceMapConsumer,
    sourceMapContent,
    options,
  );
}

function unstable_createDirectoryContext(
  // $FlowFixMe[value-as-type]
  SourceMapConsumer: SourceMapConsumer,
  rootDir: string,
  options: ContextOptionsInput = {},
): DirectorySymbolicationContext {
  return new DirectorySymbolicationContext(SourceMapConsumer, rootDir, options);
}

function getOriginalPositionFor<ModuleIdsT>(
  lineNumber: ?number,
  columnNumber: ?number,
  moduleIds: ?ModuleIdsT,
  context: SymbolicationContext<ModuleIdsT>,
): {
  line: ?number,
  column: ?number,
  source: ?string,
  name: ?string,
} {
  return context.getOriginalPositionFor(lineNumber, columnNumber, moduleIds);
}

function symbolicate<ModuleIdsT>(
  stackTrace: string,
  context: SymbolicationContext<ModuleIdsT>,
): string {
  return context.symbolicate(stackTrace);
}

function symbolicateProfilerMap<ModuleIdsT>(
  mapFile: string,
  context: SymbolicationContext<ModuleIdsT>,
): string {
  return context.symbolicateProfilerMap(mapFile);
}

function symbolicateAttribution<ModuleIdsT>(
  obj: SizeAttributionMap,
  context: SymbolicationContext<ModuleIdsT>,
): void {
  context.symbolicateAttribution(obj);
}

function symbolicateChromeTrace<ModuleIdsT>(
  traceFile: string,
  {
    stdout,
    stderr,
  }: {
    stdout: Writable,
    stderr: Writable,
    ...
  },
  context: SymbolicationContext<ModuleIdsT>,
): void {
  return context.symbolicateChromeTrace(traceFile, {stdout, stderr});
}

export {
  createContext,
  unstable_createDirectoryContext,
  getOriginalPositionFor,
  parseSingleMapFileName as parseFileName,
  symbolicate,
  symbolicateProfilerMap,
  symbolicateAttribution,
  symbolicateChromeTrace,
  SourceMetadataMapConsumer,
};
