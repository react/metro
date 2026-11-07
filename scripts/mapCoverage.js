/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

/**
 * Because we have a build step, sometimes we can test files from both
 * `packages/metro-whatever/build/*` and `packages/metro-whatever/src/*`
 *
 * If we require file by its relative path like:
 *    // inside `metro-whatever/src/__tests__/index.js`
 *    require('../index.js'); // this will require `metro-whatever/src/index.js`
 *
 * But if we require it by a package name, this will go through node_modules
 * and lerna index.js link. So the actual file will be required from `build/`
 *    // inside another packages
 *    // this will go through lerna and require `metro-whatever/build/index.js
 *    require('metro-whatever')
 *
 * these files are identical (one is preprocessed, another is transformed on
 * the fly), but the coverage paths are different.
 * This script will map coverage results from both locations to one and
 * produce a full coverage report.
 */

'use strict';

const coverage = require('../coverage/coverage-final.json');
const istanbulCoverage = require('istanbul-lib-coverage');
const istanbulReport = require('istanbul-lib-report');
const istanbulReports = require('istanbul-reports');

const map = istanbulCoverage.createCoverageMap();

const mapFileCoverage = fileCoverage => {
  fileCoverage.path = fileCoverage.path.replace(
    /(.*packages\/.*\/)(build)(\/.*)/,
    '$1src$3',
  );
  return fileCoverage;
};

Object.keys(coverage).forEach(filename =>
  map.addFileCoverage(mapFileCoverage(coverage[filename])),
);

const context = istanbulReport.createContext({coverageMap: map});
for (const reportName of ['json', 'lcov', 'text']) {
  istanbulReports.create(reportName).execute(context);
}
