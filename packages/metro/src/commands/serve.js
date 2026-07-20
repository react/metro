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

import type {ServerOptions as HttpsServerOptions} from 'node:https';
import type {CommandModule} from 'yargs';
import typeof Yargs from 'yargs';

import {makeAsyncCommand, watchFile} from '../cli-utils';
import {loadConfig, resolveConfig} from 'metro-config';
import {promisify} from 'node:util';

type Args = Readonly<{
  _: unknown,
  $0: unknown,
  projectRoots?: ReadonlyArray<string>,
  host: string,
  port: number,
  maxWorkers?: number,
  secure?: boolean,
  secureKey?: string,
  secureCert?: string,
  secureServerOptions?: HttpsServerOptions,
  hmrEnabled?: boolean,
  config?: string,
  resetCache?: boolean,
  ...
}>;

export default (): CommandModule => ({
  command: 'serve',
  aliases: ['start'],
  desc: 'Starts Metro on the given port, building bundles on the fly',

  builder: (yargs: Yargs): void => {
    yargs.option('project-roots', {
      alias: 'P',
      type: 'string',
      array: true,
    });

    yargs.option('host', {alias: 'h', type: 'string', default: 'localhost'});
    yargs.option('port', {alias: 'p', type: 'number', default: 8081});

    yargs.option('max-workers', {alias: 'j', type: 'number'});

    yargs.option('secure', {type: 'boolean', describe: '(deprecated)'});
    yargs.option('secure-key', {type: 'string', describe: '(deprecated)'});
    yargs.option('secure-cert', {type: 'string', describe: '(deprecated)'});
    yargs.option('secure-server-options', {
      alias: 's',
      type: 'string',
      describe: 'Use dot notation for object path',
    });

    yargs.option('hmr-enabled', {alias: 'hmr', type: 'boolean'});

    yargs.option('config', {alias: 'c', type: 'string'});

    // Deprecated
    yargs.option('reset-cache', {type: 'boolean'});

    // Examples
    yargs.example(
      'secure-server-options',
      '-s.cert="$(cat path/to/cert)" -s.key="$(cat path/to/key")',
    );
  },

  handler: makeAsyncCommand(async (argv: Args) => {
    let server = null;
    let restarting = false;

    async function restart(): Promise<void> {
      if (restarting) {
        return;
      } else {
        restarting = true;
      }

      if (server) {
        // eslint-disable-next-line no-console
        console.log('Configuration changed. Restarting the server...');
        // $FlowFixMe[method-unbinding] added when improving typing for this parameters
        await promisify(server.close).call(server);
      }

      // $FlowFixMe[incompatible-type] argv has extra props.
      const config = await loadConfig(argv);

      // Inline require() to avoid circular dependency with ../index
      // eslint-disable-next-line import/no-commonjs
      const MetroApi = require('../index');

      const {
        _,
        $0: _0,
        config: _config,
        hmrEnabled: _hmrEnabled,
        maxWorkers: _maxWorkers,
        port: _port,
        projectRoots: _projectRoots,
        resetCache: _resetCache,
        ...runServerOptions
      } = argv;
      ({httpServer: server} = await MetroApi.runServer(
        config,
        // $FlowFixMe[incompatible-exact] argv has extra props.
        runServerOptions,
      ));

      restarting = false;
    }

    const foundConfig = await resolveConfig(argv.config);

    if (foundConfig) {
      await watchFile(foundConfig.filepath, restart);
    } else {
      await restart();
    }
  }),
});
