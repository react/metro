/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 * @format
 * @oncall react_native
 */

import {clearInterval, setInterval} from 'node:timers';
import ws from 'ws';

type WebsocketServiceInterface<T> = interface {
  readonly onClientConnect: (
    url: string,
    sendFn: (data: string) => void,
  ) => Promise<?T>,
  readonly onClientDisconnect?: (client: T) => unknown,
  readonly onClientError?: (client: T, e: Error) => unknown,
  readonly onClientMessage?: (
    client: T,
    message: string | Buffer | ArrayBuffer | Array<Buffer>,
    sendFn: (data: string) => void,
  ) => unknown,
};

type HMROptions<TClient> = {
  websocketServer: WebsocketServiceInterface<TClient>,
  ...
};

const KEEP_ALIVE_INTERVAL_MS = 20000;

/**
 * Returns a WebSocketServer to be attached to an existing HTTP instance. It forwards
 * the received events on the given "websocketServer" parameter. It must be an
 * object with the following fields:
 *
 *   - onClientConnect
 *   - onClientError
 *   - onClientMessage
 *   - onClientDisconnect
 */

export default function createWebsocketServer<TClient>({
  websocketServer,
}: HMROptions<TClient>): ws.Server {
  const wss = new ws.Server({
    noServer: true,
  });

  wss.on('connection', async (ws, req) => {
    let connected = true;
    const url = req.url;

    const sendFn = (data: string) => {
      if (connected) {
        ws.send(data);
      }
    };

    const client = await websocketServer.onClientConnect(url, sendFn);

    if (client == null) {
      ws.close();
      return;
    }

    const keepAliveInterval = setInterval(
      () => ws.ping(),
      KEEP_ALIVE_INTERVAL_MS,
    ).unref();

    ws.on('error', e => {
      websocketServer.onClientError && websocketServer.onClientError(client, e);
    });

    ws.on('close', () => {
      clearInterval(keepAliveInterval);
      websocketServer.onClientDisconnect &&
        websocketServer.onClientDisconnect(client);
      connected = false;
    });

    ws.on('message', message => {
      websocketServer.onClientMessage &&
        websocketServer.onClientMessage(client, message, sendFn);
    });
  });

  return wss;
}
