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

import type {ContextMode} from '../ModuleGraph/worker/collectDependencies';

import * as os from 'node:os';
import * as path from 'node:path';

function createFileMap(
  modulePath: string,
  files: string[],
  processModule: (moduleId: string) => string,
): string {
  let mapString = '\n';

  files
    .slice()
    // Sort for deterministic output
    .sort()
    .forEach(file => {
      let filePath = path.relative(modulePath, file);

      if (os.platform() === 'win32') {
        filePath = filePath.replaceAll('\\', '/');
      }

      // NOTE(EvanBacon): I'd prefer we prevent the ability for a module to require itself (`require.context('./')`)
      // but Webpack allows this, keeping it here provides better parity between bundlers.

      // Ensure relative file paths start with `./` so they match the
      // patterns (filters) used to include them.
      if (!filePath.startsWith('.')) {
        filePath = `./${filePath}`;
      }

      const key = JSON.stringify(filePath);
      // NOTE(EvanBacon): Webpack uses `require.resolve` in order to load modules on demand,
      // Metro doesn't have this functionality so it will use getters instead. Modules need to
      // be loaded on demand because if we imported directly then users would get errors from importing
      // a file without exports as soon as they create a new file and the context module is updated.

      // NOTE: The values are set to `enumerable` so the `context.keys()` method works as expected.
      mapString += `  ${key}: { enumerable: true, get() { return ${processModule(
        file,
      )}; } },\n`;
    });
  return `Object.defineProperties({}, {${mapString}})`;
}

function getEmptyContextModuleTemplate(modulePath: string): string {
  return `
function metroEmptyContext(request) {
  let e = new Error('No modules in context');
  e.code = 'MODULE_NOT_FOUND';
  throw e;
}

// Return the keys that can be resolved.
metroEmptyContext.keys = () => ([]);

// Return the module identifier for a user request.
metroEmptyContext.resolve = function metroContextResolve(request) {
  throw new Error('Unimplemented Metro module context functionality');
}

module.exports = metroEmptyContext;`;
}

function getLoadableContextModuleTemplate(
  modulePath: string,
  files: string[],
  importSyntax: string,
  getContextTemplate: string,
): string {
  return `// All of the requested modules are loaded behind enumerable getters.
const map = ${createFileMap(
    modulePath,
    files,
    moduleId => `${importSyntax}(${JSON.stringify(moduleId)})`,
  )};

function metroContext(request) {
  ${getContextTemplate}
}

// Return the keys that can be resolved.
metroContext.keys = function metroContextKeys() {
  return Object.keys(map);
};

// Return the module identifier for a user request.
metroContext.resolve = function metroContextResolve(request) {
  throw new Error('Unimplemented Metro module context functionality');
}

module.exports = metroContext;`;
}

/**
 * Generate a context module as a virtual file string.
 *
 * @prop {ContextMode} mode indicates how the modules should be loaded.
 * @prop {string} modulePath virtual file path for the virtual module. Example: `require.context('./src')` -> `'/path/to/project/src'`.
 * @prop {string[]} files list of absolute file paths that must be exported from the context module. Example: `['/path/to/project/src/index.js']`.
 *
 * @returns a string representing a context module (virtual file contents).
 */
export function getContextModuleTemplate(
  mode: ContextMode,
  modulePath: string,
  files: string[],
): string {
  if (!files.length) {
    return getEmptyContextModuleTemplate(modulePath);
  }
  switch (mode) {
    case 'eager':
      return getLoadableContextModuleTemplate(
        modulePath,
        files,
        // NOTE(EvanBacon): It's unclear if we should use `import` or `require` here so sticking
        // with the more stable option (`require`) for now.
        'require',
        [
          '  // Here Promise.resolve().then() is used instead of new Promise() to prevent',
          '  // uncaught exception popping up in devtools',
          '  return Promise.resolve().then(() => map[request]);',
        ].join('\n'),
      );
    case 'sync':
      return getLoadableContextModuleTemplate(
        modulePath,
        files,
        'require',
        '  return map[request];',
      );
    case 'lazy':
    case 'lazy-once':
      return getLoadableContextModuleTemplate(
        modulePath,
        files,
        'import',
        '  return map[request];',
      );
    default:
      throw new Error(`Metro context mode "${mode}" is unimplemented`);
  }
}
