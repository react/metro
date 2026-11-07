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

import B64Builder from '../B64Builder';

let builder;
beforeEach(() => {
  builder = new B64Builder();
});

test('exposes a fluent interface', () => {
  expect(builder.markLines(0)).toBe(builder);
  expect(builder.markLines(3)).toBe(builder);
  expect(builder.startSegment(0)).toBe(builder);
  expect(builder.append(4)).toBe(builder);
});

test('can create an empty string', () => {
  expect(builder.toString()).toEqual('');
});

test('can mark a new line in the generated code', () => {
  builder.markLines(1);
  expect(builder.toString()).toEqual(';');
});

test('can mark multiple new lines in the generated code', () => {
  builder.markLines(4);
  expect(builder.toString()).toEqual(';;;;');
});

test('can mark zero new lines in the generated code', () => {
  builder.markLines(0);
  expect(builder.toString()).toEqual('');
});

test('can mark more new lines than twice the initial buffer size', () => {
  const lines = 3 * 1024 * 1024;
  builder.startSegment(0).markLines(lines).startSegment(0);
  expect(builder.toString()).toEqual('A' + ';'.repeat(lines) + 'A');
});

test('does not add commas when just starting a segment', () => {
  builder.startSegment(0);
  expect(builder.toString()).toEqual('A');
});

test('adds a comma when starting a segment after another segment', () => {
  builder.startSegment(0);
  builder.startSegment(1);
  expect(builder.toString()).toEqual('A,C');
});

test('does not add a comma when starting a segment after marking a line', () => {
  builder.startSegment(0);
  builder.markLines(1);
  builder.startSegment(0);
  expect(builder.toString()).toEqual('A;A');
});

test('adds a comma when starting a segment after calling `markLines(0)`', () => {
  builder.startSegment(0);
  builder.markLines(0);
  builder.startSegment(1);
  expect(builder.toString()).toEqual('A,C');
});

test('can append values that fit within 5 bits (including sign bit)', () => {
  builder.append(0b1111);
  builder.append(-0b1111);
  expect(builder.toString()).toEqual('ef');
});

test('can append values that fit within 10 bits (including sign bit)', () => {
  builder.append(0b111100110);
  builder.append(-0b110110011);
  expect(builder.toString()).toEqual('senb');
});

test('can append values that fit within 15 bits (including sign bit)', () => {
  builder.append(0b10011111011001);
  builder.append(-0b11001010001001);
  expect(builder.toString()).toEqual('y9TzoZ');
});

test('can append values that fit within 20 bits (including sign bit)', () => {
  builder.append(0b1110010011101110110);
  builder.append(-0b1011000010100100110);
  expect(builder.toString()).toEqual('s3zctyiW');
});

test('can append values that fit within 25 bits (including sign bit)', () => {
  builder.append(0b100010001111011010110111);
  builder.append(-0b100100111100001110101111);
  expect(builder.toString()).toEqual('ur7jR/6hvS');
});

test('can append values that fit within 30 bits (including sign bit)', () => {
  builder.append(0b10001100100001101010001011111);
  builder.append(-0b11111000011000111110011111101);
  expect(builder.toString()).toEqual('+lqjyR7v+xhf');
});

test('can append values that fit within 32 bits (including sign bit)', () => {
  builder.append(0b1001100101000101001011111110011);
  builder.append(-0b1101101101011000110011001110000);
  expect(builder.toString()).toEqual('m/rq0sChnzx1tD');
});

test('can handle multiple operations', () => {
  builder
    .markLines(3)
    .startSegment(4)
    .append(2)
    .append(2)
    .append(0)
    .append(2345)
    .startSegment(12)
    .append(987543)
    .markLines(1)
    .startSegment(0);
  expect(builder.toString()).toEqual(';;;IEEAyyE,Yu5o8B;A');
});
