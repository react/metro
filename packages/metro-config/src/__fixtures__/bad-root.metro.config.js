/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

/*::
import type {ConfigT, InputConfigT} from '../types';
*/

module.exports = (defaultConfig /*: ConfigT */) /*:InputConfigT*/ => ({
  // $FlowExpectedError[incompatible-type] testing bad config
  projectRoot: ['array'],
});
