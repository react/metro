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

import type {ConfigT} from 'metro-config';
import type {CommandModule} from 'yargs';
import typeof Yargs from 'yargs';

import {makeAsyncCommand} from '../cli-utils';
import Server from '../Server';
import {loadConfig} from 'metro-config';
import fs from 'node:fs';
import path from 'node:path';
import {promisify} from 'node:util';

type Args = Readonly<{
  _: unknown,
  $0: unknown,
  entryFile: string,
  output?: string,
  platform?: string,
  transformer?: string,
  maxWorkers?: number,
  dev: boolean,
  verbose: boolean,
  ...
}>;

async function dependencies(args: Args, config: ConfigT) {
  const rootModuleAbsolutePath = args.entryFile;
  if (!fs.existsSync(rootModuleAbsolutePath)) {
    return Promise.reject(
      new Error(`File ${rootModuleAbsolutePath} does not exist`),
    );
  }

  // $FlowFixMe[cannot-write]
  config.cacheStores = [];

  const relativePath = path.relative(
    config.server.unstable_serverRoot ?? config.projectRoot,
    rootModuleAbsolutePath,
  );

  const options = {
    platform: args.platform,
    entryFile: relativePath,
    dev: args.dev,
    minify: false,
    generateSourceMaps: !args.dev,
  };

  const outStream =
    args.output != null ? fs.createWriteStream(args.output) : process.stdout;

  const server = new Server(config);
  try {
    const deps = await server.getOrderedDependencyPaths(options);
    deps.forEach(modulePath => {
      // Temporary hack to disable listing dependencies not under this directory.
      // Long term, we need either
      // (a) JS code to not depend on anything outside this directory, or
      // (b) Come up with a way to declare this dependency in Buck.
      const isInsideProjectRoots =
        config.watchFolders.filter(root => modulePath.startsWith(root)).length >
        0;
      if (isInsideProjectRoots) {
        outStream.write(modulePath + '\n');
      }
    });
  } finally {
    await server.end();
  }

  return args.output != null
    ? // $FlowFixMe[method-unbinding]
      promisify(outStream.end).bind(outStream)()
    : Promise.resolve();
}

export default (): CommandModule => ({
  command: 'get-dependencies [entryFile]',
  desc: 'List all dependencies that will be bundled for a given entry point',
  builder: (yargs: Yargs) => {
    yargs.option('entry-file', {
      type: 'string',
      demandOption: true,
      describe: 'Absolute path to the root JS file',
    });
    yargs.option('output', {
      type: 'string',
      describe:
        'File name where to store the output, ex. /tmp/dependencies.txt',
    });
    yargs.option('platform', {
      type: 'string',
      describe: 'The platform extension used for selecting modules',
    });
    yargs.option('transformer', {
      type: 'string',
      describe: 'Specify a custom transformer to be used',
    });
    yargs.option('max-workers', {
      type: 'number',
      describe:
        'Specifies the maximum number of workers the worker-pool ' +
        'will spawn for transforming files. This defaults to the number of the ' +
        'cores available on your machine.',
    });
    yargs.option('dev', {
      type: 'boolean',
      default: true,
      describe: 'If false, skip all dev-only code path',
    });
    yargs.option('verbose', {
      type: 'boolean',
      default: false,
      description: 'Enables logging',
    });
  },
  handler: makeAsyncCommand(async (argv: Args) => {
    // $FlowFixMe[incompatible-type] argv has extra props.
    const config = await loadConfig(argv);
    await dependencies(argv, config);
  }),
});
