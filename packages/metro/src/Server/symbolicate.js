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
  FBSourceFunctionMap,
  MetroSourceMapSegmentTuple,
  VlqMap,
} from '../../../metro-source-map/src/source-map';
import type {ExplodedSourceMap} from '../DeltaBundler/Serializers/getExplodedSourceMap';
import type {ConfigT} from 'metro-config';

import {greatestLowerBound} from 'metro-source-map/private/Consumer/search';
import LineIndexedMappings from 'metro-source-map/private/LineIndexedMappings';
import {SourceMetadataMapConsumer} from 'metro-symbolicate/private/Symbolication';

export type StackFrameInput = {
  readonly file: ?string,
  readonly lineNumber: ?number,
  readonly column: ?number,
  readonly methodName: ?string,
  ...
};
export type IntermediateStackFrame = {
  ...StackFrameInput,
  collapse?: boolean,
  ...
};
export type StackFrameOutput = Readonly<IntermediateStackFrame>;
type ExplodedSourceMapModule = ExplodedSourceMap[number];
type Position = {readonly line1Based: number, column0Based: number};

// Resolve a generated (line, column) within a module to its original position.
// Tuple-backed modules keep their decoded segments, so we search them directly;
// VLQ-backed modules go through a compact per-line `LineIndexedMappings` (cached
// for the request) that decodes only the target line. Byte-identical either way.
function originalPositionInModule(
  map: Array<MetroSourceMapSegmentTuple> | VlqMap,
  generatedLine1Based: number,
  generatedColumn0Based: number,
  decodedMapCache: Map<VlqMap, LineIndexedMappings>,
): ?Position {
  if (Array.isArray(map)) {
    return originalPositionInTuples(
      map,
      generatedLine1Based,
      generatedColumn0Based,
    );
  }
  let decoded = decodedMapCache.get(map);
  if (decoded == null) {
    decoded = new LineIndexedMappings(map.mappings);
    decodedMapCache.set(map, decoded);
  }
  return decoded.originalPositionFor(
    generatedLine1Based,
    generatedColumn0Based,
  );
}

// greatestLowerBound over pre-decoded tuples, ordered by (line, column).
function originalPositionInTuples(
  mappings: Array<MetroSourceMapSegmentTuple>,
  generatedLine1Based: number,
  generatedColumn0Based: number,
): ?Position {
  const target = {
    line1Based: generatedLine1Based,
    column0Based: generatedColumn0Based,
  };
  const mappingIndex = greatestLowerBound(mappings, target, (t, candidate) => {
    if (t.line1Based === candidate[0]) {
      return t.column0Based - candidate[1];
    }
    return t.line1Based - candidate[0];
  });
  if (mappingIndex == null) {
    return null;
  }
  const mapping = mappings[mappingIndex];
  if (
    mapping[0] !== target.line1Based ||
    mapping.length < 4 /* no source line/column info */
  ) {
    return null;
  }
  return {
    // $FlowFixMe[invalid-tuple-index]: Length checks do not refine tuple unions.
    line1Based: mapping[2],
    // $FlowFixMe[invalid-tuple-index]: Length checks do not refine tuple unions.
    column0Based: mapping[3],
  };
}

function createFunctionNameGetter(
  module: ExplodedSourceMapModule,
): Position => ?string {
  const consumer = new SourceMetadataMapConsumer(
    {
      version: 3,
      mappings: '',
      sources: ['dummy'],
      names: [],
      x_facebook_sources: [[module.functionMap]],
    },
    name => name /* no normalization needed */,
  );
  return ({line1Based, column0Based}) =>
    consumer.functionNameFor({
      line: line1Based,
      column: column0Based,
      source: 'dummy',
    });
}

export default async function symbolicate(
  stack: ReadonlyArray<StackFrameInput>,
  maps: Iterable<[string, ExplodedSourceMap]>,
  config: ConfigT,
  extraData: unknown,
): Promise<ReadonlyArray<StackFrameOutput>> {
  const mapsByUrl = new Map<?string, ExplodedSourceMap>();
  for (const [url, map] of maps) {
    mapsByUrl.set(url, map);
  }
  const functionNameGetters = new Map<
    {
      readonly firstLine1Based: number,
      readonly functionMap: ?FBSourceFunctionMap,
      readonly map: Array<MetroSourceMapSegmentTuple> | VlqMap,
      readonly path: string,
    },
    (Position) => ?string,
  >();

  // Dedupes VLQ decoding across frames that resolve to the same module. Scoped
  // to this request so decoded maps are released once it completes, rather than
  // being retained alongside the long-lived module graph.
  const decodedMapCache = new Map<VlqMap, LineIndexedMappings>();

  function findModule(frame: StackFrameInput): ?ExplodedSourceMapModule {
    const map = mapsByUrl.get(frame.file);
    if (!map || frame.lineNumber == null) {
      return null;
    }
    const moduleIndex = greatestLowerBound(
      map,
      frame.lineNumber,
      (target, candidate) => target - candidate.firstLine1Based,
    );
    if (moduleIndex == null) {
      return null;
    }
    return map[moduleIndex];
  }

  function findOriginalPos(
    frame: StackFrameInput,
    module: ExplodedSourceMapModule,
  ): ?Position {
    const lineNumber = frame.lineNumber;
    const column = frame.column;
    if (module.map == null || lineNumber == null || column == null) {
      return null;
    }
    return originalPositionInModule(
      module.map,
      lineNumber - module.firstLine1Based + 1,
      column,
      decodedMapCache,
    );
  }

  function findFunctionName(
    originalPos: Position,
    module: {
      readonly firstLine1Based: number,
      readonly functionMap: ?FBSourceFunctionMap,
      readonly map: Array<MetroSourceMapSegmentTuple> | VlqMap,
      readonly path: string,
    },
  ): ?string {
    if (module.functionMap) {
      let getFunctionName = functionNameGetters.get(module);
      if (!getFunctionName) {
        getFunctionName = createFunctionNameGetter(module);
        functionNameGetters.set(module, getFunctionName);
      }
      return getFunctionName(originalPos);
    }
    return null;
  }

  function symbolicateFrame(frame: StackFrameInput): IntermediateStackFrame {
    const module = findModule(frame);
    if (!module) {
      return {...frame};
    }
    const originalPos = findOriginalPos(frame, module);
    if (!originalPos) {
      return {...frame};
    }
    const methodName =
      findFunctionName(originalPos, module) ?? frame.methodName;
    return {
      ...frame,
      methodName,
      file: module.path,
      lineNumber: originalPos.line1Based,
      column: originalPos.column0Based,
    };
  }

  /**
   * `customizeFrame` allows for custom modifications of the symbolicated frame in a stack.
   * It can be used to collapse stack frames that are not relevant to users, pointing them
   * to more relevant product code instead.
   *
   * An example usecase is a library throwing an error while sanitizing inputs from product code.
   * In some cases, it's more useful to point the developer looking at the error towards the product code directly.
   */
  async function customizeFrame(
    frame: IntermediateStackFrame,
  ): Promise<IntermediateStackFrame> {
    const customizations =
      (await config.symbolicator.customizeFrame(frame)) || {};
    return {...frame, ...customizations};
  }

  /**
   * `customizeStack` allows for custom modifications of a symbolicated stack.
   * Where `customizeFrame` operates on individual frames, this hook can process the entire stack in context.
   *
   * Note: `customizeStack` has access to an `extraData` object which can be used to attach metadata
   * to the error coming in, to be used by the customizeStack hook.
   */
  async function customizeStack(
    symbolicatedStack: Array<IntermediateStackFrame>,
  ): Promise<Array<IntermediateStackFrame>> {
    return await config.symbolicator.customizeStack(
      symbolicatedStack,
      extraData,
    );
  }

  return Promise.all(stack.map(symbolicateFrame).map(customizeFrame)).then(
    customizeStack,
  );
}
