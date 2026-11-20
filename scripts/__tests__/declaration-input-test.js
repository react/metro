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

import {expandFlowCommentTypes} from '../generateTypeScriptDefinitions';
import {translateFlowToFlowDef} from 'flow-api-translator';

test('declaration input removes an executable hashbang without moving lines', () => {
  const source =
    '#!/usr/bin/env node\r\n/** @flow */\r\nexport const value: string = "ok";';
  expect(expandFlowCommentTypes(source)).toBe(
    '\r\n/** @flow */\r\nexport const value: string = "ok";',
  );
});

test('preserves hashbang text in ordinary strings', () => {
  const source = 'export const value: string = "#!/usr/bin/env node";';
  expect(expandFlowCommentTypes(source)).toBe(source);
});

test('expands comment types after removing a hashbang', () => {
  const source = '#!/usr/bin/env node\nconst value /*: string */ = "ok";';
  expect(expandFlowCommentTypes(source)).toBe(
    '\nconst value : string  = "ok";',
  );
});

test('translates a typed CLI into declarations with the published parser', async () => {
  const source =
    '#!/usr/bin/env node\n/** @flow */\nexport const value: string = "ok";';
  const result = await translateFlowToFlowDef(
    expandFlowCommentTypes(source),
    {},
    {},
  );
  expect(result).not.toContain('#!');
  expect(result).toContain('value: string');
});
