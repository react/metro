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

import type {HmrModule, HmrUpdate} from '../types';

const HMRClient = require('../HMRClient');

let mockSocket: ?{
  onclose: () => void,
  onmessage: (event: {data: string}) => void,
  onerror: (event: {data: string}) => void,
  close: () => void,
  mockEmit: (type: string, event: {data: string}) => void,
} = null;
let evaledCode = '';

beforeEach(() => {
  evaledCode = '';
  global.globalEvalWithSourceUrl = (code, sourceURL) => {
    evaledCode += '\n/* ' + sourceURL + ' */\n  ' + code;
  };
  const MockWebSocket = jest.fn(() => {
    mockSocket = {
      onerror: jest.fn(),
      onmessage: jest.fn(),
      onclose: jest.fn(),
      close: jest.fn(() => {
        if (mockSocket) {
          mockSocket.onclose();
        }
      }),
      mockEmit: (type: string, data: {data: string}) => {
        if (mockSocket) {
          if (type === 'error') {
            mockSocket.onerror(data);
          } else {
            mockSocket.onmessage(data);
          }
        }
      },
    };
    return mockSocket;
  });
  jest.spyOn(global, 'WebSocket', 'get').mockReturnValue(MockWebSocket);
});

afterEach(() => {
  jest.restoreAllMocks();
  delete global.globalEvalWithSourceUrl;
});

function sendUpdate(update: HmrUpdate) {
  if (!mockSocket) {
    throw new Error('mockSocket was not set when opening the connection.');
  }
  evaledCode += '\n/*** begin ' + update.revisionId + ' ***/';
  mockSocket.mockEmit('message', {
    data: JSON.stringify({
      type: 'update-start',
      body: {isInitialUpdate: false},
    }),
  });
  // $FlowFixMe[incompatible-use]
  mockSocket.mockEmit('message', {
    data: JSON.stringify({
      type: 'update',
      body: update,
    }),
  });
  // $FlowFixMe[incompatible-use]
  mockSocket.mockEmit('message', {
    data: JSON.stringify({
      type: 'update-end',
    }),
  });
  evaledCode += '\n/*** end ' + update.revisionId + ' ***/\n\n';
}

test('can apply updates individually and in a batch', () => {
  const updates: Array<HmrUpdate> = [
    {
      isInitialUpdate: true,
      revisionId: 'A (add 1, 2, and 3)',
      added: [
        {
          module: [1, 'function 1_A() {}'],
          sourceMappingURL: '1_A.js.map',
          sourceURL: '1.js',
        },
        {
          module: [2, 'function 2_A() {}'],
          sourceMappingURL: '2_A.js.map',
          sourceURL: '2.js',
        },
        {
          module: [3, 'function 3_A() {}'],
          sourceMappingURL: '3_A.js.map',
          sourceURL: '3.js',
        },
      ],
      modified: [],
      deleted: [],
    },
    {
      isInitialUpdate: false,
      revisionId: 'B (add 4, edit 3 and 1)',
      added: [
        {
          module: [4, 'function 4_B() {}'],
          sourceMappingURL: '4_B.js.map',
          sourceURL: '4.js',
        },
      ],
      modified: [
        {
          module: [3, 'function 3_B() {}'],
          sourceMappingURL: '3_B.js.map',
          sourceURL: '3.js',
        },
        {
          module: [1, 'function 1_B() {}'],
          sourceMappingURL: '1_B.js.map',
          sourceURL: '1.js',
        },
      ],
      deleted: [],
    },
    {
      isInitialUpdate: false,
      revisionId: 'C (edit 2, delete 3)',
      added: [],
      modified: [
        {
          module: [2, 'function 2_C() {}'],
          sourceMappingURL: '2_C.js.map',
          sourceURL: '2.js',
        },
      ],
      deleted: [3],
    },
    {
      isInitialUpdate: false,
      revisionId: 'D (delete 1, add 3)',
      added: [
        {
          module: [3, 'function 3_D() {}'],
          sourceMappingURL: '3_D.js.map',
          sourceURL: '3.js',
        },
      ],
      modified: [],
      deleted: [1],
    },
    {
      isInitialUpdate: false,
      revisionId: 'E (edit 2 and 3)',
      added: [],
      modified: [
        {
          module: [2, 'function 2_E() {}'],
          sourceMappingURL: '2_E.js.map',
          sourceURL: '2.js',
        },
        {
          module: [3, 'function 3_E() {}'],
          sourceMappingURL: '3_E.js.map',
          sourceURL: '3.js',
        },
      ],
      deleted: [],
    },
  ];

  // We'll try two sequences. In the first one, updates are applied one by one.
  // This corresponds to the case where Fast Refresh is on.
  let client = new HMRClient('wss://banana.com/phone');
  client.enable();
  updates.forEach(update => sendUpdate(update));
  expect(evaledCode).toMatchSnapshot('1: run updates as they arrive');
  evaledCode = '';
  client.close();

  // Now, we'll create a new client that has Fast Refresh disabled.
  // (We won't call client.enable() right after creating it.)
  client = new HMRClient('wss://banana.com/phone');
  updates.forEach(update => sendUpdate(update));
  expect(evaledCode).toMatchSnapshot('2: ignore updates');
  evaledCode = '';
  // We expect that enabling it will result in a batch of updates.
  // We should see latest versions of each module that wasn't deleted.
  client.enable();
  expect(evaledCode).toMatchSnapshot('3: apply updates in a batch');
});

test('can add and delete a module in a batch', () => {
  const updates: Array<HmrUpdate> = [
    {
      isInitialUpdate: true,
      revisionId: 'A (add 1 and 2)',
      added: [
        {
          module: [1, 'function 1_A() {}'],
          sourceMappingURL: '1_A.js.map',
          sourceURL: '1.js',
        },
        {
          module: [2, 'function 2_A() {}'],
          sourceMappingURL: '2_A.js.map',
          sourceURL: '2.js',
        },
      ],
      modified: [],
      deleted: [],
    },
    {
      isInitialUpdate: false,
      revisionId: 'B (delete 2)',
      added: [],
      modified: [],
      deleted: [2],
    },
  ];

  const client = new HMRClient('wss://banana.com/phone');
  updates.forEach(update => sendUpdate(update));
  client.enable();
  expect(evaledCode).not.toContain('2_A');
  expect(evaledCode).toMatchSnapshot();
});

test('can delete and re-add a module in a batch', () => {
  const updates: Array<HmrUpdate> = [
    {
      isInitialUpdate: false,
      revisionId: 'A (delete 2)',
      added: [],
      modified: [],
      deleted: [2],
    },
    {
      isInitialUpdate: false,
      revisionId: 'B (add 1 and 2)',
      added: [
        {
          module: [1, 'function 1_B() {}'],
          sourceMappingURL: '1_B.js.map',
          sourceURL: '1.js',
        },
        {
          module: [2, 'function 2_B() {}'],
          sourceMappingURL: '2_B.js.map',
          sourceURL: '2.js',
        },
      ],
      modified: [],
      deleted: [],
    },
  ];

  const client = new HMRClient('wss://banana.com/phone');
  updates.forEach(update => sendUpdate(update));
  client.enable();
  expect(evaledCode).toMatchSnapshot();
});

test('can enable and disable the client to batch updates', () => {
  const updates: Array<HmrUpdate> = [
    {
      isInitialUpdate: true,
      revisionId: 'A (add 1, 2, and 3)',
      added: [
        {
          module: [1, 'function 1_A() {}'],
          sourceMappingURL: '1_A.js.map',
          sourceURL: '1.js',
        },
        {
          module: [2, 'function 2_A() {}'],
          sourceMappingURL: '2_A.js.map',
          sourceURL: '2.js',
        },
        {
          module: [3, 'function 3_A() {}'],
          sourceMappingURL: '3_A.js.map',
          sourceURL: '3.js',
        },
      ],
      modified: [],
      deleted: [],
    },
    {
      isInitialUpdate: false,
      revisionId: 'B (add 4, edit 3 and 1)',
      added: [
        {
          module: [4, 'function 4_B() {}'],
          sourceMappingURL: '4_B.js.map',
          sourceURL: '4.js',
        },
      ],
      modified: [
        {
          module: [3, 'function 3_B() {}'],
          sourceMappingURL: '3_B.js.map',
          sourceURL: '3.js',
        },
        {
          module: [1, 'function 1_B() {}'],
          sourceMappingURL: '1_B.js.map',
          sourceURL: '1.js',
        },
      ],
      deleted: [],
    },
    {
      isInitialUpdate: false,
      revisionId: 'C (edit 2, delete 3)',
      added: [],
      modified: [
        {
          module: [2, 'function 2_C() {}'],
          sourceMappingURL: '2_C.js.map',
          sourceURL: '2.js',
        },
      ],
      deleted: [3],
    },
    {
      isInitialUpdate: false,
      revisionId: 'D (delete 1, add 3)',
      added: [
        {
          module: [3, 'function 3_D() {}'],
          sourceMappingURL: '3_D.js.map',
          sourceURL: '3.js',
        },
      ],
      modified: [],
      deleted: [1],
    },
    {
      isInitialUpdate: false,
      revisionId: 'E (edit 2 and 3)',
      added: [],
      modified: [
        {
          module: [2, 'function 2_E() {}'],
          sourceMappingURL: '2_E.js.map',
          sourceURL: '2.js',
        },
        {
          module: [3, 'function 3_E() {}'],
          sourceMappingURL: '3_E.js.map',
          sourceURL: '3.js',
        },
      ],
      deleted: [],
    },
  ];

  const client = new HMRClient('wss://banana.com/phone');
  client.enable();
  sendUpdate(updates[0]);
  client.disable();
  sendUpdate(updates[1]);
  sendUpdate(updates[2]);
  client.enable();
  client.disable();
  sendUpdate(updates[3]);
  sendUpdate(updates[4]);
  client.enable();

  expect(evaledCode).toMatchSnapshot();
});

describe('addModuleUpdateListener', () => {
  const update: HmrUpdate = {
    isInitialUpdate: false,
    revisionId: 'listener',
    added: [
      {
        module: [1, 'function 1_A() {}'],
        sourceMappingURL: '1_A.js.map',
        sourceURL: '1.js',
      },
    ],
    modified: [
      {
        module: [2, 'function 2_A() {}'],
        sourceMappingURL: '2_A.js.map',
        sourceURL: '2.js',
      },
    ],
    deleted: [],
  };

  test('notifies the listener before each module is evaluated', () => {
    const seen: Array<[number, string, boolean]> = [];
    const subscription = HMRClient.addModuleUpdateListener(hmrModule => {
      seen.push([
        hmrModule.module[0],
        hmrModule.sourceURL,
        evaledCode.includes(hmrModule.module[1]),
      ]);
    });
    const client = new HMRClient('wss://banana.com/phone');
    client.enable();
    sendUpdate(update);
    expect(seen).toEqual([
      [1, '1.js', false],
      [2, '2.js', false],
    ]);
    subscription.remove();
    client.close();
  });

  test('notifies the listener when a pending update is applied', () => {
    const listener = jest.fn();
    const subscription = HMRClient.addModuleUpdateListener(listener);
    const client = new HMRClient('wss://banana.com/phone');
    sendUpdate(update);
    expect(listener).not.toHaveBeenCalled();
    client.enable();
    expect(
      listener.mock.calls.map(([hmrModule]) => hmrModule.sourceURL),
    ).toEqual(['1.js', '2.js']);
    subscription.remove();
    client.close();
  });

  test('stops notifying the listener after it is removed', () => {
    const listener = jest.fn();
    const subscription = HMRClient.addModuleUpdateListener(listener);
    subscription.remove();
    const client = new HMRClient('wss://banana.com/phone');
    client.enable();
    sendUpdate(update);
    expect(listener).not.toHaveBeenCalled();
    client.close();
  });
  test('notifies every listener, including one registered twice', () => {
    const calls: Array<string> = [];
    const first = (hmrModule: HmrModule) => {
      calls.push('first ' + hmrModule.sourceURL);
    };
    const second = (hmrModule: HmrModule) => {
      calls.push('second ' + hmrModule.sourceURL);
    };
    const subscriptions = [
      HMRClient.addModuleUpdateListener(first),
      HMRClient.addModuleUpdateListener(second),
      HMRClient.addModuleUpdateListener(first),
    ];
    subscriptions[2].remove();
    const client = new HMRClient('wss://banana.com/phone');
    client.enable();
    sendUpdate(update);
    expect(calls).toEqual([
      'first 1.js',
      'second 1.js',
      'first 2.js',
      'second 2.js',
    ]);
    subscriptions.forEach(subscription => subscription.remove());
    client.close();
  });

  test('applies listener changes made during a notification to the next module', () => {
    const calls: Array<string> = [];
    let late = null;
    const subscription = HMRClient.addModuleUpdateListener(hmrModule => {
      calls.push('early ' + hmrModule.sourceURL);
      if (late == null) {
        late = HMRClient.addModuleUpdateListener(lateModule => {
          calls.push('late ' + lateModule.sourceURL);
        });
      }
    });
    const client = new HMRClient('wss://banana.com/phone');
    client.enable();
    sendUpdate(update);
    expect(calls).toEqual(['early 1.js', 'early 2.js', 'late 2.js']);
    subscription.remove();
    late?.remove();
    client.close();
  });
});
