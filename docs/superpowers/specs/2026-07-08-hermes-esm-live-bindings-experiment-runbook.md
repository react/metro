# ESM Live Bindings — Transform & OTA Experiment Runbook

**Status (2026-08-03):** transform implemented behind a flag; link-time default-import
rewrite implemented and unit-tested; benchmarks and correctness proven. Awaiting
publish + review, then the OTA experiment.

**Current draft stack** (all `Unpublished`, in dependency order):

| Diff | What it does |
|---|---|
| D111629268 | `definesESModuleInterop` detector; positive-only `out.isESModule` hint; `unstable_isESModule` threaded to buck |
| D111629272 | Serialize-time rewrite of ESM default imports to `require(dep).default` (+ unit tests) |
| D111629271 | Gates that rewrite on `unstable_staticHermesOptimizedRequire` |
| D111529091 | Opt-in `unstable_liveBindings` transform + live `metroImportDefault` runtime |

Side branch, **not** on the OTA critical path (see "Do we need the Hermes change?"):

| Diff | What it does |
|---|---|
| D111629267 | `[hermes][prototype]` `CallRequireImportDefault` opcode + `moduleImportedDefaults_` cache |

Superseded (do not land): D111143093 → D111148330 (earlier transform, folded into
D111529091), D111629273 (abandoned; its content is folded into D111629268).
D111568389 (`export *` must not re-export `default`) is standalone.

## What the two halves do

### Live bindings (D111529091)

`import-export-plugin` gains a `liveBindings` option, gated behind the
`unstable_liveBindings` custom transform option. When enabled:

- **Exports (write side):** every reassignment of an exported binding re-publishes
  the new value onto `exports` as a plain data-property write (`x = v` →
  `exports.x = (x = v)`; `x++` → `(x++, exports.x = x, x)`). Implemented via each
  binding's `constantViolations` after a scope crawl, so a shadowing local in a
  nested scope is correctly left alone.
- **Re-export forwarding** (`export {x} from`, `export * from`) installs getters,
  because the source module can reassign the binding and local assignment tracking
  cannot observe that. A module's *own* exports keep the fast data-property path.
- **Imports (read side):** default imports keep the `_$$_IMPORT_DEFAULT` call
  shape; liveness comes from the runtime helper caching the source module's
  *exports object* rather than the resolved default value, then re-reading
  `.default` on each subsequent read.

Semantics: **live value, relaxed TDZ** — a read before the source module finishes
initialising returns `undefined` rather than throwing.

### Link-time default-import rewrite (D111629268 → D111629272 → D111629271)

At serialize time, inside `inlineModuleIds`, default imports of dependencies known
to be ES modules are rewritten:

```js
_$$_IMPORT_DEFAULT(depMap[0])   →   require(depMap[0]).default
```

so the read lowers to the Static Hermes `CallRequire` fast path (native
per-`RuntimeModule` export cache) instead of the JS `metroImportDefault` helper.
CJS/unknown targets keep the interop helper, because their default is the whole
`module.exports`, not `.default`.

The rewrite is padded to the original length so byte offsets and source maps are
unaffected, and it leaves the dependency-map reference intact so the subsequent id
inlining still fires (keeping the resulting `require(<literalId>)`
`CallRequire`-eligible).

## How the two compose (this is the point)

`require(dep).default` is a **fresh property read on every evaluation**, so for
ESM-detected targets the rewrite is *inherently live* — and it rides
`CallRequire`. That means:

- For ESM dependencies, the rewrite gives you liveness **and** the fast path, with
  no interop helper. The live-`metroImportDefault` work in D111529091 is redundant
  for exactly these sites.
- For CJS/unknown dependencies (not rewritten), D111529091's live
  `metroImportDefault` is still what provides default-import liveness. Both paths
  are needed.
- Because the rewrite removes helper calls that would otherwise pay the live
  helper's cost, it **pays back part of** live bindings' +3.2% bytecode. The two
  should be measured together, not independently.

### Ordering / caching — verified safe

`inline-requires` runs at **transform** time; the rewrite runs at **serialize**
time on already-cached transform output. So the rewrite cannot be defeated by
use-site memoization, and it cannot poison the transform cache.
`unstable_liveBindings` *is* part of the transform cache key and graph id
(`getGraphId.js`, `transformHelpers.js`, `Transformer.js`), so control and
treatment artifacts cannot be confused. `unstable_esmDefaultImportRewrite` is
derived at bundle time from `unstable_staticHermesOptimizedRequire` and is
deliberately *not* a transform-cache input — it only affects serialization.

### Known limitation: dev bundles are not rewritten

In dev builds `keepRequireNames` is on (`keepRequireNames: options.dev`), so
`collectDependencies` appends a debug name:

```js
_$$_IMPORT_DEFAULT(depMap[0], "./x")
```

The rewrite matches only the **single-argument** form, so dev bundles keep the
interop helper. This is intentional — the rewrite targets optimized/production
bundles, which is also the only place `unstable_staticHermesOptimizedRequire`
applies — but it means **you cannot validate the rewrite in a dev bundle.** Pinned
by a test (`does NOT rewrite when a dev-only debug name argument is present`).

Also note the replacement is always exactly 3 bytes shorter than the helper call
for any dependency-map name and uid suffix, so the "would grow → skip" branch is
unreachable in practice; coverage does not silently drop to zero.

## Interaction with inline-requires (lazy evaluation) — critical for startup/TTI

A startup/TTI comparison must credit the inlined baseline for lazy evaluation.
Making bindings live does **not** hoist `require()` to module init:

```js
// snapshot + inline (today's inlined baseline):
var x;
function use() { return (x || (x = _$$_REQUIRE(dep).x)) + x; }   // lazy, memoized VALUE (snapshot)

// live + inline:
var _dep;
function use() { return (_dep || (_dep = _$$_REQUIRE(dep))).x + _dep.x; }  // lazy, memoized MODULE, LIVE member
```

The `require()` call sits in the identical position inside the identical lazy
memoization guard in both, so the live variant evaluates the **same module
factories at the same time** as the snapshot baseline. The residual cost is
per-read (a member load vs a cached local) and per-write (republish), not extra
module evaluation.

Corollary (a *win* for live): for modules with **multiple** named imports, the
snapshot path destructures eagerly at module top, requiring `dep` when the
importer's factory runs. The live path keeps member loads at use sites, so
inline-requires can defer them — live is *lazier* for multi-import modules.

## Turning it on for a build

- **Metro CLI / `react-native bundle`:** `--transform-option unstable_liveBindings=true`
- **Programmatic:** `customTransformOptions: {unstable_liveBindings: true}`
- **Metro config:** return it from `transformer.getTransformOptions`

The rewrite needs no separate switch: it turns on with
`unstable_staticHermesOptimizedRequire`.

## OTA / Buck-modifier experiment plan

Goal: ship two OTA bundles of the same app revision and compare HBC size and
startup/TTI on device.

1. **Pre-reqs.** The target must already build with `experimentalImportSupport`
   (live bindings are a no-op otherwise). Turn
   `unstable_staticHermesOptimizedRequire` on in **both** arms, so the only delta
   between control and treatment is `unstable_liveBindings` — otherwise you are
   measuring two changes at once.
2. **Build variants via a Buck modifier** (e.g. `//buck/modifiers:metro_live_bindings`)
   that appends `--transform-option unstable_liveBindings=true` to the Metro bundle
   action. No source change, so the arms are otherwise identical.
3. **Offline proxy first (fast, deterministic):** per variant, compile to HBC
   (`hermes -O -emit-binary -out out.hbc bundle.js`), record `wc -c out.hbc`, then
   replay a TTI-marker trace through `hermes_synth`
   (`buck run @xplat/mode/hermes/opt hermes_synth -- trace.json out.hbc -marker=<tti_marker>`).
4. **Confirm the rewrite actually fired** on the treatment bundle before trusting
   any number: grep the optimized bundle for `_$$_IMPORT_DEFAULT` and for
   `).default`, and record the ratio. If the helper count is unchanged, the rewrite
   did not apply (most likely a dev-mode bundle, or ESM detection returned nothing)
   and the experiment is invalid.
5. **On-device confirmation:** the relevant MobileLab TTI test (e.g.
   `fb4a.marketplace_cold_start`, metric `hermesTime`) or a QPL-instrumented cold
   start, control vs treatment.

## Measured cost of the transform (2000-module synthetic ESM graph)

Live bindings only, **without** the default-import rewrite. `hermesc -O -emit-binary`:

| Bundle | JS bytes | HBC bytes |
|---|---|---|
| snapshot (flag off = today's Metro) | 1,172,027 | 877,541 |
| live (flag on) | 1,200,689 | 905,661 |
| **delta** | **+28,662 (+2.4%)** | **+28,120 (+3.2%)** |

**Whole-bundle eval time** (real Hermes VM, 25 runs, median, against an
empty-loader baseline):

| Bundle | total (ms) | graph eval (ms, minus baseline) |
|---|---|---|
| empty loader | 24.90 | — |
| snapshot | 35.29 | 10.40 |
| live | 35.88 | 10.98 |

Live adds **+0.59 ms (+5.6%)** of graph-eval time for 2000 modules.

**Heap** (`-gc-print-stats`): total allocated 1,316,808 → 1,348,808 (**+32 KB,
+2.4%**); peak RSS effectively identical (~26 MB, VM-dominated).

These numbers are an upper-ish bound (every module has a reassigned export) and
predate the rewrite, which should claw back some of the bytecode delta. **Re-measure
the combined stack before quoting a number for the OTA decision.**

### Unconditional cost when the flag is OFF

D111529091 is *not* byte-for-byte free at the bundle level, even though the
transform output is unchanged. The live-`metroImportDefault` branch and its
prelude-global read ship in `metro-runtime`'s `require.js` polyfill for **every**
bundle, flag on or off: **~+320 bytes JS / ~+170 bytes** on the metro-buck e2e
fixture bundle. Snapshots updated accordingly. If that matters, the runtime branch
would need to be stripped at build time rather than gated at runtime.

## Expected impact (from the benchmark suite, D111143093)

- **Reads:** in the inlined regime live is ~2.3× faster than the `require().x`
  baseline; in the non-inlined regime it costs ~+30–40% over the bare-local snapshot.
- **Bytecode size:** the live shape is ~1.8× the non-live bare-local per module, but
  smaller than the inlined baseline and ~22% smaller than a Babel-getter design.
- **Startup/init:** the live shape is the cheapest live option to construct, ~3×
  cheaper than Babel getters.

## Do we need the Hermes change (D111629267)?

Probably **not for this experiment.** Once default imports of ES modules are
rewritten to `require(dep).default`, they already lower to plain `CallRequire` and
hit the existing `moduleExports_` cache in master. A dedicated
`CallRequireImportDefault` opcode would only help the *CJS/unknown* sites that keep
the interop helper.

Keeping it off the critical path also removes a Hermes **runtime** change from an
OTA experiment, which is much cheaper to ship. The prototype is therefore parked as
a side branch. Before it could land on its own it needs: a real build + test run
(its test plan is still "TODO"), plus JIT (`lib/VM/JIT/arm64/JitEmitter.cpp`) and
SH-native (`lib/BCGen/SH/SH.cpp`, `_sh_ljs_callRequire`) paths — it currently
covers only the interpreter and HBC ISel, so as written it is a bytecode-only
optimization.

## Remaining follow-ups

- Publish all four metro diffs and get reviewers (all are `Unpublished`, blocker
  `revision_not_accepted`); D111529091 still needs a test plan.
- Namespace imports (`metroImportAll`) remain non-live — separate change.
- Build the Buck modifier and run steps 3–5 above.
- Re-measure size/TTI for the **combined** stack (rewrite + live bindings).
- Decide whether the unconditional runtime cost above is acceptable.
