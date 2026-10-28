---
id: source-map-format
title: Source Map Format
---

Metro produces standard [source maps](https://tc39.es/ecma426/#sec-source-map-format) along with its JavaScript bundle output. In addition to the standard information, Metro encodes extra information in [vendor-specific fields](https://tc39.es/ecma426/#sec-extensions) within the source map. This page specifies these fields.

It's for authors of tools that read, generate or transform Metro's source maps, such as debuggers, symbolication services or bundle post-processors. App developers can skip it: their tools consume these fields.

:::note
The content on this page assumes familiarity with the [source map specification](https://tc39.es/ecma426/#sec-source-map-format). Check out [Anatomy of source maps](https://web.archive.org/web/2023/https://www.bugsnag.com/blog/source-maps) for a general introduction to source maps and how they work.
:::

## `x_facebook_sources`

The `x_facebook_sources` field encodes metadata about source files in a source map, each piece representing some attribute intrinsic to that file's source code, e.g. the result of running some analysis over the AST. This lets tools such as debuggers and JS engines access such analyses efficiently, without parsing or even having access to the source code.

In the same way that the standard [`sources`](https://tc39.es/ecma426/#sec-source-map-format:~:text=The%20sources%20field%20is%20a%20list%20of%20original%20sources%20used%20by%20the%20mappings%20field%2E) field is a list of source URLs and [`sourcesContent`](https://tc39.es/ecma426/#sec-source-map-format:~:text=The%20sourcesContent%20field%20is%20an%20optional%20list%20of%20source%20content) is a list of (optional) source code strings, `x_facebook_sources` is a list of optional **metadata tuples**. The _i_-th metadata tuple (`x_facebook_sources[i]`) corresponds to the source file whose URL is `sources[i]`.

In nested (indexed) source maps, `x_facebook_sources` may appear as part of any nested source map in [`sections`](https://tc39.es/ecma426/#sec-index-source-map) that itself has a `sources` field.

If present, `x_facebook_sources` may be a different length than `sources` (but usually shouldn't be). If it's shorter, it's interpreted as if padded with `null` values to the length of `sources`.

:::info
For a tool that processes Metro's source maps to output a valid `x_facebook_sources` field, it mainly needs to ensure that `x_facebook_sources[i]` still corresponds to `sources[i]` in the output - even if it reorders, adds or deletes elements in `sources`. This can be done *without* parsing/decoding the metadata tuples: unless your tool needs the information within them, treat them as opaque blobs of JSON.

If a tool cannot guarantee that the `sources` and `x_facebook_sources` arrays will stay in sync, it should delete the `x_facebook_sources` field from its output.
:::

### Metadata tuple

Each metadata tuple is encoded as an array of zero or more entries. Each entry may be `null` to signify that it's missing. A run of trailing `null`s may be truncated from the end of the tuple with no change in meaning. The metadata tuple itself may also be `null` to signify that the source file has no associated metadata.

The indices in each metadata tuple are assigned as follows:

* Index 0: [Function map](#function-map) or `null`.
  * In Metro, this is the result of calling [`generateFunctionMap`](https://github.com/react/metro/blob/main/packages/metro-source-map/src/generateFunctionMap.js) on the source AST.
* Index 1-∞: Reserved for future use.

#### Function map

A function map records the name of the function that encloses each region of a source file, so that tools can show function names for code locations, e.g. in stack traces. It is encoded as an object with two fields:

* `names`: An array of strings.
* `mappings`: A string following the [encoding](#function-map-mappings-field-encoding) described below.

When decoded, `mappings` represents a list of 3-tuples of integers: `(column, nameIndex, line), (column, nameIndex, line), ...`. The list is ordered by `line` and then `column`.

The presence of a 3-tuple `(column, nameIndex, line)` means that the _local function name_ in the code region beginning at `line` and `column` (in the source file described by the current metadata tuple) is `names[nameIndex]`.

##### Function map `mappings` field encoding

The `mappings` field follows the _Mappings_ production of this grammar:

1. `Mappings =  [ ";" ] LineMappings { ";" { ";" } LineMappings }`
2. `LineMappings =  FirstColumnMapping { "," ColumnMapping }`
3. `FirstColumnMapping =  VLQ VLQ VLQ`
4. `ColumnMapping =  VLQ VLQ [ VLQ ]`
5. `VLQ =` _A single Base64-encoded variable-length quantity, as defined in the [source map specification](https://tc39.es/ecma426/#sec-base64-vlq)_.

:::note
The above grammar uses the following BNF-like notation:

| Notation | Meaning |
|-|-|
| `[ X ]` | _X_ appears 0 or 1 times. |
| `{ X }` | _X_ appears 0 or more times. |
| `"foo"` | The literal characters `foo`. |

:::

The three VLQs in _FirstColumnMapping_ or _ColumnMapping_ represent, in this order:
1. **Column delta**:
    * In _FirstColumnMapping_: The column offset from the beginning of the line. (0 = first column)
    * In _ColumnMapping_: The column offset from the last-encountered _FirstColumnMapping_ or _ColumnMapping_.
2. **Name delta**: The name index offset from the last-encountered _FirstColumnMapping_ or _ColumnMapping_. This is *not* reset between lines.
3. **Line delta**: The line offset from the last-encountered _FirstColumnMapping_ or _ColumnMapping_. This is *not* reset between lines.
    * This MUST be 0 (Base64 VLQ: `A`) if it is part of a _ColumnMapping_.
    * Implementations SHOULD omit this field from the encoded form of _ColumnMapping_.

### Example

A complete source map for a single source file `file.js` might look like this:

:::note
Comments are for illustrative purposes - the source map format does not allow comments.
:::

```json
{
  "version": 3,
  "sources": ["file.js"],
  "sourcesContent": ["function a(){} function b(){}"],
  "mappings": "AAAA", // NOTE: Simplified
  "x_facebook_sources": [
    // Metadata tuple for source #0 (file.js)
    [
      // Metadata item #0.0 = function map for source #0 (file.js)
      {
        // a from 1:0
        // <global> from 1:14
        // b from 1:15
        // (See detailed decoding procedure below.)
        "mappings": "AAA,cC,CC",
        "names": [
          "a",
          "<global>",
          "b",
        ]
      }
    ]
  ]
}
```

Decoding the function map in the above example:

```js
const decoded = [];
const names = ['a', '<global>', 'b']; // From the function map

let column = 0, nameIndex = 0, line = 1;
column += 0 /* A */; nameIndex += 0 /* A */; line += 0 /* A */;
decoded.push({column, name: names[nameIndex] /* 'a' */, line});

column += 14 /* c */; nameIndex += 1 /* C */; // no line delta
decoded.push({column, name: names[nameIndex] /* '<global>' */, line});

column += 1 /* C */; nameIndex += 1 /* C */; // no line delta
decoded.push({column, name: names[nameIndex] /* 'b' */, line});

/*
  decoded = [
    {column: 0, name: 'a', line: 1},
    {column: 14, name: '<global>', line: 1},
    {column: 15, name: 'b', line: 1},
  ]
*/
```

## `x_google_ignoreList`

Metro's source maps include the [`x_google_ignoreList`](https://developer.chrome.com/articles/x-google-ignore-list/) field by default, listing sources that debuggers should treat as third-party code, e.g. by hiding them from stack traces and skipping them when stepping. Use the [`serializer.isThirdPartyModule`](./Configuration.md#isthirdpartymodule) option to control which modules are ignore-listed.

The field lists indices into `sources`. By default, files under `node_modules` are ignore-listed:

```json
{
  "sources": ["index.js", "node_modules/react/index.js"],
  "x_google_ignoreList": [1]
}
```
