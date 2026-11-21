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

import type {
  ExternalInput,
  Options,
  TransformResultDependency,
  TransformResultWithSource,
} from '../types';

import DeltaCalculator from '../DeltaCalculator';
import {createEmitChange, createPathNormalizer} from './test-utils';
import EventEmitter from 'node:events';
import path from 'node:path';

const p = createPathNormalizer();

function dependency(name: string): TransformResultDependency {
  return {
    name,
    data: {key: name, asyncType: null, isESMImport: false, locs: []},
  };
}

describe('DeltaCalculator + external inputs', () => {
  // File contents, by absolute path.
  let files: Map<string, string>;
  // External inputs `styles.css` declares, or null to declare none.
  let declaredInputs: ?ReadonlyArray<ExternalInput>;
  let failingPaths: Set<string>;
  let transformedPaths: Array<string>;
  let transformCount = 0;
  let fileWatcher: EventEmitter;
  let emitChange;
  let deltaCalculator: DeltaCalculator<{
    type: string,
    data: {code: string},
  }>;

  const transform = async (
    modulePath: string,
  ): Promise<
    TransformResultWithSource<{type: string, data: {code: string}}>,
  > => {
    transformedPaths.push(modulePath);
    if (failingPaths.has(modulePath)) {
      throw new Error('Transform failed: ' + modulePath);
    }
    const source = files.get(modulePath) ?? '';
    let code = source;
    if (modulePath === p('/root/styles.css') && declaredInputs != null) {
      // The output depends on every input it declares.
      code +=
        ' ' +
        [...files.keys()]
          .filter(filePath =>
            declaredInputs?.some(input =>
              input.type === 'file'
                ? input.filePath === filePath
                : filePath.startsWith(input.dirPath + path.sep) &&
                  filePath.endsWith('.js'),
            ),
          )
          .sort()
          .map(filePath => files.get(filePath))
          .join(' ');
    }
    return {
      dependencies: source
        .split('\n')
        .filter(line => line.startsWith('require '))
        .map(line => dependency(line.slice('require '.length))),
      output: [{type: 'js/module', data: {code}}],
      getSource: () => Buffer.from(source),
      // A fresh key per transform, as `Transformer` gives a result that
      // declares external inputs.
      unstable_transformResultKey: String(++transformCount),
      ...(modulePath === p('/root/styles.css') && declaredInputs != null
        ? {unstable_externalInputs: declaredInputs}
        : null),
    };
  };

  const options: Options<{type: string, data: {code: string}}> = {
    unstable_allowRequireContext: false,
    unstable_enablePackageExports: false,
    unstable_incrementalResolution: false,
    lazy: false,
    onProgress: null,
    resolve: (from: string, to: TransformResultDependency) => ({
      type: 'sourceFile',
      filePath: path.join(path.dirname(from), to.name),
    }),
    shallow: false,
    transform,
    transformOptions: {
      dev: false,
      minify: false,
      platform: null,
      type: 'module',
      unstable_transformProfile: 'default',
    },
  };

  const getDelta = async () => {
    transformedPaths = [];
    const delta = await deltaCalculator.getDelta({
      reset: false,
      shallow: false,
    });
    return {
      modified: [...delta.modified.keys()],
      transformed: transformedPaths,
    };
  };

  const stylesCode = () =>
    deltaCalculator.getGraph().dependencies.get(p('/root/styles.css'))
      ?.output[0].data.code;

  beforeEach(async () => {
    files = new Map([
      [p('/root/index.js'), 'require styles.css'],
      [p('/root/styles.css'), '.a {}'],
      [p('/root/tailwind.config.js'), 'config1'],
      [p('/root/src/App.js'), 'app1'],
      [p('/root/src/notes.txt'), 'notes1'],
    ]);
    declaredInputs = [
      {type: 'file', filePath: p('/root/tailwind.config.js')},
      {
        type: 'directory',
        dirPath: p('/root/src'),
        recursive: true,
        filter: {pattern: '\\.js$', flags: ''},
      },
    ];
    failingPaths = new Set();
    transformedPaths = [];
    fileWatcher = new EventEmitter();
    emitChange = createEmitChange(fileWatcher, p('/root'), path.sep);
    deltaCalculator = new DeltaCalculator(
      new Set([p('/root/index.js')]),
      fileWatcher,
      options,
    );
    await getDelta();
  });

  afterEach(() => {
    deltaCalculator.end();
  });

  test('re-transforms a module when a file it declares changes', async () => {
    files.set(p('/root/tailwind.config.js'), 'config2');
    emitChange({modifiedFiles: ['tailwind.config.js']});

    expect(await getDelta()).toEqual({
      modified: [p('/root/styles.css')],
      transformed: [p('/root/styles.css')],
    });
    expect(stylesCode()).toBe('.a {} app1 config2');
  });

  test.each([
    ['added', {addedFiles: ['src/nested/Button.js']}],
    ['modified', {modifiedFiles: ['src/App.js']}],
    ['removed', {removedFiles: ['src/App.js']}],
  ])(
    're-transforms a module when a file in a directory it declares is %s',
    async (_, change) => {
      if (change.addedFiles) {
        files.set(p('/root/src/nested/Button.js'), 'button');
      } else if (change.removedFiles) {
        files.delete(p('/root/src/App.js'));
      } else {
        files.set(p('/root/src/App.js'), 'app2');
      }
      emitChange(change);

      expect(await getDelta()).toEqual({
        modified: [p('/root/styles.css')],
        transformed: [p('/root/styles.css')],
      });
    },
  );

  test('ignores files the directory filter excludes', async () => {
    files.set(p('/root/src/notes.txt'), 'notes2');
    emitChange({modifiedFiles: ['src/notes.txt']});

    expect(await getDelta()).toEqual({modified: [], transformed: []});
  });

  test('stops watching inputs that a later transform no longer declares', async () => {
    declaredInputs = null;
    files.set(p('/root/styles.css'), '.b {}');
    emitChange({modifiedFiles: ['styles.css']});
    expect(await getDelta()).toEqual({
      modified: [p('/root/styles.css')],
      transformed: [p('/root/styles.css')],
    });

    files.set(p('/root/tailwind.config.js'), 'config2');
    emitChange({modifiedFiles: ['tailwind.config.js']});
    expect(await getDelta()).toEqual({modified: [], transformed: []});
  });

  test('stops watching inputs of a module that leaves the graph', async () => {
    files.set(p('/root/index.js'), '');
    emitChange({modifiedFiles: ['index.js']});
    await getDelta();
    expect(stylesCode()).toBeUndefined();

    files.set(p('/root/tailwind.config.js'), 'config2');
    emitChange({modifiedFiles: ['tailwind.config.js']});
    expect(await getDelta()).toEqual({modified: [], transformed: []});
  });

  test('re-transforms the module after a failed build', async () => {
    failingPaths.add(p('/root/styles.css'));
    files.set(p('/root/tailwind.config.js'), 'config2');
    emitChange({modifiedFiles: ['tailwind.config.js']});
    await expect(getDelta()).rejects.toThrow('Transform failed');
    expect(stylesCode()).toBe('.a {} app1 config1');

    failingPaths.clear();
    expect(await getDelta()).toEqual({
      modified: [p('/root/styles.css')],
      transformed: [p('/root/styles.css')],
    });
    expect(stylesCode()).toBe('.a {} app1 config2');
  });

  test('keeps watching the inputs of a module restored by a failed build', async () => {
    // The build drops `styles.css` from the graph and then fails, so the graph
    // restores it from the snapshot it took when releasing it.
    files.set(p('/root/index.js'), 'require broken.js');
    files.set(p('/root/broken.js'), '');
    failingPaths.add(p('/root/broken.js'));
    emitChange({modifiedFiles: ['index.js'], addedFiles: ['broken.js']});
    await expect(getDelta()).rejects.toThrow('Transform failed');
    expect(transformedPaths).not.toContain(p('/root/styles.css'));
    expect(stylesCode()).toBe('.a {} app1 config1');

    // Undo the edit that broke the build.
    files.set(p('/root/index.js'), 'require styles.css');
    files.delete(p('/root/broken.js'));
    failingPaths.clear();
    emitChange({modifiedFiles: ['index.js'], removedFiles: ['broken.js']});
    await getDelta();

    files.set(p('/root/tailwind.config.js'), 'config2');
    emitChange({modifiedFiles: ['tailwind.config.js']});
    expect(await getDelta()).toEqual({
      modified: [p('/root/styles.css')],
      transformed: [p('/root/styles.css')],
    });
    expect(stylesCode()).toBe('.a {} app1 config2');
  });
});
