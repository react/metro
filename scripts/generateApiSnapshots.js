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

import {
  AUTO_GENERATED_PATTERNS,
  type Logger,
  generateTsDefsForJsGlobs,
} from './generateTypeScriptDefinitions';
import {
  CompilerState,
  Extractor,
  ExtractorConfig,
} from '@microsoft/api-extractor';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as prettier from 'prettier';

const WORKSPACE_ROOT = path.resolve(__dirname, '..');
const PACKAGES_DIR = path.join(WORKSPACE_ROOT, 'packages');

// Extraction-only tsconfig (adds the "dom" lib on top of the project config).
const TSCONFIG_PATH = path.join(WORKSPACE_ROOT, 'tsconfig.api-extractor.json');

// Committed public API snapshot file, written at each package's root. One
// report is generated per public entry point.
const SNAPSHOT_FILENAME = 'API.md';

// package.json exports subpaths that never describe a public, type-generated
// entry point and are therefore excluded from snapshotting.
const NON_API_EXPORT_KEYS = new Set(['./package.json']);

// A package.json "exports" target: a module path, or a conditional map of
// them. Read straight from JSON, so the shape is only as trustworthy as the
// manifest — every consumer below re-checks it.
type ExportsTarget =
  string | {readonly [condition: string]: ExportsTarget} | null;

type PackageJson = Readonly<{
  name: string,
  exports?: ExportsTarget,
  ...
}>;

// One public entry point of one package: the `.d.ts` API Extractor reads, and
// where its report ends up.
type EntryPoint = Readonly<{
  packageName: string,
  packageDir: string,
  packageJsonPath: string,
  outputFileName: string,
  tempReportFileName: string,
  dtsPath: string,
  exportKey: string,
}>;

function readPackageJson(absolutePath: string): PackageJson {
  return JSON.parse(fs.readFileSync(absolutePath, 'utf-8'));
}

function unscopedName(packageName: string): string {
  return packageName.replace(/^@[^/]+\//, '');
}

// Resolve the exports target for a subpath to a single module path string,
// unwrapping conditional exports (picking a plain "." / "default" / first).
function resolveExportTarget(value: ExportsTarget): ?string {
  if (typeof value === 'string') {
    return value;
  }
  if (value == null) {
    return null;
  }
  const resolved =
    value.import ?? value.default ?? value.require ?? Object.values(value)[0];
  return typeof resolved === 'string' ? resolved : null;
}

// Whether a `.d.ts` declares any exports. API Extractor treats a declaration
// file with no exports as a non-module and errors out, so such entry points
// (e.g. CLI-only packages) are skipped rather than snapshotted.
function hasExports(dtsAbsolutePath: string): boolean {
  const source = fs.readFileSync(dtsAbsolutePath, 'utf-8');
  return /^\s*export[\s{*=]/m.test(source);
}

const EXPORT_EQUALS = /^export = ([^;\n]+);$/m;

// API Extractor ignores `export =` (it skips `ts.InternalSymbolName.ExportEquals`
// when collecting a module's exports), so a CommonJS entry point's report would
// be empty. For extraction only, point the entry point at a sibling copy of its
// `.d.ts` that uses `export default` instead - the published `.d.ts` keeps
// `export =`. The copy sits beside the original so that relative imports still
// resolve, and the caller deletes it once extraction is done.
//
// A report only includes exported declarations, and in an `export =` module
// every type is local - so the copy also exports its top-level declarations,
// which (as flow-api-translator emits only what the exports reference) are the
// types that make up the exported value's API.
//
// Once the entry point's declarations are analysed, API Extractor also throws
// ("Unable to analyze the export \"default\"") on any default import of
// another `export =` module, so the copy imports those with `import x =
// require()`, which it reports as an import rather than following.
function withExtractableExports(
  entryPoint: EntryPoint,
  createdFiles: Array<string>,
): EntryPoint {
  const source = fs.readFileSync(entryPoint.dtsPath, 'utf-8');
  const exportEquals = EXPORT_EQUALS.exec(source);
  if (exportEquals == null) {
    return entryPoint;
  }
  const exportedName = exportEquals[1];
  const dtsPath = entryPoint.dtsPath.replace(
    /\.d\.ts$/,
    `.api-extractor-${process.pid}.d.ts`,
  );
  const extractable = source
    .replace(EXPORT_EQUALS, 'export default $1;')
    .replace(
      /^(?:declare )?(?:type|interface|class|function|const|enum|namespace) (\w+)/gm,
      (declaration, name: string) =>
        name === exportedName ? declaration : 'export ' + declaration,
    )
    .replace(
      /^import (type )?(\w+) from '(\.[^']+)';$/gm,
      (statement, typeOnly: ?string, name: string, specifier: string) => {
        const importedDts =
          path.resolve(path.dirname(entryPoint.dtsPath), specifier) + '.d.ts';
        return fs.existsSync(importedDts) &&
          EXPORT_EQUALS.test(fs.readFileSync(importedDts, 'utf-8'))
          ? `import ${typeOnly ?? ''}${name} = require('${specifier}');`
          : statement;
      },
    );
  fs.writeFileSync(dtsPath, extractable);
  createdFiles.push(dtsPath);
  return {...entryPoint, dtsPath};
}

// Map a `./src/<rel>.js` exports target to its generated `types/<rel>.d.ts`.
function sourceTargetToDts(packageDir: string, target: string): ?string {
  const match = /^\.\/src\/(.+)\.js$/.exec(target);
  if (match == null) {
    return null;
  }
  return path.join(packageDir, 'types', match[1] + '.d.ts');
}

// Committed snapshot file name for an entry point, written at the package
// root. The main entry is `API.md`; secondary subpaths are suffixed, e.g.
// `API-<subpath>.md`.
function outputFileNameFor(exportKey: string): string {
  if (exportKey === '.') {
    return SNAPSHOT_FILENAME;
  }
  const suffix = exportKey.replace(/^\.\//, '').replace(/\//g, '-');
  return `API-${suffix}.md`;
}

// Unique scratch report name handed to API Extractor, derived from the package
// name and exports subpath so all reports can share a single temp folder.
function tempReportFileNameFor(packageName: string, exportKey: string): string {
  const base = unscopedName(packageName);
  if (exportKey === '.') {
    return `${base}.api.md`;
  }
  const suffix = exportKey.replace(/^\.\//, '').replace(/\//g, '-');
  return `${base}-${suffix}.api.md`;
}

// Collect the public entry points for a package from its `exports` field.
// Wildcard, `./package.json`, and non-`./src/*.js` targets are excluded, as
// are entry points whose `.d.ts` has not been generated (e.g. runtime-only
// modules) — those are returned separately as `skipped`.
function collectEntryPoints(
  packageDir: string,
  packageJsonPath: string,
  packageJson: PackageJson,
): {entryPoints: Array<EntryPoint>, skipped: Array<string>} {
  const packageName = String(packageJson.name);
  const exportsField = packageJson.exports;
  const entryPoints: Array<EntryPoint> = [];
  const skipped: Array<string> = [];

  if (
    exportsField == null ||
    (typeof exportsField !== 'string' && typeof exportsField !== 'object')
  ) {
    return {entryPoints, skipped};
  }

  const entries =
    typeof exportsField === 'string'
      ? [['.', exportsField]]
      : Object.entries(exportsField);

  for (const [exportKey, rawValue] of entries) {
    if (NON_API_EXPORT_KEYS.has(exportKey) || exportKey.includes('*')) {
      continue;
    }
    const target = resolveExportTarget(rawValue);
    if (target == null) {
      continue;
    }
    const dtsPath = sourceTargetToDts(packageDir, target);
    if (dtsPath == null) {
      // A public entry point whose target isn't a `./src/<rel>.js` module (e.g.
      // `./src/foo.mjs`, `./lib/foo.js`, or a bare specifier), so we can't map
      // it to a generated `.d.ts`. Record it so misconfigured exports surface
      // in the summary rather than being silently dropped.
      skipped.push(
        `${packageName} "${exportKey}" (unsupported exports target "${target}")`,
      );
      continue;
    }
    if (!fs.existsSync(dtsPath)) {
      // A public entry point without generated types (e.g. metro-runtime's
      // runtime-only modules). Record it so the summary can surface it.
      skipped.push(
        `${packageName} "${exportKey}" (no ${path.relative(WORKSPACE_ROOT, dtsPath)})`,
      );
      continue;
    }
    if (!hasExports(dtsPath)) {
      // A public entry point with no exported API surface (e.g. a CLI-only
      // package). There is nothing to snapshot.
      skipped.push(`${packageName} "${exportKey}" (no exported API surface)`);
      continue;
    }
    entryPoints.push({
      packageName,
      packageDir,
      packageJsonPath,
      outputFileName: outputFileNameFor(exportKey),
      tempReportFileName: tempReportFileNameFor(packageName, exportKey),
      dtsPath,
      exportKey,
    });
  }

  return {entryPoints, skipped};
}

// Post-process an API Extractor report into a committed snapshot. API Extractor
// tags every export with a release tag and flags the absence of TSDoc, but
// Metro's public surface is documented by its Flow types rather than TSDoc, so
// those annotations are pure noise. There is no config option to suppress them
// (they are hardcoded in API Extractor's ApiReportGenerator), so we strip them
// here: `(undocumented)` markers, the release-tag comment lines (`// @public`
// etc.), and the missing-`@packageDocumentation` notice, then collapse the
// blank lines left behind.
//
// We also blank out the line numbers in any flow-api-translator code frame, so
// that moving an offending declaration within its source file doesn't churn the
// snapshot.
function cleanReport(report: string): string {
  const result = [];
  for (const raw of report.split('\n')) {
    const rawTrimmed = raw.trim();
    // Drop standalone `(undocumented)` markers and the missing-packageDoc
    // notice entirely. (Checked before the inline strip below, which would
    // otherwise reduce `// (undocumented)` to a bare `//`.)
    if (
      rawTrimmed === '// (undocumented)' ||
      rawTrimmed === '// (No @packageDocumentation comment for this package)'
    ) {
      continue;
    }

    // Normalize inline `(undocumented)` suffixes (e.g. `// @public
    // (undocumented)` becomes `// @public`).
    let line = raw.replace(/ \(undocumented\)/g, '');

    // Strip the release-tag token from AEDoc comment lines, preserving any
    // other modifiers (e.g. `// @public @deprecated` becomes `// @deprecated`).
    const tagMatch = line.match(
      /^(\s*)\/\/ @(?:public|beta|alpha|internal)\b ?(.*)$/,
    );
    if (tagMatch != null) {
      const rest = tagMatch[2].trim();
      if (rest === '') {
        // Nothing but the release tag — drop the whole comment line.
        continue;
      }
      line = `${tagMatch[1]}// ${rest}`;
    }

    // flow-api-translator embeds a Babel code frame in the comment it emits for
    // constructs it cannot translate (e.g. Flow's `empty`). Its gutter carries
    // the line number in the *Flow source*, so any edit above that line — an
    // internal-only change with no effect on the public API — would otherwise
    // show up here. Blank the digits rather than removing them: the caret line
    // beneath is padded to the same gutter width, so keeping the width keeps it
    // aligned.
    line = line.replace(
      /^(\s*\*\s*>\s*)(\d+)(\s*\|)/,
      (_, before, digits, after) => before + ' '.repeat(digits.length) + after,
    );

    // Collapse runs of blank lines left by the removals above.
    if (line.trim() === '' && result[result.length - 1]?.trim() === '') {
      continue;
    }
    result.push(line);
  }
  return result.join('\n');
}

// Reformat the TypeScript code block of a cleaned report with Prettier. API
// Extractor strips the leading whitespace from every line of a declaration and
// re-indents only between `{` and `}`, so any declaration Prettier wrapped in
// the source `.d.ts` (parameter lists, type arguments) otherwise loses its
// indentation. The options match the `.d.ts` generator's, so declarations wrap
// as they do in the published definitions.
//
// Returns null for a report with no declarations.
async function formatReport(report: string): Promise<?string> {
  const match = report.match(/^([\s\S]*?```ts\n)([\s\S]*)(```\n?)$/);
  if (match == null) {
    throw new Error('Could not find the TypeScript code block in the report');
  }
  const [, header, code, footer] = match;
  const filepath = path.join(__dirname, 'dummy.d.ts');
  const formatted = await prettier.format(code, {
    ...(await prettier.resolveConfig(filepath)),
    filepath,
    printWidth: 200,
    requirePragma: false,
  });
  if (formatted.trim() === '') {
    return null;
  }
  // Keep the blank lines API Extractor leaves inside the fences.
  return header + '\n' + formatted + '\n' + footer;
}

// Build the API Extractor config for one entry point. The report is written to
// a scratch folder; the caller owns writing it to its committed location so we
// control the file name, path, and post-processing.
function prepareExtractorConfig(
  entryPoint: EntryPoint,
  tempFolder: string,
): ExtractorConfig {
  return ExtractorConfig.prepare({
    configObject: {
      projectFolder: entryPoint.packageDir,
      mainEntryPointFilePath: entryPoint.dtsPath,
      // Emit unix line endings to match repo conventions.
      newlineKind: 'lf',
      compiler: {tsconfigFilePath: TSCONFIG_PATH},
      apiReport: {
        enabled: true,
        reportFolder: tempFolder,
        reportFileName: entryPoint.tempReportFileName,
        reportTempFolder: tempFolder,
      },
      docModel: {enabled: false},
      dtsRollup: {enabled: false},
      tsdocMetadata: {enabled: false},
      // Keep snapshots focused on the API surface, not on lint-style advice.
      messages: {
        extractorMessageReporting: {
          default: {logLevel: 'none', addToApiReportFile: false},
        },
        compilerMessageReporting: {default: {logLevel: 'none'}},
        tsdocMessageReporting: {default: {logLevel: 'none'}},
      },
    },
    configObjectFullPath: path.join(
      entryPoint.packageDir,
      'api-extractor.json',
    ),
    packageJsonFullPath: entryPoint.packageJsonPath,
  });
}

// Run API Extractor for a single entry point against an already-built program,
// and return its report text.
function runExtractor(
  entryPoint: EntryPoint,
  extractorConfig: ExtractorConfig,
  compilerState: CompilerState,
  tempFolder: string,
): {succeeded: boolean, report: string} {
  // Always write to the scratch folder (localBuild); the caller diffs/commits
  // the result itself.
  const result = Extractor.invoke(extractorConfig, {
    compilerState,
    localBuild: true,
    showVerboseMessages: false,
    showDiagnostics: false,
    // Silence API Extractor's per-invocation preamble, which is emitted once
    // per entry point and says only which TypeScript version it bundles and
    // that ours is newer. These are category 'console', which the `messages`
    // config above cannot route (there is no `consoleMessageReporting`
    // table), so they have to be discarded here. Suppress these two ids
    // specifically rather than the whole category, which also carries
    // genuine errors such as `console-api-report-folder-missing`.
    messageCallback: message => {
      if (
        message.messageId === 'console-preamble' ||
        message.messageId === 'console-compiler-version-notice'
      ) {
        message.logLevel = 'none';
      }
    },
  });

  const report = fs.readFileSync(
    path.join(tempFolder, entryPoint.tempReportFileName),
    'utf-8',
  );

  return {succeeded: result.succeeded, report};
}

export async function generateApiSnapshots(
  opts?: Readonly<{
    verifyOnly?: boolean,
    logger?: Logger,
  }>,
): Promise<void> {
  const {verifyOnly = false, logger} = opts ?? {};

  // The `.d.ts` files that feed API Extractor are build artifacts and are not
  // checked in. Regenerate them from the current Flow sources (always in write
  // mode, even when only verifying snapshots) so the extracted API reflects the
  // working tree. This is what lets a private-API change require no committed
  // output while a public-API change surfaces as a snapshot diff.
  await generateTsDefsForJsGlobs(AUTO_GENERATED_PATTERNS, {
    verifyOnly: false,
    logger,
    // Underscore props are private APIs by Flow convention, so we don't want
    // them in public API.md snapshots as they're not semver guaranteed. We
    // do include them in .d.ts, as we document private APIs that way.
    mungeUnderscores: true,
  });

  const errors: Array<{context: string, error: Error}> = [];
  const allSkipped: Array<string> = [];
  let generatedCount = 0;

  const tempFolder = fs.mkdtempSync(
    path.join(os.tmpdir(), 'metro-api-snapshots-'),
  );
  const extractorInputFiles: Array<string> = [];

  try {
    const packageDirs = fs
      .readdirSync(PACKAGES_DIR)
      .map(name => path.join(PACKAGES_DIR, name))
      .filter(dir => fs.lstatSync(dir).isDirectory());

    // Collect every public entry point before extracting anything: the shared
    // program below has to be told about all of them up front.
    const packages: Array<{
      packageDir: string,
      entryPoints: Array<EntryPoint>,
    }> = [];
    for (const packageDir of packageDirs) {
      const packageJsonPath = path.join(packageDir, 'package.json');
      if (!fs.existsSync(packageJsonPath)) {
        continue;
      }
      const {entryPoints, skipped} = collectEntryPoints(
        packageDir,
        packageJsonPath,
        readPackageJson(packageJsonPath),
      );
      allSkipped.push(...skipped);
      if (entryPoints.length > 0) {
        packages.push({
          packageDir,
          entryPoints: entryPoints.map(entryPoint =>
            withExtractableExports(entryPoint, extractorInputFiles),
          ),
        });
      }
    }

    const allEntryPoints = packages.flatMap(({entryPoints}) => entryPoints);

    if (allEntryPoints.length > 0) {
      // Extraction is CPU-bound and synchronous, but the cost is dominated by
      // building the TypeScript program, not by extracting from it: every
      // entry point's program has the same compiler options and the same root
      // set (`include` in the extraction tsconfig, plus the entry point), and
      // parses the whole `lib` and every `@types` package. `CompilerState`
      // exists to be shared across `Extractor.invoke` calls, so we build one
      // program covering every entry point and reuse it. That is cheaper in
      // total than building one program per package, even spread across
      // threads — so this all runs on the main thread, in package order.
      //
      // Which config the program is built from is immaterial (only its
      // compiler settings are read), but every entry point has to be in the
      // program's root set, hence `additionalEntryPoints`.
      const programStartTime = performance.now();
      const compilerState = CompilerState.create(
        prepareExtractorConfig(allEntryPoints[0], tempFolder),
        {additionalEntryPoints: allEntryPoints.map(({dtsPath}) => dtsPath)},
      );
      logger?.log?.(
        `  TypeScript program covering ${allEntryPoints.length} entry ` +
          `point(s) built in ${((performance.now() - programStartTime) / 1000).toFixed(1)}s`,
      );

      const verb = verifyOnly ? 'verified' : 'generated';
      for (const {packageDir, entryPoints} of packages) {
        const startTime = performance.now();
        let packageGeneratedCount = 0;

        for (const entryPoint of entryPoints) {
          const context = `${entryPoint.packageName} (${entryPoint.exportKey})`;
          try {
            const {succeeded, report} = runExtractor(
              entryPoint,
              prepareExtractorConfig(entryPoint, tempFolder),
              compilerState,
              tempFolder,
            );
            if (!succeeded) {
              errors.push({
                context,
                error: new Error('API Extractor reported errors'),
              });
              continue;
            }

            const snapshot = await formatReport(cleanReport(report));
            const outputPath = path.join(
              entryPoint.packageDir,
              entryPoint.outputFileName,
            );

            if (snapshot == null) {
              // Nothing to snapshot. Make sure no stale snapshot is left behind.
              allSkipped.push(
                `${entryPoint.packageName} "${entryPoint.exportKey}" (no exported API surface)`,
              );
              if (!fs.existsSync(outputPath)) {
                continue;
              }
              if (verifyOnly) {
                errors.push({
                  context,
                  error: new Error(
                    `Public API snapshot ${entryPoint.outputFileName} has no ` +
                      'exported API surface and should be deleted. Run ' +
                      '`js1 build metro-ts-defs` (internal) or ' +
                      '`yarn run build-api-snapshots` (OSS) to update it.',
                  ),
                });
              } else {
                fs.rmSync(outputPath);
              }
              continue;
            }

            if (verifyOnly) {
              let existing = null;
              try {
                existing = fs.readFileSync(outputPath, 'utf-8');
              } catch {}
              if (existing !== snapshot) {
                errors.push({
                  context,
                  error: new Error(
                    `Public API snapshot ${entryPoint.outputFileName} is out ` +
                      'of date. Run `js1 build metro-ts-defs` (internal) or ' +
                      '`yarn run build-api-snapshots` (OSS) to update it.',
                  ),
                });
              }
              // Count every processed entry point so the summary reflects the
              // total number of snapshots verified, not just those already up
              // to date.
              packageGeneratedCount++;
            } else {
              fs.writeFileSync(outputPath, snapshot);
              packageGeneratedCount++;
            }
          } catch (error) {
            errors.push({context, error});
          }
        }

        generatedCount += packageGeneratedCount;
        // Now that the program is built once up front, this is the actual cost
        // of extracting the package, rather than a per-package program build.
        if (logger && packageGeneratedCount > 0) {
          logger.log?.(
            `  ${path.basename(packageDir)}: ${packageGeneratedCount} ` +
              `snapshot(s) ${verb} in ${((performance.now() - startTime) / 1000).toFixed(1)}s`,
          );
        }
      }
    }
  } finally {
    fs.rmSync(tempFolder, {recursive: true, force: true});
    for (const filePath of extractorInputFiles) {
      fs.rmSync(filePath, {force: true});
    }
  }

  if (logger && allSkipped.length > 0) {
    logger.warn(
      'Skipped public entry points without generated TypeScript ' +
        `definitions:\n  ${allSkipped.join('\n  ')}`,
    );
  }

  const verb = verifyOnly ? 'Verified' : 'Generated';
  logger?.log(
    `${verb} ${generatedCount} public API snapshot(s) across Metro's OSS ` +
      'packages.',
  );

  if (errors.length > 0) {
    errors.sort((a, b) => a.context.localeCompare(b.context));
    throw new AggregateError(
      errors.map(({context, error}) => {
        error.message = `${context}: ${error.message}`;
        return error;
      }),
      'Errors encountered while generating public API snapshots',
    );
  }
}

// When run as a script, generate (or, with --verify, verify) all snapshots.
if (require.main === module) {
  const verifyOnly = process.argv.includes('--verify');
  // $FlowFixMe[incompatible-type]
  generateApiSnapshots({verifyOnly, logger: console}).catch(error => {
    process.exitCode = 1;
    console.error(error);
  });
}
