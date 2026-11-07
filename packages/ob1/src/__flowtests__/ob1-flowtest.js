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

import type {Number0, Number1} from '../ob1';

import {add, add0, add1, get0, get1, inc, neg, sub, sub1} from '../ob1';

const FORTY_TWO_0 = add0(42);
const FORTY_TWO_1 = add1(42);

export default {
  testSafeOps() {
    add(FORTY_TWO_0, FORTY_TWO_0) as Number0;
    add(FORTY_TWO_0, FORTY_TWO_1) as Number1;
    add(FORTY_TWO_1, FORTY_TWO_0) as Number1;
    sub(FORTY_TWO_1, FORTY_TWO_1) as Number0;
    add(FORTY_TWO_0, 9000) as Number0;
    add(FORTY_TWO_0, 9000) as Number0;
    add(FORTY_TWO_1, 9000) as Number1;
    sub(FORTY_TWO_1, 9000) as Number1;
    get0(FORTY_TWO_0) as number;
    get1(FORTY_TWO_1) as number;
    neg(FORTY_TWO_0) as Number0;
    add1(FORTY_TWO_0) as Number1;
    sub1(FORTY_TWO_1) as Number0;
    inc(FORTY_TWO_0) as Number0;
    inc(FORTY_TWO_1) as Number1;
  },
  testUnsafeOps() {
    // $FlowExpectedError[incompatible-type]  - adding two 1-based offsets.
    add(FORTY_TWO_1, FORTY_TWO_1);

    // $FlowExpectedError[incompatible-type]  - subtracting 1-based offset from 0-based offset.
    sub(FORTY_TWO_0, FORTY_TWO_1);

    // $FlowExpectedError[unsafe-arithmetic]  - direct computations with offsets are disallowed.
    FORTY_TWO_0 - 1;

    // $FlowExpectedError[unsafe-arithmetic]  - direct computations with offsets are disallowed.
    FORTY_TWO_1 - 1;

    // $FlowExpectedError[incompatible-type]  - extracting a 1-based offset as a 0-based number
    get0(FORTY_TWO_1);

    // $FlowExpectedError[incompatible-type]  - extracting a 0-based offset as a 1-based number
    get1(FORTY_TWO_0);

    // $FlowExpectedError[incompatible-type]  - negating a 1-based offset
    neg(FORTY_TWO_1);

    // $FlowExpectedError[incompatible-type]  - adding 1 to an offset that's already 1-based
    add1(FORTY_TWO_1);

    // $FlowExpectedError[incompatible-type]  - subtracting 1 from an offset that's already 0-based
    sub1(FORTY_TWO_0);

    // $FlowExpectedError[incompatible-type]  - extracting an arbitrary number as a 0-based number
    get0(42);

    // $FlowExpectedError[incompatible-type]  - extracting an arbitrary number as a 1-based number
    get1(42);
  },
};
