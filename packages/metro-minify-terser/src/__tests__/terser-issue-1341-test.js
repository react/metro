/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

import type {MinifierOptions} from 'metro-transform-worker';

import minify from '../minifier';

const config = {
  mangle: {
    toplevel: false,
  },
  output: {
    ascii_only: true,
    quote_style: 3,
    wrap_iife: true,
  },
  sourceMap: {
    includeSources: false,
  },
  toplevel: false,
  compress: {
    reduce_funcs: false,
  },
};

const BAR: MinifierOptions = {
  filename: '',
  code: '__d(function(global,_$$_REQUIRE,_$$_IMPORT_DEFAULT,_$$_IMPORT_ALL,module,exports,_$$_METRO_DEPENDENCY_MAP){"use strict";function bar(){return new Promise(function(resolve){return resolve(_$$_REQUIRE(_$$_METRO_DEPENDENCY_MAP[0]));}).then(function onGlo(glo){makeItThrow(glo);});}function makeItThrow(glo){makeItThrowInner(glo);}function makeItThrowInner(glo){glo.throwSmth();}module.exports=bar;});',
  map: {
    version: 3,
    sources: ['js/RKJSModules/bar.js'],
    sourcesContent: [
      "'use strict';\n\nfunction bar() {\n  return new Promise(resolve => resolve(require('./segmented/glo.js'))).then(function onGlo(glo) {\n    makeItThrow(glo);\n  });\n}\n\nfunction makeItThrow(glo) {\n  makeItThrowInner(glo);\n}\n\nfunction makeItThrowInner(glo) {\n  glo.throwSmth();\n}\n\nmodule.exports = bar;\n",
    ],
    names: [
      'bar',
      'Promise',
      'resolve',
      'require',
      'then',
      'onGlo',
      'glo',
      'makeItThrow',
      'makeItThrowInner',
      'throwSmth',
      'module',
      'exports',
    ],
    mappings:
      '2GAAA,YAAY,CAEZ,QAASA,IAAG,EAAG,CACb,MAAO,IAAIC,QAAO,CAAC,SAAAC,OAAO,QAAIA,QAAO,CAACC,WAAO,6BAAsB,CAAC,GAAC,CAACC,IAAI,CAAC,QAASC,MAAK,CAACC,GAAG,CAAE,CAC7FC,WAAW,CAACD,GAAG,CAAC,CAClB,CAAC,CAAC,CACJ,CAEA,QAASC,YAAW,CAACD,GAAG,CAAE,CACxBE,gBAAgB,CAACF,GAAG,CAAC,CACvB,CAEA,QAASE,iBAAgB,CAACF,GAAG,CAAE,CAC7BA,GAAG,CAACG,SAAS,EAAE,CACjB,CAEAC,MAAM,CAACC,OAAO,CAAGX,GAAG,CAAC',
  },
  reserved: ['_$$_METRO_DEPENDENCY_MAP'],
  config,
};

const GLO: MinifierOptions = {
  filename: '',
  code: '__d(function(global,_$$_REQUIRE,_$$_IMPORT_DEFAULT,_$$_IMPORT_ALL,module,exports,_$$_METRO_DEPENDENCY_MAP){"use strict";var biz=_$$_REQUIRE(_$$_METRO_DEPENDENCY_MAP[0]);module.exports={throwSmth:function throwSmth(){return biz.throwSmthInner();}};});',
  map: {
    version: 3,
    sources: ['js/RKJSModules/segmented/glo.js'],
    sourcesContent: [
      "'use strict';\n\nconst biz = require('./biz');\n\nmodule.exports = {\n  throwSmth() {\n    return biz.throwSmthInner();\n  },\n};",
    ],
    names: [
      'biz',
      'require',
      'module',
      'exports',
      'throwSmth',
      'throwSmthInner',
    ],
    mappings:
      '2GAAA,YAAY,CAEZ,GAAMA,IAAG,CAAGC,WAAO,6BAAS,CAE5BC,MAAM,CAACC,OAAO,CAAG,CACfC,SAAS,qBAAG,CACV,MAAOJ,IAAG,CAACK,cAAc,EAAE,CAC7B,CACF,CAAC,CAAC',
  },
  reserved: ['_$$_METRO_DEPENDENCY_MAP'],
  config,
};

test('parallel calls do not clobber each other', async () => {
  const [barResult, gloResult] = await Promise.all([minify(BAR), minify(GLO)]);

  const barMap = barResult.map;
  const gloMap = gloResult.map;

  expect(gloMap).not.toEqual(barMap);
});
