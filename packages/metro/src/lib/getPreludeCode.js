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

export default function getPreludeCode({
  extraVars,
  isDev,
  globalPrefix,
  requireCycleIgnorePatterns,
  unstable_forceFullRefreshPatterns,
}: {
  readonly extraVars?: {[key: string]: unknown, ...},
  readonly isDev: boolean,
  readonly globalPrefix: string,
  readonly requireCycleIgnorePatterns: ReadonlyArray<RegExp>,
  readonly unstable_forceFullRefreshPatterns: ReadonlyArray<RegExp>,
}): string {
  const vars = [
    // Ensure these variable names match the ones referenced in metro-runtime
    // require.js
    '__BUNDLE_START_TIME__=globalThis.nativePerformanceNow?nativePerformanceNow():Date.now()',
    `__DEV__=${String(isDev)}`,
    ...formatExtraVars(extraVars),
    'process=globalThis.process||{}',
    `__METRO_GLOBAL_PREFIX__='${globalPrefix}'`,
  ];

  if (isDev) {
    // Ensure these variable names match the ones referenced in metro-runtime
    // require.js
    vars.push(
      `${globalPrefix}__requireCycleIgnorePatterns=[${requireCycleIgnorePatterns
        .map(regex => regex.toString())
        .join(',')}]`,
    );
    vars.push(
      `${globalPrefix}__unstable_forceFullRefreshPatterns=[${unstable_forceFullRefreshPatterns
        .map(regex => regex.toString())
        .join(',')}]`,
    );
  }

  return `var ${vars.join(',')};${processEnv(
    isDev ? 'development' : 'production',
  )}`;
}

const excluded = new Set(['__BUNDLE_START_TIME__', '__DEV__', 'process']);

function formatExtraVars(
  extraVars: ?{[key: string]: unknown, ...},
): Array<string> {
  const assignments = [];

  for (const key in extraVars) {
    if (extraVars.hasOwnProperty(key) && !excluded.has(key)) {
      /* $FlowFixMe[incompatible-type](>=0.95.0 site=react_native_fb) This comment suppresses an
       * error found when Flow v0.95 was deployed. To see the error, delete
       * this comment and run Flow. */
      assignments.push(`${key}=${JSON.stringify(extraVars[key])}`);
    }
  }

  return assignments;
}

function processEnv(nodeEnv: string): string {
  return `process.env=process.env||{};process.env.NODE_ENV=process.env.NODE_ENV||${JSON.stringify(
    nodeEnv,
  )};`;
}
