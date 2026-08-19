/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow strict-local
 * @oncall react_native
 */

import type {Dependency} from 'metro/private/ModuleGraph/worker/collectDependencies';

import collectDependencies from 'metro/private/ModuleGraph/worker/collectDependencies';

const {compare, transformToAst} = require('../__mocks__/test-helpers');
const importExportPlugin = require('../import-export-plugin');
const inlineRequiresPlugin = require('../inline-requires-plugin');
// $FlowFixMe[untyped-import] @babel/code-frame
const {codeFrameColumns} = require('@babel/code-frame');
const generate = require('@babel/generator').default;
const vm = require('node:vm');

const opts = {
  importAll: '_$$_IMPORT_ALL',
  importDefault: '_$$_IMPORT_DEFAULT',
};

const liveOpts = {
  importAll: '_$$_IMPORT_ALL',
  importDefault: '_$$_IMPORT_DEFAULT',
  liveBindings: true,
};

test('correctly transforms and extracts "import" statements', () => {
  const code = `
    import v from 'foo';
    import * as w from 'bar';
    import {x} from 'baz';
    import {y as z} from 'qux';
    import 'side-effect';
  `;

  const expected = `
    var v = _$$_IMPORT_DEFAULT('foo');
    var w = _$$_IMPORT_ALL('bar');
    var x = require('baz').x;
    var z = require('qux').y;
    require('side-effect');
  `;

  compare([importExportPlugin], code, expected, opts);

  expect(showTransformedDeps(code)).toMatchInlineSnapshot(`
    "
    > 2 |     import v from 'foo';
        |     ^^^^^^^^^^^^^^^^^^^^ dep #0 (foo)
    > 3 |     import * as w from 'bar';
        |     ^^^^^^^^^^^^^^^^^^^^^^^^^ dep #1 (bar)
    > 4 |     import {x} from 'baz';
        |     ^^^^^^^^^^^^^^^^^^^^^^ dep #2 (baz)
    > 5 |     import {y as z} from 'qux';
        |     ^^^^^^^^^^^^^^^^^^^^^^^^^^^ dep #3 (qux)
    > 6 |     import 'side-effect';
        |     ^^^^^^^^^^^^^^^^^^^^^ dep #4 (side-effect)"
  `);
});

test('correctly transforms complex patterns', () => {
  const code = `
    import 'first-with-side-effect';
    import a, * as b from 'second';
    import c, {d as e, f} from 'third';
    import {g, h} from 'third';
    import 'fourth-with-side-effect';
    import {i} from 'fifth';
  `;

  const expected = `
    require('first-with-side-effect');
    var a = _$$_IMPORT_DEFAULT('second');
    var b = _$$_IMPORT_ALL('second');
    var _third = require('third'),
        e = _third.d,
        f = _third.f;
    var c = _$$_IMPORT_DEFAULT('third');
    var _third2 = require('third'),
        g = _third2.g,
        h = _third2.h;
    require('fourth-with-side-effect');
    var i = require('fifth').i;
  `;

  compare([importExportPlugin], code, expected, opts);

  expect(showTransformedDeps(code)).toMatchInlineSnapshot(`
    "
    > 2 |     import 'first-with-side-effect';
        |     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ dep #0 (first-with-side-effect)
    > 3 |     import a, * as b from 'second';
        |     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ dep #1 (second)
    > 3 |     import a, * as b from 'second';
        |     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ dep #1 (second)
    > 4 |     import c, {d as e, f} from 'third';
        |     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ dep #2 (third)
    > 4 |     import c, {d as e, f} from 'third';
        |     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ dep #2 (third)
    > 5 |     import {g, h} from 'third';
        |     ^^^^^^^^^^^^^^^^^^^^^^^^^^^ dep #2 (third)
    > 6 |     import 'fourth-with-side-effect';
        |     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ dep #3 (fourth-with-side-effect)
    > 7 |     import {i} from 'fifth';
        |     ^^^^^^^^^^^^^^^^^^^^^^^^ dep #4 (fifth)"
  `);
});

test('hoists declarations to the top', () => {
  const code = `
    foo();
    import {foo} from 'bar';
  `;

  const expected = `
    var foo = require('bar').foo;
    foo();
  `;

  compare([importExportPlugin], code, expected, opts);

  expect(showTransformedDeps(code)).toMatchInlineSnapshot(`
    "
    > 3 |     import {foo} from 'bar';
        |     ^^^^^^^^^^^^^^^^^^^^^^^^ dep #0 (bar)"
  `);
});

test('exports members of another module directly from an import (as named)', () => {
  const code = `
    export {default as foo} from 'bar';
  `;

  const expected = `
    Object.defineProperty(exports, '__esModule', {value: true});

    var _default = _$$_IMPORT_DEFAULT('bar');
    exports.foo = _default;
  `;

  compare([importExportPlugin], code, expected, opts);

  expect(showTransformedDeps(code)).toMatchInlineSnapshot(`
    "
    > 2 |     export {default as foo} from 'bar';
        |     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ dep #0 (bar)"
  `);
});

test('exports members of another module directly from an import (as default)', () => {
  const code = `
    export {foo as default, baz} from 'bar';
  `;

  const expected = `
    Object.defineProperty(exports, '__esModule', {value: true});

    var _foo = require('bar').foo;
    var _baz = require('bar').baz;
    exports.baz = _baz;
    exports.default = _foo;
  `;

  compare([importExportPlugin], code, expected, opts);

  expect(showTransformedDeps(code)).toMatchInlineSnapshot(`
    "
    > 2 |     export {foo as default, baz} from 'bar';
        |     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ dep #0 (bar)
    > 2 |     export {foo as default, baz} from 'bar';
        |     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ dep #0 (bar)"
  `);
});

test('exports named members', () => {
  const code = `
    export const foo = 'bar';
  `;

  const expected = `
    Object.defineProperty(exports, '__esModule', {value: true});
    const foo = 'bar';
    exports.foo = foo;
  `;

  compare([importExportPlugin], code, expected, opts);
});

test('renames existing `exports` declarations in module scope', () => {
  const code = `
    const exports = 'foo';
    export const bar = 'bar';
    console.log(exports, bar);
  `;

  const expected = `
    Object.defineProperty(exports, '__esModule', {value: true});
    const _exports = 'foo';
    const bar = 'bar';
    console.log(_exports, bar);
    exports.bar = bar;
  `;

  compare([importExportPlugin], code, expected, opts);
});

test('handles an export named "exports"', () => {
  const code = `
    export const exports = {a: 'foo'};
  `;

  const expected = `
    Object.defineProperty(exports, '__esModule', {value: true});
    const _exports = {
      a: 'foo',
    };
    exports.exports = _exports;
  `;

  compare([importExportPlugin], code, expected, opts);
});

test('allows mixed esm and cjs exports', () => {
  const code = `
    export const foo = 'foo';
    exports.bar = 'bar';
    module.exports.baz = 'baz';
    export default class {}
  `;

  const expected = `
    Object.defineProperty(exports, '__esModule', {value: true});
    const foo = 'foo';
    exports.bar = 'bar';
    module.exports.baz = 'baz';
    class _default {}
    exports.foo = foo;
    exports.default = _default;
  `;

  compare([importExportPlugin], code, expected, opts);
});

test('exports destructured named object members', () => {
  const code = `
    export const {foo,bar} = {foo: 'bar',bar: 'baz'};
  `;

  const expected = `
    Object.defineProperty(exports, '__esModule', {value: true});
    const {foo,bar} = {foo: 'bar',bar: 'baz'};
    exports.foo = foo;
    exports.bar = bar;
  `;

  compare([importExportPlugin], code, expected, opts);
});

test('exports destructured renamed object members', () => {
  const code = `
    export const {foo: bar, baz} = {foo: 'bar', baz: 'baz'};
  `;

  const expected = `
    Object.defineProperty(exports, '__esModule', {value: true});
    const {foo: bar,baz} = {foo: 'bar', baz: 'baz'};
    exports.bar = bar;
    exports.baz = baz;
  `;

  compare([importExportPlugin], code, expected, opts);
});

test('exports destructured object rest members', () => {
  const code = `
    export const {foo, ...bar} = {foo: 'foo', bar: 'bar', baz: 'baz'};
  `;

  const expected = `
    Object.defineProperty(exports, '__esModule', {value: true});
    const {foo,...bar} = {foo: 'foo', bar: 'bar', baz: 'baz'};
    exports.foo = foo;
    exports.bar = bar;
  `;

  compare([importExportPlugin], code, expected, opts);
});

test('exports destructured named array members', () => {
  const code = `
    export const [foo,bar] = ['bar','baz'];
  `;

  const expected = `
    Object.defineProperty(exports, '__esModule', {value: true});
    const [foo,bar] = ['bar','baz'];
    exports.foo = foo;
    exports.bar = bar;
  `;

  compare([importExportPlugin], code, expected, opts);
});

test('exports destructured array rest members', () => {
  const code = `
    export const [foo, ...bar] = ['foo','bar','baz'];
  `;

  const expected = `
    Object.defineProperty(exports, '__esModule', {value: true});
    const [foo,...bar] = ['foo','bar','baz'];
    exports.foo = foo;
    exports.bar = bar;
  `;

  compare([importExportPlugin], code, expected, opts);
});

test('exports members of another module directly from an import (as all)', () => {
  const code = `
    export * from 'bar';
  `;

  const expected = `
    Object.defineProperty(exports, '__esModule', {value: true});

    var _bar = require('bar');

    for (var _key in _bar) {
      if (_key === "default") continue;
      exports[_key] = _bar[_key];
    }
  `;

  compare([importExportPlugin], code, expected, opts);

  expect(showTransformedDeps(code)).toMatchInlineSnapshot(`
    "
    > 2 |     export * from 'bar';
        |     ^^^^^^^^^^^^^^^^^^^^ dep #0 (bar)"
  `);
});

test('exports members of another module directly from an import (as namespace)', () => {
  const code = `
    export * as AppleIcons from 'apple-icons';
  `;

  const expected = `
    Object.defineProperty(exports, '__esModule', {value: true});

    var _AppleIcons = _$$_IMPORT_ALL('apple-icons');
    exports.AppleIcons = _AppleIcons;
  `;

  compare([importExportPlugin], code, expected, opts);

  expect(showTransformedDeps(code)).toMatchInlineSnapshot(`
    "
    > 2 |     export * as AppleIcons from 'apple-icons';
        |     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ dep #0 (apple-icons)"
  `);
});

test('places export all above explicit exports', () => {
  const code = `
    export * from 'foo';
    export {baz} from 'bar';
    const bax = 'bax';
    export default bax;
  `;

  const expected = `
    Object.defineProperty(exports, '__esModule', {value: true});

    var _foo = require('foo');

    for (var _key in _foo) {
      if (_key === "default") continue;
      exports[_key] = _foo[_key];
    }

    var _baz = require('bar').baz;
    const bax = 'bax';

    var _default = bax;

    exports.baz = _baz;
    exports.default = _default;
  `;

  compare([importExportPlugin], code, expected, opts);
});

test('explicit exports override export all at runtime', () => {
  const transformedCode = generate(
    transformToAst(
      [importExportPlugin],
      `
        export * from 'foo';
        export const overridden = 'explicit named';
        export default 'explicit default';
      `,
      opts,
    ),
  ).code;
  const context = {
    exports: {} as {[string]: unknown},
    require: (id: string) => {
      if (id !== 'foo') {
        throw new Error(`Unexpected module: ${id}`);
      }
      return {
        default: 'star default',
        overridden: 'star named',
        sourceOnly: 'source only',
      };
    },
  };

  vm.runInNewContext(transformedCode, context);

  expect(context.exports.__esModule).toBe(true);
  expect(context.exports.default).toBe('explicit default');
  expect(context.exports.overridden).toBe('explicit named');
  expect(context.exports.sourceOnly).toBe('source only');
});

test('export all does not re-export the default of the source', () => {
  const transformedCode = generate(
    transformToAst(
      [importExportPlugin],
      `
        export * from 'foo';
      `,
      opts,
    ),
  ).code;
  const context = {
    exports: {} as {[string]: unknown},
    require: (id: string) => {
      if (id !== 'foo') {
        throw new Error(`Unexpected module: ${id}`);
      }
      return {
        default: 'star default',
        named: 'star named',
      };
    },
  };

  vm.runInNewContext(transformedCode, context);

  // Per the ES spec (GetExportedNames) and Node.js, `export *` re-exports
  // named exports but never the source module's default export.
  expect(context.exports.named).toBe('star named');
  expect('default' in context.exports).toBe(false);
});

test('export all as namespace includes the default of the source', () => {
  const transformedCode = generate(
    transformToAst(
      [importExportPlugin],
      `
        export * as ns from 'foo';
      `,
      opts,
    ),
  ).code;
  const source = {
    __esModule: true,
    default: 'star default',
    named: 'star named',
  };
  // Faithful stand-in for metroImportAll: resolve the module via require,
  // then expose an ES module's namespace as-is (default included).
  const requireMock = (id: string) => {
    if (id !== 'foo') {
      throw new Error(`Unexpected module: ${id}`);
    }
    return source;
  };
  const exportsObj: {[string]: unknown} = {};
  const context: {[string]: unknown} = {
    exports: exportsObj,
    require: requireMock,
  };
  context[opts.importAll] = (id: string) => {
    const mod = requireMock(id);
    return mod.__esModule === true ? mod : {...mod, default: mod};
  };

  vm.runInNewContext(transformedCode, context);

  // `export * as ns` (ExportNamespaceSpecifier) creates a namespace object,
  // which per the ES spec DOES expose the source module's default export -
  // unlike bare `export *`.
  expect(exportsObj.ns).toEqual({
    __esModule: true,
    default: 'star default',
    named: 'star named',
  });
});

test('re-export dependencies evaluate before module body at runtime', () => {
  const transformedCode = generate(
    transformToAst(
      [importExportPlugin],
      `
        events.push('body');
        export {value} from 'foo';
        export * from 'bar';
      `,
      opts,
    ),
  ).code;
  const events = [];
  const context = {
    events,
    exports: {} as {[string]: unknown},
    require: (id: string) => {
      events.push(`require ${id}`);
      return id === 'foo' ? {value: 'foo value'} : {star: 'bar star'};
    },
  };

  vm.runInNewContext(transformedCode, context);

  expect(events).toEqual(['require foo', 'require bar', 'body']);
  expect(context.exports.value).toBe('foo value');
  expect(context.exports.star).toBe('bar star');
});

describe('unstable_liveBindings', () => {
  test('named imports become live member reads off a shared binding', () => {
    const code = `
      import {x, y} from 'foo';
      export function read() {
        return x + y;
      }
    `;

    const expected = `
      Object.defineProperty(exports, '__esModule', {
        value: true
      });
      var _foo = require('foo');
      function read() {
        return _foo.x + _foo.y;
      }
      exports.read = read;
    `;

    compare([importExportPlugin], code, expected, liveOpts);
  });

  test('default imports bind once via `importDefault(dep, 1)` and read `.default` at each site', () => {
    const code = `
      import d from 'foo';
      export function read() {
        return d;
      }
    `;

    // Default imports get a shared alias at module scope produced by the
    // mode-1 importDefault helper. The helper returns a namespace-shaped
    // object (the exports for ES modules; a `{default: exports}` wrapper for
    // CJS) so that `.default` on the alias resolves to the module's default
    // export in both cases. Each read site becomes `<alias>.default`, cloned
    // from a single stored expression, so inline-requires can inline the
    // whole `importDefault(dep, 1).default` per use for lazy loading, while
    // non-inlined consumers pay only a cheap property access per read.
    //
    // Non-memoising: the helper re-invokes metroRequire on every call, so
    // CJS `module.exports = X` post-init reassignment is observed.
    const expected = `
      Object.defineProperty(exports, '__esModule', {
        value: true
      });
      var _foo = _$$_IMPORT_DEFAULT('foo', 1);
      function read() {
        return _foo.default;
      }
      exports.read = read;
    `;

    compare([importExportPlugin], code, expected, liveOpts);
  });

  test('`import {default as x}` is treated as a default import', () => {
    const code = `
      import {default as d} from 'foo';
      export function read() {
        return d;
      }
    `;

    const expected = `
      Object.defineProperty(exports, '__esModule', {
        value: true
      });
      var _foo = _$$_IMPORT_DEFAULT('foo', 1);
      function read() {
        return _foo.default;
      }
      exports.read = read;
    `;

    compare([importExportPlugin], code, expected, liveOpts);
  });

  test('default import with no reads still anchors the require for side effects', () => {
    // An `import d from 'foo'` where `d` is never referenced must still
    // evaluate 'foo' at module init (ES module semantics). The anchor
    // provides that: inline-requires elides the dead binding for
    // inlineable modules and retains it for non-inlineable ones.
    const code = `
      import d from 'foo';
    `;

    const expected = `
      var _foo = _$$_IMPORT_DEFAULT('foo', 1);
    `;

    compare([importExportPlugin], code, expected, liveOpts);
  });

  test('default + namespace import does not double-anchor', () => {
    // The namespace specifier already emits its own top-level require via
    // `importAll(...)`, so the default's anchor is unnecessary.
    const code = `
      import d, * as ns from 'foo';
      export function read() {
        return [d, ns];
      }
    `;

    const expected = `
      Object.defineProperty(exports, '__esModule', {
        value: true
      });
      var _foo = _$$_IMPORT_DEFAULT('foo', 1);
      var ns = _$$_IMPORT_ALL('foo');
      function read() {
        return [_foo.default, ns];
      }
      exports.read = read;
    `;

    compare([importExportPlugin], code, expected, liveOpts);
  });

  test('default and named imports from one source use separate bindings', () => {
    // Named imports hoist a single `require` binding and read members off it
    // at each use. Default imports bypass any binding and call the helper at
    // each read site, so the source module's default is re-resolved on every
    // use.
    const code = `
      import d, {x} from 'foo';
      export function read() {
        return [d, x];
      }
    `;

    const expected = `
      Object.defineProperty(exports, '__esModule', {
        value: true
      });
      var _foo = _$$_IMPORT_DEFAULT('foo', 1);
      var _foo2 = require('foo');
      function read() {
        return [_foo.default, _foo2.x];
      }
      exports.read = read;
    `;

    compare([importExportPlugin], code, expected, liveOpts);
  });

  test('`import * as ns` is left alone', () => {
    const code = `
      import * as ns from 'foo';
      export function read() {
        return ns.x;
      }
    `;

    const expected = `
      Object.defineProperty(exports, '__esModule', {
        value: true
      });
      var ns = _$$_IMPORT_ALL('foo');
      function read() {
        return ns.x;
      }
      exports.read = read;
    `;

    compare([importExportPlugin], code, expected, liveOpts);
  });

  test('re-exporting an imported binding forwards live', () => {
    // `import d from 'foo'; export {d}` is an indirect export - the same
    // construct as `export {default as d} from 'foo'` - so it forwards rather
    // than snapshotting.
    //
    // The export is generated at Program.exit, after the import declaration
    // has been removed, so this only works because reference rewriting is
    // deferred until the body is final.
    const code = `
      import d from 'foo';
      export {d};
    `;

    const expected = `
      Object.defineProperty(exports, '__esModule', {
        value: true
      });
      var _foo = _$$_IMPORT_DEFAULT('foo', 1);
      Object.defineProperty(exports, "d", {
        enumerable: true,
        configurable: true,
        get: function () {
          return _foo.default;
        }
      });
    `;

    compare([importExportPlugin], code, expected, liveOpts);
  });

  test('an inner scope shadowing an imported name is not rewritten', () => {
    const code = `
      import {x} from 'foo';
      export function shadows() {
        const x = 1;
        return x;
      }
      export function reads() {
        return x;
      }
    `;

    const expected = `
      Object.defineProperty(exports, '__esModule', {
        value: true
      });
      var _foo = require('foo');
      function shadows() {
        const x = 1;
        return x;
      }
      function reads() {
        return _foo.x;
      }
      exports.shadows = shadows;
      exports.reads = reads;
    `;

    compare([importExportPlugin], code, expected, liveOpts);
  });

  test('object shorthand referencing an imported binding is expanded', () => {
    const code = `
      import d from 'foo';
      import {x} from 'bar';
      export const o = {d, x};
    `;

    const expected = `
      Object.defineProperty(exports, '__esModule', {
        value: true
      });
      var _foo = _$$_IMPORT_DEFAULT('foo', 1);
      var _bar = require('bar');
      const o = {
        d: _foo.default,
        x: _bar.x
      };
      exports.o = o;
    `;

    compare([importExportPlugin], code, expected, liveOpts);
  });

  test('a side-effect-only import is unchanged', () => {
    const code = `import 'foo';`;
    const expected = `
      require('foo');
    `;
    compare([importExportPlugin], code, expected, liveOpts);
  });

  test('a default re-export forwards through importDefault at read time', () => {
    // The helper is non-memoizing under liveBindings, so a per-call read
    // inside the getter tracks the source module's current default.
    const code = `export {default as D} from './baz';`;
    const expected = `
      Object.defineProperty(exports, '__esModule', {
        value: true
      });
      Object.defineProperty(exports, "D", {
        enumerable: true,
        configurable: true,
        get: function () {
          return _$$_IMPORT_DEFAULT('./baz', 1).default;
        }
      });
    `;
    compare([importExportPlugin], code, expected, liveOpts);
  });

  const memoizingInlineOpts = {
    ...liveOpts,
    inlineableCalls: ['_$$_IMPORT_DEFAULT', '_$$_IMPORT_ALL'],
    memoizeCalls: true,
  };

  // The point of binding the namespace rather than the value: memoization and
  // liveness stop competing. The helper result is cacheable because it is an
  // object whose *contents* move, so the read can be both memoized and live -
  // one extra property load over a snapshot, with no helper re-entry.
  test('memoizing inline requires do not intercept a default read', () => {
    // Under the merged design, default reads emit as helper calls at each
    // site rather than reads off a hoisted binding, so there is no local to
    // memoize.
    const code = `
      import d from 'foo';
      export function read() { return d; }
    `;

    const expected = `
      var _foo;
      Object.defineProperty(exports, '__esModule', {
        value: true
      });
      function read() {
        return (_foo || (_foo = _$$_IMPORT_DEFAULT('foo', 1))).default;
      }
      exports.read = read;
    `;

    compare(
      [importExportPlugin, inlineRequiresPlugin],
      code,
      expected,
      memoizingInlineOpts,
    );
  });

  test('a memoized named read is still a live read', () => {
    const code = `
      import {x} from 'foo';
      export function read() { return x; }
    `;

    const expected = `
      var _foo;
      Object.defineProperty(exports, '__esModule', {
        value: true
      });
      function read() {
        return (_foo || (_foo = require('foo'))).x;
      }
      exports.read = read;
    `;

    compare(
      [importExportPlugin, inlineRequiresPlugin],
      code,
      expected,
      memoizingInlineOpts,
    );
  });

  test('default reads are already at the use site without inline requires', () => {
    // No hoisted binding to inline - the transform emits the call at the
    // read site from the outset.
    const code = `
      import d from 'foo';
      export function read() { return d; }
    `;

    const expected = `
      Object.defineProperty(exports, '__esModule', {
        value: true
      });
      function read() {
        return _$$_IMPORT_DEFAULT('foo', 1).default;
      }
      exports.read = read;
    `;

    compare([importExportPlugin, inlineRequiresPlugin], code, expected, {
      ...liveOpts,
      inlineableCalls: ['_$$_IMPORT_DEFAULT', '_$$_IMPORT_ALL'],
    });
  });

  // Stand-in for the runtime helpers the emitted code calls into. The
  // `importDefault` factory slot carries `metroImportDefault`, which returns
  // the default value with CJS interop and does not memoize - the per-read
  // call is what makes each read live.
  const makeRuntime = (registry: {[string]: $FlowFixMe}) => {
    const lookup = (id: string) => {
      if (!(id in registry)) {
        throw new Error(`Unexpected module: ${id}`);
      }
      return registry[id];
    };
    const importDefault = (id: string, mode?: number) => {
      const exps = lookup(id);
      const isESM = exps != null && exps.__esModule;
      if (mode === 1) {
        // Mode 1: namespace-shaped return - matches D115566590's helper.
        return isESM ? exps : {default: exps};
      }
      return isESM ? exps.default : exps;
    };
    return {require: (id: string) => lookup(id), importDefault};
  };

  const runLive = (
    source: string,
    registry: {[string]: $FlowFixMe},
    extraOpts: $FlowFixMe = null,
  ) => {
    const plugins =
      extraOpts == null
        ? [importExportPlugin]
        : [importExportPlugin, inlineRequiresPlugin];
    const transformedCode = generate(
      transformToAst(plugins, source, {...liveOpts, ...(extraOpts ?? {})}),
    ).code;
    const runtime = makeRuntime(registry);
    const context = {
      exports: {} as {[string]: $FlowFixMe},
      require: runtime.require,
      _$$_IMPORT_ALL: (id: string) => registry[id],
      _$$_IMPORT_DEFAULT: runtime.importDefault,
    };
    vm.runInNewContext(transformedCode, context);
    return context.exports;
  };

  // The configuration that matters most: no inline requires at all. This is
  // where the previous design silently degraded to snapshot semantics, because
  // liveness depended on `inlineRequires` deferring the read.
  test('a named import is live without inline requires', () => {
    const source = {__esModule: true, counter: 1} as {[string]: $FlowFixMe};
    const exps = runLive(
      `
        import {counter} from './source';
        export function read() { return counter; }
      `,
      {'./source': source},
    );

    expect(exps.read()).toBe(1);
    source.counter = 42;
    expect(exps.read()).toBe(42);
  });

  test('a default import is live without inline requires', () => {
    const source = {__esModule: true, default: 'first'} as {
      [string]: $FlowFixMe,
    };
    const exps = runLive(
      `
        import d from './source';
        export function read() { return d; }
      `,
      {'./source': source},
    );

    expect(exps.read()).toBe('first');
    source.default = 'second';
    expect(exps.read()).toBe('second');
  });

  test('a named import stays live under memoizing inline requires', () => {
    const source = {__esModule: true, counter: 1} as {[string]: $FlowFixMe};
    const exps = runLive(
      `
        import {counter} from './source';
        export function read() { return counter; }
      `,
      {'./source': source},
      {
        inlineableCalls: ['_$$_IMPORT_DEFAULT', '_$$_IMPORT_ALL'],
        memoizeCalls: true,
      },
    );

    expect(exps.read()).toBe(1);
    source.counter = 42;
    expect(exps.read()).toBe(42);
  });

  test('a default import stays live under memoizing inline requires', () => {
    const source = {__esModule: true, default: 'first'} as {
      [string]: $FlowFixMe,
    };
    const exps = runLive(
      `
        import d from './source';
        export function read() { return d; }
      `,
      {'./source': source},
      {
        inlineableCalls: ['_$$_IMPORT_DEFAULT', '_$$_IMPORT_ALL'],
        memoizeCalls: true,
      },
    );

    expect(exps.read()).toBe('first');
    source.default = 'second';
    expect(exps.read()).toBe('second');
  });

  test('a top-level dependency cycle resolves through the namespace', () => {
    // The motivating case. `./b` is mid-initialisation when this module runs,
    // so its exports object is still empty; the binding it hands out has to be
    // the object, not a snapshot of its contents.
    const partiallyInitialisedB = {__esModule: true} as {[string]: $FlowFixMe};
    const exps = runLive(
      `
        import {fromB} from './b';
        export function read() { return fromB; }
      `,
      {'./b': partiallyInitialisedB},
    );

    // B finishes evaluating after this module's body has already run.
    partiallyInitialisedB.fromB = 'assigned later';
    expect(exps.read()).toBe('assigned later');
  });

  test('CJS interop: default of a CJS module is `module.exports`', () => {
    const exps = runLive(
      `
        import d from './cjs';
        export function read() { return d; }
      `,
      {'./cjs': {a: 1}},
    );
    expect(exps.read()).toEqual({a: 1});
  });

  test('CJS interop: `module.exports = null`', () => {
    const exps = runLive(
      `
        import d from './cjs';
        export function read() { return d; }
      `,
      {'./cjs': null},
    );
    expect(exps.read()).toBe(null);
  });

  test('CJS interop: a primitive `module.exports`', () => {
    const exps = runLive(
      `
        import d from './cjs';
        export function read() { return d; }
      `,
      {'./cjs': 42},
    );
    expect(exps.read()).toBe(42);
  });

  test('CJS interop: default and named from the same CJS source', () => {
    // `default` comes off the wrapper, `x` off the exports object itself.
    const cjs = {x: 'named'} as {[string]: $FlowFixMe};
    const exps = runLive(
      `
        import d, {x} from './cjs';
        export function readDefault() { return d; }
        export function readNamed() { return x; }
      `,
      {'./cjs': cjs},
    );

    expect(exps.readDefault()).toBe(cjs);
    expect(exps.readNamed()).toBe('named');
    cjs.x = 'reassigned';
    expect(exps.readNamed()).toBe('reassigned');
  });

  test('a re-exported imported default is observed live', () => {
    const source = {__esModule: true, default: 'first'} as {
      [string]: $FlowFixMe,
    };
    const exps = runLive(
      `
        import d from './source';
        export {d};
      `,
      {'./source': source},
    );

    expect(exps.d).toBe('first');
    source.default = 'second';
    expect(exps.d).toBe('second');
  });

  test('a re-exported imported named binding is observed live', () => {
    const source = {__esModule: true, x: 1} as {[string]: $FlowFixMe};
    const exps = runLive(
      `
        import {x} from './source';
        export {x as y};
      `,
      {'./source': source},
    );

    expect(exps.y).toBe(1);
    source.x = 2;
    expect(exps.y).toBe(2);
  });

  test('reassigned named exports are mirrored into exports', () => {
    const code = `
      export let x = 1;
      x = 2;
      x += 3;
      x++;
      ++x;
    `;

    const expected = `
      Object.defineProperty(exports, '__esModule', {
        value: true
      });
      let x = 1;
      exports.x = x = 2;
      exports.x = x += 3;
      exports.x = ++x;
      exports.x = ++x;
      exports.x = x;
    `;

    compare([importExportPlugin], code, expected, liveOpts);
  });

  test('postfix update in value position preserves the old value', () => {
    const code = `
      export let x = 1;
      export const y = x++;
    `;

    const expected = `
      var _x;
      Object.defineProperty(exports, '__esModule', {
        value: true
      });
      let x = 1;
      const y = (_x = x++, exports.x = x, _x);
      exports.x = x;
      exports.y = y;
    `;

    compare([importExportPlugin], code, expected, liveOpts);
  });

  test('postfix update value and mirrored export agree at runtime', () => {
    const transformedCode = generate(
      transformToAst(
        [importExportPlugin],
        `
          export let x = 0;
          export function postfix() { return x++; }
          export function prefix() { return ++x; }
        `,
        liveOpts,
      ),
    ).code;

    const context = {
      exports: {} as {[string]: $FlowFixMe},
      require: () => ({}),
    };

    vm.runInNewContext(transformedCode, context);

    // `x++` must evaluate to the pre-increment value while still publishing the
    // post-increment value to `exports`.
    expect(context.exports.postfix()).toBe(0);
    expect(context.exports.x).toBe(1);
    expect(context.exports.prefix()).toBe(2);
    expect(context.exports.x).toBe(2);
  });

  test('exports aliased under multiple remote names are all mirrored', () => {
    const code = `
      let x = 1;
      export {x, x as y};
      x = 2;
    `;

    const expected = `
      Object.defineProperty(exports, '__esModule', {
        value: true
      });
      let x = 1;
      exports.y = exports.x = x = 2;
      exports.x = x;
      exports.y = x;
    `;

    compare([importExportPlugin], code, expected, liveOpts);
  });

  test('destructuring reassignment targets are left untouched (deferred)', () => {
    const code = `
      export let x = 1;
      ({x} = {x: 2});
    `;

    const expected = `
      Object.defineProperty(exports, '__esModule', {
        value: true
      });
      let x = 1;
      ({
        x
      } = {
        x: 2
      });
      exports.x = x;
    `;

    compare([importExportPlugin], code, expected, liveOpts);
  });

  test('mutable named exports are observable at runtime', () => {
    const transformedCode = generate(
      transformToAst(
        [importExportPlugin],
        `
          export let counter = 0;
          export function increment() { counter++; }
          export function setCounter(v) { counter = v; }
        `,
        liveOpts,
      ),
    ).code;

    const context = {
      exports: {} as {[string]: $FlowFixMe},
      require: () => ({}),
    };

    vm.runInNewContext(transformedCode, context);

    expect(context.exports.counter).toBe(0);
    context.exports.increment();
    expect(context.exports.counter).toBe(1);
    context.exports.setCounter(42);
    expect(context.exports.counter).toBe(42);
  });

  test('named re-exports forward via live getters', () => {
    const code = `export {x} from './foo';`;
    const expected = `
      Object.defineProperty(exports, '__esModule', {
        value: true
      });
      Object.defineProperty(exports, "x", {
        enumerable: true,
        configurable: true,
        get: function () {
          return require('./foo').x;
        }
      });
    `;
    compare([importExportPlugin], code, expected, liveOpts);
  });

  test('re-exported named binding is observed live at runtime', () => {
    const transformedCode = generate(
      transformToAst(
        [importExportPlugin],
        `export {counter} from './source';`,
        liveOpts,
      ),
    ).code;

    const sourceExports = {counter: 1} as {[string]: $FlowFixMe};
    const context = {
      exports: {} as {[string]: $FlowFixMe},
      require: (id: string) => {
        if (id !== './source') {
          throw new Error(`Unexpected module: ${id}`);
        }
        return sourceExports;
      },
    };

    vm.runInNewContext(transformedCode, context);

    expect(context.exports.counter).toBe(1);
    // Reassignment in the source module is observed through the re-export.
    sourceExports.counter = 42;
    expect(context.exports.counter).toBe(42);
  });

  test('export * forwards live and respects explicit-export precedence', () => {
    const transformedCode = generate(
      transformToAst(
        [importExportPlugin],
        `
          export * from './source';
          export const own = 'own';
        `,
        liveOpts,
      ),
    ).code;

    const sourceExports = {
      a: 1,
      own: 'star should not win',
      default: 'star default',
      __esModule: true,
    } as {[string]: $FlowFixMe};
    const context = {
      exports: {} as {[string]: $FlowFixMe},
      require: (_id: string) => sourceExports,
    };

    vm.runInNewContext(transformedCode, context);

    expect(context.exports.a).toBe(1);
    // Explicit export wins over `export *`.
    expect(context.exports.own).toBe('own');
    // `export *` never forwards `default` or `__esModule`.
    expect(context.exports.default).toBeUndefined();
    // Forwarded names are live.
    sourceExports.a = 2;
    expect(context.exports.a).toBe(2);
  });
});

test('enables module exporting when something is exported', () => {
  const code = `
    foo();
    import {foo} from 'bar';
    export default foo;
  `;

  const expected = `
    Object.defineProperty(exports, '__esModule', {value: true});

    var foo = require('bar').foo;
    foo();

    var _default = foo;
    exports.default = _default;
  `;

  compare([importExportPlugin], code, expected, opts);

  expect(showTransformedDeps(code)).toMatchInlineSnapshot(`
    "
    > 3 |     import {foo} from 'bar';
        |     ^^^^^^^^^^^^^^^^^^^^^^^^ dep #0 (bar)"
  `);
});

test('renames bindings', () => {
  const code = `
    const module = 'foo';
    let exports = 'bar';
    var global = 'baz';
    const require = {};
  `;

  const expected = `
    const _module = 'foo';
    let _exports = 'bar';
    var _global = 'baz';
    const _require = {};
  `;

  compare([importExportPlugin], code, expected, opts);
});

test('supports `import {default as LocalName}`', () => {
  const code = `
    import {
      Platform,
      default as ReactNative,
    } from 'react-native';
  `;

  const expected = `
    var Platform = require('react-native').Platform;
    var ReactNative = _$$_IMPORT_DEFAULT('react-native');
  `;

  compare([importExportPlugin], code, expected, opts);

  expect(showTransformedDeps(code)).toMatchInlineSnapshot(`
    "
    > 2 |     import {
        |     ^^^^^^^^
    > 3 |       Platform,
        | ^^^^^^^^^^^^^^^
    > 4 |       default as ReactNative,
        | ^^^^^^^^^^^^^^^
    > 5 |     } from 'react-native';
        | ^^^^^^^^^^^^^^^^^^^^^^^^^^^ dep #0 (react-native)
    > 2 |     import {
        |     ^^^^^^^^
    > 3 |       Platform,
        | ^^^^^^^^^^^^^^^
    > 4 |       default as ReactNative,
        | ^^^^^^^^^^^^^^^
    > 5 |     } from 'react-native';
        | ^^^^^^^^^^^^^^^^^^^^^^^^^^^ dep #0 (react-native)"
  `);
});

function showTransformedDeps(code: string) {
  const {dependencies} = collectDependencies(
    transformToAst([importExportPlugin], code, opts),
    {
      asyncRequireModulePath: 'asyncRequire',
      dependencyMapName: null,
      dynamicRequires: 'reject',
      inlineableCalls: [opts.importAll, opts.importDefault],
      keepRequireNames: true,
      allowOptionalDependencies: false,
      unstable_allowRequireContext: false,
    },
  );

  return formatDependencyLocs(dependencies, code);
}

function formatDependencyLocs(
  dependencies: ReadonlyArray<Dependency>,
  code: string,
) {
  return (
    '\n' +
    dependencies
      .map((dep, depIndex) =>
        dep.data.locs.length
          ? dep.data.locs
              .map(loc => formatLoc(loc, depIndex, dep, code))
              .join('\n')
          : `dep #${depIndex} (${dep.name}): no location recorded`,
      )
      .join('\n')
  );
}

function adjustPosForCodeFrame(
  pos: ?(BabelSourceLocation['start'] | BabelSourceLocation['end']),
) {
  return pos ? {...pos, column: pos.column + 1} : pos;
}

function adjustLocForCodeFrame(loc: BabelSourceLocation) {
  return {
    start: adjustPosForCodeFrame(loc.start),
    end: adjustPosForCodeFrame(loc.end),
  };
}

function formatLoc(
  loc: BabelSourceLocation,
  depIndex: number,
  dep: Dependency,
  code: string,
) {
  return codeFrameColumns(code, adjustLocForCodeFrame(loc), {
    message: `dep #${depIndex} (${dep.name})`,
    linesAbove: 0,
    linesBelow: 0,
  });
}
