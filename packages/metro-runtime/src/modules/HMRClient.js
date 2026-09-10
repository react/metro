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
import type {HmrModule} from './types';
import type {HmrMessage, HmrUpdate} from './types';

const EventEmitter = require('./vendor/eventemitter3');

const HEARTBEAT_INTERVAL_MS = 20_000;

type SocketState = 'opening' | 'open' | 'closed';

const inject = ({module: [id, code], sourceURL}: HmrModule) => {
  // Some engines do not support `sourceURL` as a comment. We expose a
  // `globalEvalWithSourceUrl` function to handle updates in that case.
  if (global.globalEvalWithSourceUrl) {
    global.globalEvalWithSourceUrl(code, sourceURL);
  } else {
    // eslint-disable-next-line no-eval
    eval(code);
  }
};

const HMRClientOnUpdate = global.HMRClientOnUpdate as Array<
  (update: HmrModule) => void,
>;

const injectUpdate = (update: HmrUpdate) => {
  HMRClientOnUpdate.forEach(callback => {
    update.added.forEach(callback);
    update.modified.forEach(callback);
  });
};

class HMRClient extends EventEmitter {
  _isEnabled: boolean = false;
  _pendingUpdate: HmrUpdate | null = null;
  _queue: Array<string> = [];
  _state: SocketState = 'opening';
  _ws: WebSocket;
  _heartbeatTimer: ?IntervalID = null;

  constructor(url: string) {
    super();

    HMRClientOnUpdate.push(inject);

    // Access the global WebSocket object only after enabling the client,
    // since some polyfills do the initialization lazily.
    this._ws = new global.WebSocket(url);
    this._ws.onopen = () => {
      this._state = 'open';
      this._startHeartbeat();
      this.emit('open');
      this._flushQueue();
    };
    this._ws.onerror = error => {
      this.emit('connection-error', error);
    };
    this._ws.onclose = closeEvent => {
      this._state = 'closed';
      this._stopHeartbeat();
      this.emit('close', closeEvent);
    };
    this._ws.onmessage = message => {
      const data: HmrMessage = JSON.parse(String(message.data));

      switch (data.type) {
        case 'heartbeat':
          // Not exposed to consumers
          break;

        case 'bundle-registered':
          this.emit('bundle-registered');
          break;

        case 'update-start':
          this.emit('update-start', data.body);
          break;

        case 'update':
          this.emit('update', data.body);
          break;

        case 'update-done':
          this.emit('update-done', data.body);
          break;

        case 'error':
          this.emit('error', data.body);
          break;

        default:
          this.emit('error', {type: 'unknown-message', message: data});
      }
    };

    this.on('update', (update: HmrUpdate) => {
      if (this._isEnabled) {
        injectUpdate(update);
      } else if (this._pendingUpdate == null) {
        this._pendingUpdate = update;
      } else {
        this._pendingUpdate = mergeUpdates(this._pendingUpdate, update);
      }
    });
  }

  close(): void {
    this._ws.close();
  }

  send(message: string): void {
    switch (this._state) {
      case 'opening':
        this._queue.push(message);
        break;
      case 'open':
        this._ws.send(message);
        break;
      case 'closed':
        // Ignore.
        break;
      default:
        throw new Error('[WebSocketHMRClient] Unknown state: ' + this._state);
    }
  }

  _flushQueue(): void {
    this._queue.forEach(message => this.send(message));
    this._queue.length = 0;
  }

  _startHeartbeat(): void {
    this._stopHeartbeat();
    this._heartbeatTimer = setInterval(() => {
      if (this._state === 'open') {
        this._ws.send('{"type":"heartbeat"}');
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  _stopHeartbeat(): void {
    if (this._heartbeatTimer != null) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }

  enable() {
    this._isEnabled = true;
    const update = this._pendingUpdate;
    this._pendingUpdate = null;
    if (update != null) {
      injectUpdate(update);
    }
  }

  disable() {
    this._isEnabled = false;
  }

  isEnabled(): boolean {
    return this._isEnabled;
  }

  hasPendingUpdates(): boolean {
    return this._pendingUpdate != null;
  }
}

function mergeUpdates(base: HmrUpdate, next: HmrUpdate): HmrUpdate {
  const addedIDs = new Set<number>();
  const deletedIDs = new Set<number>();
  const moduleMap = new Map<number, HmrModule>();

  // Fill in the temporary maps and sets from both updates in their order.
  applyUpdateLocally(base);
  applyUpdateLocally(next);

  function applyUpdateLocally(update: HmrUpdate) {
    update.deleted.forEach(id => {
      if (addedIDs.has(id)) {
        addedIDs.delete(id);
      } else {
        deletedIDs.add(id);
      }
      moduleMap.delete(id);
    });
    update.added.forEach(item => {
      const id = item.module[0];
      if (deletedIDs.has(id)) {
        deletedIDs.delete(id);
      } else {
        addedIDs.add(id);
      }
      moduleMap.set(id, item);
    });
    update.modified.forEach(item => {
      const id = item.module[0];
      moduleMap.set(id, item);
    });
  }

  // Now reconstruct a unified update from our in-memory maps and sets.
  // Applying it should be equivalent to applying both of them individually.
  const result = {
    isInitialUpdate: next.isInitialUpdate,
    revisionId: next.revisionId,
    added: [] as Array<HmrModule>,
    modified: [] as Array<HmrModule>,
    deleted: [] as Array<number>,
  };
  deletedIDs.forEach(id => {
    result.deleted.push(id);
  });
  moduleMap.forEach((item, id) => {
    if (deletedIDs.has(id)) {
      return;
    }

    if (addedIDs.has(id)) {
      result.added.push(item);
    } else {
      result.modified.push(item);
    }
  });
  return result;
}

module.exports = HMRClient;
