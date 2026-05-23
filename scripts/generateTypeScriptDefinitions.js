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

// $FlowFixMe[untyped-import] in OSS only
import {ESLint} from 'eslint';
import {
  translateFlowDefToTSDef,
  translateFlowToFlowDef,
} from 'flow-api-translator';
import fs from 'fs';
import nullthrows from 'nullthrows';
import path from 'path';
import * as prettier from 'prettier';
// $FlowFixMe[untyped-import] in OSS only
import SignedSource from 'signedsource';
// $FlowFixMe[untyped-import] in OSS only
import {globSync} from 'tinyglobby';

const WORKSPACE_ROOT = path.resolve(__dirname, '..');

/**
 * Produce a unified-diff-style string comparing two texts, using a basic
 * LCS (longest common subsequence) algorithm. No external dependencies.
 */
function createLineDiff(
  oldText: string,
  newText: string,
  label: string,
): string {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const m = oldLines.length;
  const n = newLines.length;

  // Build DP table for LCS length
  const dp: Array<Array<number>> = Array.from({length: m + 1}, () =>
    new Array<number>(n + 1).fill(0),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        oldLines[i - 1] === newLines[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack to produce a list of diff operations
  const ops: Array<{type: ' ' | '-' | '+', line: string}> = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      ops.push({type: ' ', line: oldLines[i - 1]});
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.push({type: '+', line: newLines[j - 1]});
      j--;
    } else {
      ops.push({type: '-', line: oldLines[i - 1]});
      i--;
    }
  }
  ops.reverse();

  // Format as unified diff with context lines around each hunk
  const CONTEXT = 3;
  const changeIndices: Array<number> = [];
  for (let k = 0; k < ops.length; k++) {
    if (ops[k].type !== ' ') {
      changeIndices.push(k);
    }
  }
  if (changeIndices.length === 0) {
    return '';
  }

  // Group nearby changes into hunks
  const hunks: Array<{start: number, end: number}> = [];
  let hunkStart = changeIndices[0];
  let hunkEnd = changeIndices[0];
  for (let k = 1; k < changeIndices.length; k++) {
    if (changeIndices[k] - hunkEnd > CONTEXT * 2) {
      hunks.push({start: hunkStart, end: hunkEnd});
      hunkStart = changeIndices[k];
    }
    hunkEnd = changeIndices[k];
  }
  hunks.push({start: hunkStart, end: hunkEnd});

  const output = [`--- ${label} (on disk)`, `+++ ${label} (expected)`, ''];
  for (const hunk of hunks) {
    const from = Math.max(0, hunk.start - CONTEXT);
    const to = Math.min(ops.length - 1, hunk.end + CONTEXT);
    output.push('@@');
    for (let k = from; k <= to; k++) {
      output.push(`${ops[k].type} ${ops[k].line}`);
    }
  }

  return output.join('\n');
}

const TYPES_DIR = 'types';
const SRC_DIR = 'src';

export const AUTO_GENERATED_PATTERNS: ReadonlyArray<string> = ['packages/**'];

// Globs of paths for which we do not generate TypeScript definitions,
// matched against candidate .js files
const IGNORED_PATTERNS = [
  '**/__tests__/**',
  '**/__flowtests__/**',
  '**/__mocks__/**',
  '**/__fixtures__/**',
  '**/node_modules/**',
  'packages/metro-babel-register/**',
  'packages/*/build/**',
  'packages/metro/src/cli.js',
  'packages/**/third-party/**',
  'packages/metro/src/integration_tests/**',
  'packages/metro-runtime/**/!(types*).js',
];

function isSourceTSDeclaration(filePath: string): boolean {
  const parts = filePath.split(path.sep);
  return filePath.endsWith('.d.ts') && parts[2] === SRC_DIR;
}

function isExistingTSDeclaration(filePath: string): boolean {
  const parts = filePath.split(path.sep);
  return filePath.endsWith('.d.ts') && parts[2] === TYPES_DIR;
}

export async function generateTsDefsForJsGlobs(
  globPattern: string | ReadonlyArray<string>,
  opts: Readonly<{
    verifyOnly: boolean,
  }> = {verifyOnly: false},
) {
  const linter = new ESLint({
    fix: true,
    cwd: WORKSPACE_ROOT,
  });

  const prettierConfig = await resolvePrettierConfig();

  const globPatterns = Array.isArray(globPattern) ? globPattern : [globPattern];

  const existingDefs = new Set<string>();
  const sourceDefs = new Set<string>();
  const filesToProcess: Array<[jsFile: string, flowSourceFile: string]> =
    Array.from(
      globPatterns
        .flatMap(pattern =>
          globSync(pattern, {
            ignore: IGNORED_PATTERNS,
            cwd: WORKSPACE_ROOT,
          }),
        )
        .reduce((toProcess, posixFilePath) => {
          const filePath = path.normalize(posixFilePath);
          if (filePath.endsWith('.flow.js')) {
            // For .flow.js files, record the `.flow.js` as the source for the
            // corresponding `.js` file, which is enforced to be a transparent
            // entry file that only registers Babel and re-exports the module.
            toProcess.set(filePath.replace(/\.flow\.js$/, '.js'), filePath);
          } else if (filePath.endsWith('.js') && !toProcess.has(filePath)) {
            toProcess.set(filePath, filePath);
          } else if (isSourceTSDeclaration(filePath)) {
            sourceDefs.add(path.resolve(WORKSPACE_ROOT, filePath));
          } else if (isExistingTSDeclaration(filePath)) {
            existingDefs.add(path.resolve(WORKSPACE_ROOT, filePath));
          }
          return toProcess;
        }, new Map<string, string>())
        .entries(),
    );

  const errors = [];

  async function writeOutputFile(
    sourceContent: string,
    absoluteTsFile: string,
    sourceFile: string,
  ) {
    // Lint and fix the generated output
    const [lintResult] = await linter.lintText(sourceContent, {
      filePath: absoluteTsFile,
    });

    if (lintResult.messages.length > 0) {
      console.warn(sourceFile, lintResult.messages);
    }

    const formattedOutput = await prettier.format(
      lintResult.output ?? sourceContent,
      prettierConfig,
    );

    // Add signedsource (generated) token to the header
    const withToken = formattedOutput
      .replace(
        '\n */\n',
        `\n * ${SignedSource.getSigningToken()}\n *` +
          `\n * This file was translated from Flow by ${path.relative(WORKSPACE_ROOT, __filename).replaceAll(path.sep, '/')}` +
          `\n * Original file: ${sourceFile.replaceAll(path.sep, '/')}` +
          '\n * To regenerate, run:' +
          '\n *   js1 build metro-ts-defs (internal) OR' +
          '\n *   yarn run build-ts-defs (OSS) ' +
          '\n */\n',
      )
      // format -> noformat
      .replace(`\n * ${'@'}format\n`, `\n * ${'@'}noformat\n`);

    // Sign the file
    const finalOutput = SignedSource.signFile(withToken);

    existingDefs.delete(absoluteTsFile);

    if (opts.verifyOnly) {
      let existingFile = null;
      try {
        existingFile = await fs.promises.readFile(absoluteTsFile, 'utf-8');
        if (finalOutput !== existingFile) {
          const diff = createLineDiff(
            existingFile,
            finalOutput,
            path.relative(WORKSPACE_ROOT, absoluteTsFile),
          );
          errors.push({
            sourceFile,
            error: new Error('.d.ts file is out of sync\n' + diff),
          });
        }
      } catch {
        errors.push({sourceFile, error: new Error('.d.ts file missing')});
      }
    } else {
      await fs.promises.mkdir(path.dirname(absoluteTsFile), {
        recursive: true,
      });
      await fs.promises.writeFile(absoluteTsFile, finalOutput);
    }
  }

  await Promise.all(
    filesToProcess.map(async ([jsFile, sourceFile]) => {
      const absoluteTsFile = getTSDeclAbsolutePath(jsFile);
      const sourceTSDeclationPath = absoluteTsFile.replace(TYPES_DIR, SRC_DIR);
      const absoluteSourceFile = path.resolve(WORKSPACE_ROOT, sourceFile);

      // If a source .d.ts file exists, copy it directly.
      if (sourceDefs.has(sourceTSDeclationPath)) {
        const source = await fs.promises.readFile(
          sourceTSDeclationPath,
          'utf-8',
        );
        await writeOutputFile(source, absoluteTsFile, sourceFile);
        return;
      }

      const source = await fs.promises.readFile(absoluteSourceFile, 'utf-8');
      if (!source.includes('@flow')) {
        errors.push({
          sourceFile,
          error: new Error('Expected @flow directive'),
        });
        return;
      }
      try {
        const sourceWithPlatformNewlines =
          process.platform === 'win32'
            ? // flow-api-translator assumes CRLF line endings on Windows, whereas
              // Metro sets eol=lf in .gitattributes, so we need to convert to CRLF
              // before passing to flow-api-translator, and convert back later.
              source.replaceAll('\n', '\r\n')
            : source;
        const flowDef = await translateFlowToFlowDef(
          sourceWithPlatformNewlines,
        );
        if (flowDef.includes('declare module.exports')) {
          errors.push({
            sourceFile,
            error: new Error(
              'module.exports is not supported by TypeScript auto-generation',
            ),
          });
        } else {
          const tsDef = await translateFlowDefToTSDef(flowDef);

          const beforeLint = tsDef
            // Normalise line endings back to LF
            .replaceAll('\r\n', '\n')
            // Fix up gap left in license header by removal of atflow
            .replace('\n *\n *\n', '\n *\n')
            // TypeScript has no analogue for __proto__: null
            .replace(/__proto__: null[,;]?/g, '');

          await writeOutputFile(beforeLint, absoluteTsFile, sourceFile);
        }
      } catch (error) {
        errors.push({sourceFile, error});
      }
    }),
  );

  if (existingDefs.size > 0) {
    const orphanedDefs = Array.from(existingDefs);
    if (opts.verifyOnly) {
      orphanedDefs.forEach(sourceFile => {
        errors.push({
          error: new Error('.d.ts appears to be orphaned'),
          sourceFile,
        });
      });
    } else {
      // Delete .d.ts files under a generated location that were not generated.
      await Promise.all(
        orphanedDefs.map(sourceFile => fs.promises.unlink(sourceFile)),
      );
    }
  }
  if (errors.length > 0) {
    errors.sort((a, b) => a.sourceFile.localeCompare(b.sourceFile));
    throw new AggregateError(
      errors,
      'Errors encountered while generating TypeScript definitions',
    );
  }
}

function getTSDeclAbsolutePath(jsRelativePath: string) {
  const parts = jsRelativePath.split(path.sep);
  if (parts[2] !== 'src') {
    throw new Error(
      'Expected relative path of the form packages/<pkg>/src/...',
    );
  }
  parts[2] = TYPES_DIR;
  const basename = nullthrows(parts.pop());
  parts.push(basename.slice(0, -3) + '.d.ts');
  return path.resolve(WORKSPACE_ROOT, parts.join(path.sep));
}

async function resolvePrettierConfig() {
  const fakeTsDecl = path.resolve(__dirname, './dummy.d.ts');
  return {
    ...(await prettier.resolveConfig(fakeTsDecl)),
    filepath: fakeTsDecl,
  };
}

// When run as a script, execute pattern from argv
if (process.mainModule === module) {
  // Usage: node scripts/generateTypeScriptDefinitions.js [glob...]
  // Omit globs to use hardcoded defaults.
  generateTsDefsForJsGlobs(
    process.argv.length >= 3 ? process.argv.slice(2) : AUTO_GENERATED_PATTERNS,
  ).catch(error => {
    process.exitCode = 1;
    console.error(error);
  });
}
