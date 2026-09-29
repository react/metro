/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

'use strict';

type _Input =
  | string // code or file name
  | Array<string> // array of file names
  | {[filename: string]: string, ...}; // file names and corresponding code

type _Options = {
  // https://github.com/mishoo/UglifyJS2/tree/harmony#compress-options
  compress?: false | Object,
  ie8?: boolean,
  mangle?:
    | boolean
    | {
        eval?: boolean,
        keep_fnames?: boolean,
        properties?:
          | boolean
          | {
              builtins?: boolean,
              debug?: boolean,
              keep_quoted?: boolean,
              regex?: RegExp,
              reserved?: ReadonlyArray<string>,
              ...
            },
        reserved?: ReadonlyArray<string>,
        safari10?: boolean,
        toplevel?: boolean,
        ...
      },
  output?: {
    ascii_only?: boolean,
    beautify?: boolean,
    bracketize?: boolean,
    comments?: boolean | 'all' | 'some' | RegExp | Function,
    ecma?: 5 | 6,
    indent_level?: number,
    indent_start?: number,
    inline_script?: number,
    keep_quoted_props?: boolean,
    max_line_len?: false | number,
    preamble?: string,
    preserve_line?: boolean,
    quote_keys?: boolean,
    quote_style?: 0 | 1 | 2 | 3,
    semicolons?: boolean,
    shebang?: boolean,
    width?: number,
    wrap_iife?: boolean,
    ...
  },
  parse?: {
    bare_returns: boolean,
    html5_comments: boolean,
    shebang: boolean,
    ...
  },
  sourceMap?: false,
  toplevel?: boolean,
  warnings?: boolean | 'verbose',
  ...
};

type _SourceMap = {
  file?: string,
  mappings: string,
  names: Array<string>,
  sourceRoot?: string,
  sources: Array<string>,
  sourcesContent?: Array<?string>,
  version: number,
  ...
};

type _SourceMapOptions =
  | true
  | {
      filename?: string,
      content?: ?string | _SourceMap,
      includeSources?: boolean,
      root?: string,
      url?: string,
      ...
    };

type _Error = {error: Error};
type _Result = {code: string, warnings?: Array<string>};

declare module 'uglify-es' {
  declare function minify(code: _Input, options?: _Options): _Error | _Result;
  declare function minify(
    code: _Input,
    options: {..._Options, sourceMap: _SourceMapOptions, ...},
  ): _Error | {..._Result, map: string};
}

declare module 'terser' {
  declare function minify(code: _Input, options?: _Options): _Error | _Result;
  declare function minify(
    code: _Input,
    options: {..._Options, sourceMap: _SourceMapOptions, ...},
  ):
    | _Error
    | {
        ..._Result,
        map: string,
        decoded_map?: ?{
          mappings: Array<
            Array<
              | [number]
              | [number, number, number, number]
              | [number, number, number, number, number],
            >,
          >,
          names: Array<string>,
          ...
        },
      };
}
