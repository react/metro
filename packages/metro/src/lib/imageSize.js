/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 * @oncall react_native
 *
 * @lint-ignore-every LICENSELINT
 * This file retains the MIT notice required for the derived parsers below.
 */

/* eslint-disable no-bitwise */

/**
 * Image dimension parsing is derived from image-size's format support, reduced
 * to the formats Metro treats as images. See the third-party notice below.
 */

export type Dimensions = {
  readonly width: number,
  readonly height: number,
};

type ImageParser = (content: Buffer) => ?Dimensions;

const MAX_SVG_HEADER_LENGTH = 64 * 1024;

const KTX1_IDENTIFIER = Buffer.from([
  0xab, 0x4b, 0x54, 0x58, 0x20, 0x31, 0x31, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const KTX2_IDENTIFIER = Buffer.from([
  0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const PNG_IDENTIFIER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

const parsers: {[string]: ImageParser} = {
  bmp: parseBmp,
  gif: parseGif,
  jpeg: parseJpeg,
  jpg: parseJpeg,
  ktx: parseKtx,
  png: parsePng,
  psd: parsePsd,
  svg: parseSvg,
  tiff: parseTiff,
  webp: parseWebp,
};

const fallbackParsers: ReadonlyArray<ImageParser> = [
  parseBmp,
  parseGif,
  parseJpeg,
  parseKtx,
  parsePng,
  parsePsd,
  parseSvg,
  parseTiff,
  parseWebp,
];

export function getImageDimensions(
  type: string,
  content: Buffer,
  filePath: string,
): Dimensions {
  const parser = parsers[type];
  let dimensions = tryParse(parser, content);

  // Metro historically parsed assets by their contents, and some existing
  // assets have an extension that does not match their encoded format.
  if (dimensions == null) {
    for (const fallbackParser of fallbackParsers) {
      if (fallbackParser !== parser) {
        dimensions = tryParse(fallbackParser, content);
        if (dimensions != null) {
          break;
        }
      }
    }
  }

  if (
    dimensions == null ||
    !Number.isFinite(dimensions.width) ||
    !Number.isFinite(dimensions.height) ||
    dimensions.width <= 0 ||
    dimensions.height <= 0
  ) {
    throw createInvalidImageError(type, filePath);
  }

  return dimensions;
}

function tryParse(parser: ?ImageParser, content: Buffer): ?Dimensions {
  try {
    return parser?.(content);
  } catch {
    return null;
  }
}

function parseBmp(content: Buffer): ?Dimensions {
  if (!hasBytes(content, 0, 26) || readAscii(content, 0, 2) !== 'BM') {
    return null;
  }

  const dibHeaderSize = content.readUInt32LE(14);
  if (dibHeaderSize === 12) {
    return {
      width: content.readUInt16LE(18),
      height: content.readUInt16LE(20),
    };
  }
  if (dibHeaderSize < 40) {
    return null;
  }

  return {
    width: Math.abs(content.readInt32LE(18)),
    height: Math.abs(content.readInt32LE(22)),
  };
}

function parseGif(content: Buffer): ?Dimensions {
  if (
    !hasBytes(content, 0, 10) ||
    !/^GIF8[79]a$/.test(readAscii(content, 0, 6))
  ) {
    return null;
  }
  return {
    width: content.readUInt16LE(6),
    height: content.readUInt16LE(8),
  };
}

function parseJpeg(content: Buffer): ?Dimensions {
  if (!hasBytes(content, 0, 4) || content[0] !== 0xff || content[1] !== 0xd8) {
    return null;
  }

  let offset = 2;
  while (offset < content.length) {
    while (offset < content.length && content[offset] === 0xff) {
      offset++;
    }
    if (offset >= content.length) {
      return null;
    }

    const marker = content[offset++];
    if (marker === 0x00) {
      return null;
    }
    if (isStandaloneJpegMarker(marker)) {
      if (marker === 0xd9) {
        return null;
      }
      continue;
    }
    if (!hasBytes(content, offset, 2)) {
      return null;
    }

    const segmentLength = content.readUInt16BE(offset);
    if (segmentLength < 2) {
      return null;
    }
    const segmentEnd = offset + segmentLength;
    if (segmentEnd <= offset || segmentEnd > content.length) {
      return null;
    }

    if (isJpegStartOfFrame(marker)) {
      if (segmentLength < 7) {
        return null;
      }
      return {
        height: content.readUInt16BE(offset + 3),
        width: content.readUInt16BE(offset + 5),
      };
    }
    if (marker === 0xda) {
      return null;
    }
    offset = segmentEnd;
  }
  return null;
}

function isStandaloneJpegMarker(marker: number): boolean {
  return marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9);
}

function isJpegStartOfFrame(marker: number): boolean {
  return (
    marker >= 0xc0 &&
    marker <= 0xcf &&
    marker !== 0xc4 &&
    marker !== 0xc8 &&
    marker !== 0xcc
  );
}

function parseKtx(content: Buffer): ?Dimensions {
  if (hasBytes(content, 0, 64) && startsWith(content, KTX1_IDENTIFIER)) {
    const endianness = content.subarray(12, 16);
    if (endianness.equals(Buffer.from([0x01, 0x02, 0x03, 0x04]))) {
      return {
        width: content.readUInt32LE(36),
        height: content.readUInt32LE(40),
      };
    }
    if (endianness.equals(Buffer.from([0x04, 0x03, 0x02, 0x01]))) {
      return {
        width: content.readUInt32BE(36),
        height: content.readUInt32BE(40),
      };
    }
    return null;
  }

  if (hasBytes(content, 0, 80) && startsWith(content, KTX2_IDENTIFIER)) {
    return {
      width: content.readUInt32LE(20),
      height: content.readUInt32LE(24),
    };
  }
  return null;
}

function parsePng(content: Buffer): ?Dimensions {
  if (!hasBytes(content, 0, 24) || !startsWith(content, PNG_IDENTIFIER)) {
    return null;
  }

  const firstChunkLength = content.readUInt32BE(8);
  const firstChunkType = readAscii(content, 12, 16);
  if (firstChunkType === 'IHDR') {
    if (firstChunkLength !== 13) {
      return null;
    }
    return {
      width: content.readUInt32BE(16),
      height: content.readUInt32BE(20),
    };
  }

  // Apple's PNG encoder may place a CgBI chunk before IHDR.
  if (firstChunkType !== 'CgBI') {
    return null;
  }
  const ihdrOffset = 8 + 12 + firstChunkLength;
  if (
    !hasBytes(content, ihdrOffset, 24) ||
    content.readUInt32BE(ihdrOffset) !== 13 ||
    readAscii(content, ihdrOffset + 4, ihdrOffset + 8) !== 'IHDR'
  ) {
    return null;
  }
  return {
    width: content.readUInt32BE(ihdrOffset + 8),
    height: content.readUInt32BE(ihdrOffset + 12),
  };
}

function parsePsd(content: Buffer): ?Dimensions {
  if (
    !hasBytes(content, 0, 22) ||
    readAscii(content, 0, 4) !== '8BPS' ||
    (content.readUInt16BE(4) !== 1 && content.readUInt16BE(4) !== 2)
  ) {
    return null;
  }
  return {
    height: content.readUInt32BE(14),
    width: content.readUInt32BE(18),
  };
}

const SVG_UNIT_FACTORS: {[string]: number} = {
  in: 96,
  cm: 96 / 2.54,
  em: 16,
  ex: 8,
  mm: 96 / 2.54 / 10,
  pc: (96 / 72) * 12,
  pt: 96 / 72,
  px: 1,
};

function parseSvg(content: Buffer): ?Dimensions {
  const header = content
    .subarray(0, Math.min(content.length, MAX_SVG_HEADER_LENGTH))
    .toString('utf8');
  const rootStartMatch = /<svg(?:\s|>)/.exec(header);
  if (rootStartMatch == null || rootStartMatch.index == null) {
    return null;
  }

  const rootStart = rootStartMatch.index;
  const rootEnd = findTagEnd(header, rootStart);
  if (rootEnd == null) {
    return null;
  }
  const root = header.slice(rootStart, rootEnd + 1);
  const attributes: {[string]: string} = {};
  // Match whole attribute names only. `\b` alone would also match after a
  // hyphen or a namespace prefix, so `stroke-width="2"` (common on icon sets)
  // or `xlink:width` would be read as the image's width.
  const attributePattern =
    /(?<![\w:-])(width|height|viewBox)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  let match = attributePattern.exec(root);
  while (match != null) {
    const name = match[1];
    const value = match[2] ?? match[3];
    if (name != null && value != null) {
      attributes[name.toLowerCase()] = value;
    }
    match = attributePattern.exec(root);
  }

  const width = parseSvgLength(attributes.width);
  const height = parseSvgLength(attributes.height);
  if (width != null && height != null) {
    return {width, height};
  }

  const viewBox = parseSvgViewBox(attributes.viewbox);
  if (viewBox == null) {
    return null;
  }
  if (width != null) {
    return {
      width,
      height: Math.floor(width / (viewBox.width / viewBox.height)),
    };
  }
  if (height != null) {
    return {
      width: Math.floor(height * (viewBox.width / viewBox.height)),
      height,
    };
  }
  return viewBox;
}

function findTagEnd(input: string, start: number): ?number {
  let quote = null;
  for (let index = start; index < input.length; index++) {
    const character = input[index];
    if (quote != null) {
      if (character === quote) {
        quote = null;
      }
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '>') {
      return index;
    }
  }
  return null;
}

function parseSvgLength(value: ?string): ?number {
  if (value == null || value.endsWith('%')) {
    return null;
  }
  const match = /^([+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)([a-z]*)$/i.exec(
    value.trim(),
  );
  if (match == null) {
    return null;
  }
  const unit = match[2].toLowerCase();
  const factor = unit === '' ? 1 : SVG_UNIT_FACTORS[unit];
  if (factor == null) {
    return null;
  }
  return Math.round(Number(match[1]) * factor);
}

function parseSvgViewBox(value: ?string): ?Dimensions {
  if (value == null) {
    return null;
  }
  const values = value
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (
    values.length !== 4 ||
    !values.every(value => Number.isFinite(value)) ||
    values[2] <= 0 ||
    values[3] <= 0
  ) {
    return null;
  }
  return {width: values[2], height: values[3]};
}

function parseTiff(content: Buffer): ?Dimensions {
  if (!hasBytes(content, 0, 8)) {
    return null;
  }
  const byteOrder = readAscii(content, 0, 2);
  const isBigEndian = byteOrder === 'MM';
  if (
    (!isBigEndian && byteOrder !== 'II') ||
    readTiffUInt16(content, 2, isBigEndian) !== 42
  ) {
    return null;
  }

  const ifdOffset = readTiffUInt32(content, 4, isBigEndian);
  if (!hasBytes(content, ifdOffset, 2)) {
    return null;
  }
  const entryCount = readTiffUInt16(content, ifdOffset, isBigEndian);
  const entriesOffset = ifdOffset + 2;
  if (entryCount > Math.floor((content.length - entriesOffset) / 12)) {
    return null;
  }

  let width;
  let height;
  for (let index = 0; index < entryCount; index++) {
    const entryOffset = entriesOffset + index * 12;
    const tag = readTiffUInt16(content, entryOffset, isBigEndian);
    if (tag !== 256 && tag !== 257) {
      continue;
    }
    const value = readTiffDimension(content, entryOffset, isBigEndian);
    if (value == null) {
      return null;
    }
    if (tag === 256) {
      width = value;
    } else {
      height = value;
    }
  }
  return width != null && height != null ? {width, height} : null;
}

function readTiffDimension(
  content: Buffer,
  entryOffset: number,
  isBigEndian: boolean,
): ?number {
  const type = readTiffUInt16(content, entryOffset + 2, isBigEndian);
  const count = readTiffUInt32(content, entryOffset + 4, isBigEndian);
  if (count !== 1) {
    return null;
  }
  if (type === 3) {
    return readTiffUInt16(content, entryOffset + 8, isBigEndian);
  }
  if (type === 4) {
    return readTiffUInt32(content, entryOffset + 8, isBigEndian);
  }
  return null;
}

function readTiffUInt16(
  content: Buffer,
  offset: number,
  isBigEndian: boolean,
): number {
  return isBigEndian
    ? content.readUInt16BE(offset)
    : content.readUInt16LE(offset);
}

function readTiffUInt32(
  content: Buffer,
  offset: number,
  isBigEndian: boolean,
): number {
  return isBigEndian
    ? content.readUInt32BE(offset)
    : content.readUInt32LE(offset);
}

function parseWebp(content: Buffer): ?Dimensions {
  if (
    !hasBytes(content, 0, 20) ||
    readAscii(content, 0, 4) !== 'RIFF' ||
    readAscii(content, 8, 12) !== 'WEBP'
  ) {
    return null;
  }

  let offset = 12;
  while (hasBytes(content, offset, 8)) {
    const chunkType = readAscii(content, offset, offset + 4);
    const chunkLength = content.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;
    if (!hasBytes(content, dataOffset, chunkLength)) {
      return null;
    }

    if (chunkType === 'VP8X' && chunkLength >= 10) {
      return {
        width: 1 + readUInt24LE(content, dataOffset + 4),
        height: 1 + readUInt24LE(content, dataOffset + 7),
      };
    }
    if (
      chunkType === 'VP8L' &&
      chunkLength >= 5 &&
      content[dataOffset] === 0x2f
    ) {
      return {
        width:
          1 +
          (((content[dataOffset + 2] & 0x3f) << 8) | content[dataOffset + 1]),
        height:
          1 +
          (((content[dataOffset + 4] & 0x0f) << 10) |
            (content[dataOffset + 3] << 2) |
            ((content[dataOffset + 2] & 0xc0) >> 6)),
      };
    }
    if (
      chunkType === 'VP8 ' &&
      chunkLength >= 10 &&
      content[dataOffset + 3] === 0x9d &&
      content[dataOffset + 4] === 0x01 &&
      content[dataOffset + 5] === 0x2a
    ) {
      return {
        width: content.readUInt16LE(dataOffset + 6) & 0x3fff,
        height: content.readUInt16LE(dataOffset + 8) & 0x3fff,
      };
    }

    const nextOffset = dataOffset + chunkLength + (chunkLength % 2);
    if (nextOffset <= offset) {
      return null;
    }
    offset = nextOffset;
  }
  return null;
}

function readUInt24LE(content: Buffer, offset: number): number {
  return (
    content[offset] + content[offset + 1] * 256 + content[offset + 2] * 65536
  );
}

function hasBytes(content: Buffer, offset: number, length: number): boolean {
  return (
    Number.isSafeInteger(offset) &&
    Number.isSafeInteger(length) &&
    offset >= 0 &&
    length >= 0 &&
    offset <= content.length &&
    length <= content.length - offset
  );
}

function startsWith(content: Buffer, prefix: Buffer): boolean {
  return (
    hasBytes(content, 0, prefix.length) &&
    content.subarray(0, prefix.length).equals(prefix)
  );
}

function readAscii(content: Buffer, start: number, end: number): string {
  return content.toString('ascii', start, end);
}

function createInvalidImageError(type: string, filePath: string): Error {
  return new Error(`Invalid ${type} image asset: ${filePath}`);
}

/*
 * Portions derived from image-size:
 * https://codeberg.org/image-size/image-size
 *
 * The MIT License (MIT)
 *
 * Copyright © 2013-Present Aditya Yadav, http://netroy.in
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the “Software”), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
