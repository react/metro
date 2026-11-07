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

'use strict';

/* eslint-disable no-bitwise */

const {getImageDimensions} = require('../imageSize');

const WIDTH = 300;
const HEIGHT = 200;

describe('getImageDimensions', () => {
  test.each([
    ['bmp', createBmp()],
    ['bmp', createCoreBmp()],
    ['gif', createGif()],
    ['jpg', createJpeg()],
    ['jpeg', createJpeg()],
    ['png', createPng()],
    ['png', createCgbiPng()],
    ['psd', createPsd()],
    ['svg', createSvg()],
    ['svg', createSvgWithUnits()],
    ['svg', createSvgWithPicas()],
    ['svg', createSvgWithViewBox()],
    ['tiff', createTiff('little', 3)],
    ['tiff', createTiff('big', 4)],
    ['webp', createExtendedWebp()],
    ['webp', createLosslessWebp()],
    ['webp', createLossyWebp()],
    ['ktx', createKtx1('little')],
    ['ktx', createKtx1('big')],
    ['ktx', createKtx2()],
  ])('parses a valid %s image', (type, content) => {
    expect(getImageDimensions(type, content, `/root/image.${type}`)).toEqual({
      width: WIDTH,
      height: HEIGHT,
    });
  });

  test('parses content that does not match the declared type', () => {
    expect(
      getImageDimensions('png', createJpeg(), '/root/disguised.png'),
    ).toEqual({width: WIDTH, height: HEIGHT});
  });

  test.each([
    [
      'stroke-width after width and height',
      `<svg width="${WIDTH}" height="${HEIGHT}" stroke-width="2"/>`,
    ],
    [
      'stroke-width with only a viewBox',
      `<svg viewBox="0 0 ${WIDTH} ${HEIGHT}" stroke-width="1.5"/>`,
    ],
    [
      'other hyphenated attributes',
      `<svg width="${WIDTH}" height="${HEIGHT}" data-width="7" border-height="9"/>`,
    ],
    [
      'a namespaced attribute after width and height',
      `<svg width="${WIDTH}" height="${HEIGHT}" xlink:width="5"/>`,
    ],
  ])(
    'ignores SVG attributes that only end in a dimension name: %s',
    (_, svg) => {
      expect(
        getImageDimensions('svg', Buffer.from(svg), '/root/icon.svg'),
      ).toEqual({width: WIDTH, height: HEIGHT});
    },
  );

  test('rejects unsupported SVG units', () => {
    expect(() =>
      getImageDimensions(
        'svg',
        Buffer.from('<svg width="3m" height="2m"/>'),
        '/root/invalid.svg',
      ),
    ).toThrow('Invalid svg image asset: /root/invalid.svg');
  });

  test.each([
    ['bmp', Buffer.from('BM')],
    ['gif', Buffer.from('GIF89a')],
    ['jpg', Buffer.from([0xff, 0xd8, 0xff])],
    ['png', createPng().subarray(0, 20)],
    ['psd', Buffer.from('8BPS')],
    ['svg', Buffer.from('<svg width="1"')],
    ['tiff', createTiff('little', 3).subarray(0, 16)],
    ['webp', Buffer.from('RIFF')],
    ['ktx', createKtx1('little').subarray(0, 44)],
  ])('rejects a truncated %s image', (type, content) => {
    expect(() =>
      getImageDimensions(type, content, `/root/truncated.${type}`),
    ).toThrow(`Invalid ${type} image asset: /root/truncated.${type}`);
  });

  test('rejects non-positive dimensions', () => {
    const content = createPng();
    content.writeUInt32BE(0, 16);

    expect(() =>
      getImageDimensions('png', content, '/root/zero-width.png'),
    ).toThrow('Invalid png image asset: /root/zero-width.png');
  });

  test.each([
    ['JXL', createZeroLengthJxlBox()],
    ['HEIF', createZeroLengthHeifBox()],
    ['ICNS', createZeroLengthIcnsEntry()],
    ['JPEG', createZeroLengthJpegSegment()],
  ])('rejects a malformed %s payload without hanging', (_, content) => {
    expect(() =>
      getImageDimensions('png', content, '/root/malicious.png'),
    ).toThrow('Invalid png image asset: /root/malicious.png');
  });

  test('bounds SVG header parsing', () => {
    const content = Buffer.from(
      `<!--${'x'.repeat(64 * 1024)}--><svg width="300" height="200"/>`,
    );
    expect(() =>
      getImageDimensions('svg', content, '/root/oversized.svg'),
    ).toThrow('Invalid svg image asset: /root/oversized.svg');
  });
});

function createBmp() {
  const content = Buffer.alloc(26);
  content.write('BM', 0);
  content.writeUInt32LE(40, 14);
  content.writeInt32LE(WIDTH, 18);
  content.writeInt32LE(-HEIGHT, 22);
  return content;
}

function createCoreBmp() {
  const content = Buffer.alloc(26);
  content.write('BM', 0);
  content.writeUInt32LE(12, 14);
  content.writeUInt16LE(WIDTH, 18);
  content.writeUInt16LE(HEIGHT, 20);
  return content;
}

function createGif() {
  const content = Buffer.alloc(10);
  content.write('GIF89a', 0);
  content.writeUInt16LE(WIDTH, 6);
  content.writeUInt16LE(HEIGHT, 8);
  return content;
}

function createJpeg() {
  const content = Buffer.alloc(27);
  content.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00]);
  content.set([0xff, 0xc2, 0x00, 0x11, 0x08], 8);
  content.writeUInt16BE(HEIGHT, 13);
  content.writeUInt16BE(WIDTH, 15);
  return content;
}

function createPng() {
  const content = Buffer.alloc(33);
  content.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  content.writeUInt32BE(13, 8);
  content.write('IHDR', 12);
  content.writeUInt32BE(WIDTH, 16);
  content.writeUInt32BE(HEIGHT, 20);
  return content;
}

function createCgbiPng() {
  const content = Buffer.alloc(49);
  content.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  content.writeUInt32BE(4, 8);
  content.write('CgBI', 12);
  content.writeUInt32BE(13, 24);
  content.write('IHDR', 28);
  content.writeUInt32BE(WIDTH, 32);
  content.writeUInt32BE(HEIGHT, 36);
  return content;
}

function createPsd() {
  const content = Buffer.alloc(22);
  content.write('8BPS', 0);
  content.writeUInt16BE(1, 4);
  content.writeUInt32BE(HEIGHT, 14);
  content.writeUInt32BE(WIDTH, 18);
  return content;
}

function createSvg() {
  return Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}"/>`);
}

function createSvgWithUnits() {
  return Buffer.from('<svg width="3.125in" height="5.2916666667cm"/>');
}

function createSvgWithPicas() {
  return Buffer.from('<svg width="18.75pc" height="12.5pc"/>');
}

function createSvgWithViewBox() {
  return Buffer.from('<svg viewBox="0 0 300 200"/>');
}

function createTiff(endianness: 'big' | 'little', type: number): Buffer {
  const content = Buffer.alloc(38);
  const bigEndian = endianness === 'big';
  content.write(bigEndian ? 'MM' : 'II', 0);
  writeTiffUInt16(content, 2, 42, bigEndian);
  writeTiffUInt32(content, 4, 8, bigEndian);
  writeTiffUInt16(content, 8, 2, bigEndian);
  writeTiffEntry(content, 10, 256, WIDTH, type, bigEndian);
  writeTiffEntry(content, 22, 257, HEIGHT, type, bigEndian);
  return content;
}

function writeTiffEntry(
  content: Buffer,
  offset: number,
  tag: number,
  value: number,
  type: number,
  bigEndian: boolean,
): void {
  writeTiffUInt16(content, offset, tag, bigEndian);
  writeTiffUInt16(content, offset + 2, type, bigEndian);
  writeTiffUInt32(content, offset + 4, 1, bigEndian);
  if (type === 3) {
    writeTiffUInt16(content, offset + 8, value, bigEndian);
  } else {
    writeTiffUInt32(content, offset + 8, value, bigEndian);
  }
}

function writeTiffUInt16(
  content: Buffer,
  offset: number,
  value: number,
  bigEndian: boolean,
): void {
  if (bigEndian) {
    content.writeUInt16BE(value, offset);
  } else {
    content.writeUInt16LE(value, offset);
  }
}

function writeTiffUInt32(
  content: Buffer,
  offset: number,
  value: number,
  bigEndian: boolean,
): void {
  if (bigEndian) {
    content.writeUInt32BE(value, offset);
  } else {
    content.writeUInt32LE(value, offset);
  }
}

function createExtendedWebp() {
  const content = createWebpChunk('VP8X', 10);
  content.writeUIntLE(WIDTH - 1, 24, 3);
  content.writeUIntLE(HEIGHT - 1, 27, 3);
  return content;
}

function createLosslessWebp() {
  const content = createWebpChunk('VP8L', 5);
  const width = WIDTH - 1;
  const height = HEIGHT - 1;
  content[20] = 0x2f;
  content[21] = width & 0xff;
  content[22] = ((width >> 8) & 0x3f) | ((height & 0x03) << 6);
  content[23] = (height >> 2) & 0xff;
  content[24] = (height >> 10) & 0x0f;
  return content;
}

function createLossyWebp() {
  const content = createWebpChunk('VP8 ', 10);
  content.set([0x9d, 0x01, 0x2a], 23);
  content.writeUInt16LE(WIDTH, 26);
  content.writeUInt16LE(HEIGHT, 28);
  return content;
}

function createWebpChunk(type: string, length: number): Buffer {
  const content = Buffer.alloc(20 + length);
  content.write('RIFF', 0);
  content.writeUInt32LE(content.length - 8, 4);
  content.write('WEBP', 8);
  content.write(type, 12);
  content.writeUInt32LE(length, 16);
  return content;
}

function createKtx1(endianness: 'big' | 'little'): Buffer {
  const content = Buffer.alloc(64);
  content.set([
    0xab, 0x4b, 0x54, 0x58, 0x20, 0x31, 0x31, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  if (endianness === 'little') {
    content.set([0x01, 0x02, 0x03, 0x04], 12);
    content.writeUInt32LE(WIDTH, 36);
    content.writeUInt32LE(HEIGHT, 40);
  } else {
    content.set([0x04, 0x03, 0x02, 0x01], 12);
    content.writeUInt32BE(WIDTH, 36);
    content.writeUInt32BE(HEIGHT, 40);
  }
  return content;
}

function createKtx2() {
  const content = Buffer.alloc(80);
  content.set([
    0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  content.writeUInt32LE(WIDTH, 20);
  content.writeUInt32LE(HEIGHT, 24);
  return content;
}

function createZeroLengthJxlBox() {
  return Buffer.from([0x00, 0x00, 0x00, 0x00, 0x4a, 0x58, 0x4c, 0x20]);
}

function createZeroLengthHeifBox() {
  return Buffer.from([
    0x00, 0x00, 0x00, 0x00, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66,
  ]);
}

function createZeroLengthIcnsEntry() {
  return Buffer.from([
    0x69, 0x63, 0x6e, 0x73, 0x00, 0x00, 0x00, 0x10, 0x69, 0x73, 0x33, 0x32,
    0x00, 0x00, 0x00, 0x00,
  ]);
}

function createZeroLengthJpegSegment() {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00]);
}
