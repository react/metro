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

import type {ChangeEvent, FileMapPlugin} from '../flow-types';

/**
 * What `plugin` reported about the batch of changes in `event`, as returned
 * by its `onChanged`, or undefined if it reported nothing.
 */
export default function getPluginChanges<ChangeSummary>(
  event: ChangeEvent,
  plugin: FileMapPlugin<empty, empty, ChangeSummary>,
): ChangeSummary | void {
  // $FlowFixMe[incompatible-type] Only `plugin` writes the entry under its name
  return event.pluginChanges.get(plugin.name);
}
