/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<91474206d25909f6f6d546877efa6e0a>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-symbolicate/src/Symbolication.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {ChromeHeapSnapshot} from './ChromeHeapSnapshot';
import type {MixedSourceMap} from 'metro-source-map';
import type {Writable} from 'node:stream';

import SourceMetadataMapConsumer from './SourceMetadataMapConsumer';
import {type SourceMapConsumer as $$IMPORT_TYPEOF_1$$} from 'source-map';

type SourceMapConsumer = typeof $$IMPORT_TYPEOF_1$$;
type SingleMapModuleIds = {
  segmentId: number;
  localId: null | undefined | number;
};
type ContextOptionsInput = {
  readonly nameSource?: 'function_names' | 'identifier_names';
  readonly inputLineStart?: number;
  readonly inputColumnStart?: number;
  readonly outputLineStart?: number;
  readonly outputColumnStart?: number;
};
type SizeAttributionMap = {
  location: {
    file: null | undefined | string;
    filename?: string;
    bytecodeSize?: number;
    virtualOffset?: number;
    line: null | undefined | number;
    column: null | undefined | number;
  };
};
type HermesMinidumpCrashInfo = {
  readonly callstack: ReadonlyArray<HermesMinidumpStackFrame | NativeCodeStackFrame>;
};
type HermesMinidumpStackFrame = Readonly<{
  ByteCodeOffset: number;
  FunctionID: number;
  CJSModuleOffset?: number;
  SegmentID?: number;
  SourceURL: string;
  StackFrameRegOffs: string;
  SourceLocation?: string;
}>;
type HermesCoverageInfo = {
  readonly executedFunctions: ReadonlyArray<HermesCoverageStackFrame>;
};
type HermesCoverageStackFrame = Readonly<{
  line: number;
  column: number;
  SourceURL: null | undefined | string;
}>;
type NativeCodeStackFrame = Readonly<{
  NativeCode: true;
  StackFrameRegOffs: string;
}>;
type SymbolicatedStackTrace = ReadonlyArray<SymbolicatedStackFrame | NativeCodeStackFrame>;
type SymbolicatedStackFrame = Readonly<{
  line: null | undefined | number;
  column: null | undefined | number;
  source: null | undefined | string;
  functionName: null | undefined | string;
  name: null | undefined | string;
  isIgnored: boolean;
}>;
declare class SymbolicationContext<ModuleIdsT> {
  readonly options: {
    readonly nameSource: 'function_names' | 'identifier_names';
    readonly inputLineStart: number;
    readonly inputColumnStart: number;
    readonly outputLineStart: number;
    readonly outputColumnStart: number;
  };
  constructor(options: ContextOptionsInput);
  symbolicate(stackTrace: string): string;
  symbolicateProfilerMap(mapFile: string): string;
  symbolicateAttribution(obj: SizeAttributionMap): void;
  symbolicateChromeTrace(traceFile: string, $$PARAM_1$$: {stdout: Writable; stderr: Writable}): void;
  getOriginalPositionFor(
    lineNumber: null | undefined | number,
    columnNumber: null | undefined | number,
    moduleIds: null | undefined | ModuleIdsT,
  ): {
    line: null | undefined | number;
    column: null | undefined | number;
    source: null | undefined | string;
    name: null | undefined | string;
  };
  symbolicateHermesMinidumpTrace(crashInfo: HermesMinidumpCrashInfo): SymbolicatedStackTrace;
  /**
   * Symbolicates heap alloction stacks in a Chrome-formatted heap
   * snapshot/timeline.
   * Line and column offsets in options (both input and output) are _ignored_,
   * because this format has a well-defined convention (1-based lines and
   * columns).
   */
  symbolicateHeapSnapshot(snapshotContents: string | ChromeHeapSnapshot): ChromeHeapSnapshot;
  symbolicateHermesCoverageTrace(coverageInfo: HermesCoverageInfo): SymbolicatedStackTrace;
  getOriginalPositionDetailsFor(lineNumber: null | undefined | number, columnNumber: null | undefined | number, moduleIds: null | undefined | ModuleIdsT): SymbolicatedStackFrame;
  parseFileName(str: string): ModuleIdsT;
}
declare class SingleMapSymbolicationContext extends SymbolicationContext<SingleMapModuleIds> {
  constructor(SourceMapConsumer: SourceMapConsumer, sourceMapContent: string | MixedSourceMap, options?: ContextOptionsInput);
  symbolicateHermesMinidumpTrace(crashInfo: HermesMinidumpCrashInfo): SymbolicatedStackTrace;
  symbolicateHermesCoverageTrace(coverageInfo: HermesCoverageInfo): SymbolicatedStackTrace;
  getOriginalPositionDetailsFor(lineNumber: null | undefined | number, columnNumber: null | undefined | number, moduleIds: null | undefined | SingleMapModuleIds): SymbolicatedStackFrame;
  parseFileName(str: string): SingleMapModuleIds;
}
declare class DirectorySymbolicationContext extends SymbolicationContext<string> {
  constructor(SourceMapConsumer: SourceMapConsumer, rootDir: string, options?: ContextOptionsInput);
  getOriginalPositionDetailsFor(lineNumber: null | undefined | number, columnNumber: null | undefined | number, filename: null | undefined | string): SymbolicatedStackFrame;
  parseFileName(str: string): string;
}
declare function parseSingleMapFileName(str: string): SingleMapModuleIds;
declare function createContext(SourceMapConsumer: SourceMapConsumer, sourceMapContent: string | MixedSourceMap, options?: ContextOptionsInput): SingleMapSymbolicationContext;
declare function unstable_createDirectoryContext(SourceMapConsumer: SourceMapConsumer, rootDir: string, options?: ContextOptionsInput): DirectorySymbolicationContext;
declare function getOriginalPositionFor<ModuleIdsT>(
  lineNumber: null | undefined | number,
  columnNumber: null | undefined | number,
  moduleIds: null | undefined | ModuleIdsT,
  context: SymbolicationContext<ModuleIdsT>,
): {
  line: null | undefined | number;
  column: null | undefined | number;
  source: null | undefined | string;
  name: null | undefined | string;
};
declare function symbolicate<ModuleIdsT>(stackTrace: string, context: SymbolicationContext<ModuleIdsT>): string;
declare function symbolicateProfilerMap<ModuleIdsT>(mapFile: string, context: SymbolicationContext<ModuleIdsT>): string;
declare function symbolicateAttribution<ModuleIdsT>(obj: SizeAttributionMap, context: SymbolicationContext<ModuleIdsT>): void;
declare function symbolicateChromeTrace<ModuleIdsT>(traceFile: string, $$PARAM_1$$: {stdout: Writable; stderr: Writable}, context: SymbolicationContext<ModuleIdsT>): void;
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
