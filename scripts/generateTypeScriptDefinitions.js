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
import fs from 'node:fs';
import path from 'node:path';
import nullthrows from 'nullthrows';
import * as prettier from 'prettier';
// $FlowFixMe[untyped-import] in OSS only
import SignedSource from 'signedsource';

const WORKSPACE_ROOT = path.resolve(__dirname, '..');

const TYPES_DIR = 'types';
const SRC_DIR = 'src';

type LintMessage = {
  readonly ruleId: ?string,
  readonly message: string,
  readonly line: number,
  ...
};

export const AUTO_GENERATED_PATTERNS: ReadonlyArray<string> = ['packages/**'];

// Globs of paths for which we do not generate TypeScript definitions,
// matched during glob traversal. A directory match ignores all contents.
const IGNORED_PATTERNS = [
  '**/__tests__',
  '**/__flowtests__',
  '**/__mocks__',
  '**/__fixtures__',
  '**/node_modules',
  'packages/metro-babel-register',
  'packages/*/build',
  'packages/metro/src/cli.js',
  'packages/**/third-party',
  'packages/metro/src/integration_tests',
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
          fs
            .globSync(pattern, {
              exclude: dirent =>
                IGNORED_PATTERNS.some(ignorePattern =>
                  path.matchesGlob(
                    path.relative(
                      WORKSPACE_ROOT,
                      path.resolve(dirent.parentPath, dirent.name.toString()),
                    ),
                    ignorePattern,
                  ),
                ),
              cwd: WORKSPACE_ROOT,
              withFileTypes: true as true,
            })
            .filter(dirent => dirent.isFile())
            .map(dirent =>
              path.relative(
                WORKSPACE_ROOT,
                path.resolve(dirent.parentPath, dirent.name.toString()),
              ),
            ),
        )
        .reduce((toProcess, filePath) => {
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
    let [lintResult] = await linter.lintText(sourceContent, {
      filePath: absoluteTsFile,
    });
    let lintedOutput = lintResult.output ?? sourceContent;

    const withoutUnusedGeneratedDeclarations =
      removeUnusedGeneratedDeclarations(lintedOutput, lintResult.messages);

    if (withoutUnusedGeneratedDeclarations !== lintedOutput) {
      [lintResult] = await linter.lintText(withoutUnusedGeneratedDeclarations, {
        filePath: absoluteTsFile,
      });
      lintedOutput = lintResult.output ?? withoutUnusedGeneratedDeclarations;
    }

    if (lintResult.messages.length > 0) {
      console.warn(sourceFile, lintResult.messages);
    }

    const formattedOutput = await prettier.format(lintedOutput, prettierConfig);

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
          errors.push({
            sourceFile,
            error: new Error('.d.ts file is out of sync'),
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
        const flowDef = await translateFlowToFlowDef(source);
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

function removeUnusedGeneratedDeclarations(
  sourceContent: string,
  messages: ReadonlyArray<LintMessage>,
): string {
  const lines = sourceContent.split('\n');

  for (const message of messages) {
    if (message.ruleId !== '@typescript-eslint/no-unused-vars') {
      continue;
    }

    const name = message.message.match(
      /^'([^']+)' is defined but never used/,
    )?.[1];
    if (name == null || message.line == null) {
      continue;
    }

    const lineIndex = message.line - 1;

    if (
      removeSingleBindingImportAtLine(lines, lineIndex, name) ||
      removeDeclareConstAtLine(lines, lineIndex, name)
    ) {
      continue;
    }
  }

  return lines.join('\n');
}

function removeSingleBindingImportAtLine(
  lines: Array<string>,
  lineIndex: number,
  name: string,
): boolean {
  const start = findBlockStart(lines, lineIndex, line =>
    /^\s*import\s/.test(line),
  );
  if (start == null) {
    return false;
  }

  const end = findBlockEnd(lines, start);
  if (end == null) {
    return false;
  }

  const statement = lines.slice(start, end + 1).join('\n');
  if (!isSingleBindingImport(statement, name)) {
    return false;
  }

  lines.splice(start, end - start + 1);
  return true;
}

function removeDeclareConstAtLine(
  lines: Array<string>,
  lineIndex: number,
  name: string,
): boolean {
  const declarationPattern = new RegExp(
    `^\\s*declare const ${escapeRegExp(name)}\\b`,
  );
  const start = findBlockStart(lines, lineIndex, line =>
    declarationPattern.test(line),
  );
  if (start == null) {
    return false;
  }

  const end = findBlockEnd(lines, start);
  if (end == null) {
    return false;
  }

  lines.splice(start, end - start + 1);
  return true;
}

function findBlockStart(
  lines: ReadonlyArray<string>,
  lineIndex: number,
  predicate: string => boolean,
): ?number {
  for (let i = lineIndex; i >= 0; i--) {
    if (predicate(lines[i])) {
      return i;
    }
  }
  return null;
}

function findBlockEnd(lines: ReadonlyArray<string>, start: number): ?number {
  for (let i = start; i < lines.length; i++) {
    if (/;\s*$/.test(lines[i])) {
      return i;
    }
  }
  return null;
}

function isSingleBindingImport(statement: string, name: string): boolean {
  const escapedName = escapeRegExp(name);
  const compact = statement.replace(/\s+/g, ' ').trim();
  return (
    new RegExp(`^import ${escapedName} from `).test(compact) ||
    new RegExp(`^import \\* as ${escapedName} from `).test(compact) ||
    new RegExp(`^import \\{ ${escapedName} \\} from `).test(compact) ||
    new RegExp(`^import \\{${escapedName}\\} from `).test(compact)
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
    printWidth: 200,
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
