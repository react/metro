---
name: metro-release
description: Draft a react/metro GitHub release — build a changelog from commits since the last tag and create a draft release.
disable-model-invocation: true
---

# New Metro Release

## Overview

Creates a **draft** GitHub release for [`react/metro`](https://github.com/react/metro) by reading commits since the last tag and turning them into a labeled changelog. The release process is manual; this skill automates the mechanical parts (diffing commits, fetching PR/author metadata, formatting notes) and leaves the editorial judgment to you.

**Source of truth is the `react/metro` remote on GitHub, not your local checkout.** Always fetch fresh before diffing.

**Never publish.** Always create the release as a draft and stop. A human reviews and publishes.

## Step 1 — Sync from react/metro

Fetch the canonical tags and `main` directly from `react/metro` so the diff is authoritative regardless of how your local remotes are configured:

```bash
git fetch https://github.com/react/metro.git main --tags
```

Find the latest release tag (tags are `vMAJOR.MINOR.PATCH`, e.g. `v0.84.4`):

```bash
LAST_TAG=$(git tag --list 'v*' --sort=-v:refname | head -1)
echo "$LAST_TAG"
```

## Step 2 — List candidate commits

```bash
git log --oneline "$LAST_TAG"..FETCH_HEAD
```

Squash-merged PRs end with `(#NNNN)`. Use the PR number to pull the title, URL, and author's GitHub login:

```bash
gh pr view <NNNN> --repo react/metro --json title,url,author -q '.author.login + " | " + .url + " | " + .title'
```

For a direct commit with no PR, link the commit instead: `https://github.com/react/metro/commit/<sha>`.

## Step 3 — Decide which commits to include

Include only **observable, public-facing** changes. Map each to a label:

| Label | When |
|---|---|
| `[Breaking]` | Any semver-major / backwards-incompatible change |
| `[Deprecated]` | A public feature or API marked deprecated |
| `[Feature]` | New API or observable capability |
| `[Fix]` | Fix for an observable bug |
| `[Performance]` | Non-functional change that observably improves performance |
| `[Types]` | Additions/improvements to Flow or TypeScript coverage for public APIs |
| `[Experimental]` | Changes to experimental features (e.g. `unstable_`-prefixed config) — see below |

**Exclude** (no changelog entry):
- Meta-internal sync commits — `Deploy X.Y.Z to xplat`, and anything with no observable OSS effect.
- Flow version upgrades, reformatting, refactors with no behavior change.
- Tests, CI, website/docs-only changes.

Judgment notes:
- One commit can produce multiple entries; one entry can reference multiple related commits/PRs. 1-to-1 is typical.
- Reword commit titles for clarity when needed.
- When unsure whether something is user-facing, lean toward including it (and bumping minor).

## Step 4 — Decide the version

Semantic versioning with the **major pinned at 0**:
- **Any breaking change** → bump the **minor** (`0.84.4` → `0.85.0`).
- **Otherwise** (fixes, new features, perf, types — all backwards-compatible) → bump the **patch** (`0.84.4` → `0.84.5`).

The tag and the release title are both the `v`-prefixed version, e.g. `v0.84.5`.

Changes to experimental features are **never** treated as breaking, even if they break between versions.

## Step 5 — Build the release notes

Match the established format exactly. Each entry: `` - **[Label]**: description (PR-or-commit-URL by @author)``. Always @-mention the author's GitHub login. If an author has no linked GitHub account, fall back to their full name.

```markdown
 - **[Feature]**: Support `/[metro-watchFolders]/n/` paths for `.bundle` and `.map` requests (https://github.com/react/metro/pull/1695 by @huntie)
 - **[Fix]**: Treat `import().catch()` as optional under `transformer.allowOptionalDependencies` (https://github.com/react/metro/pull/1697 by @robhogan)
 - **[Performance]**: Interleave resolution attempts with building node_modules candidate paths (https://github.com/react/metro/commit/a817960e5d783c9463173aa84c0245e5864bb5a8 by @kitten)

 **Full Changelog**: https://github.com/react/metro/compare/<LAST_TAG>...<NEW_TAG>
```

Put experimental entries in a **separate list** below the main changelog, under this exact disclaimer:

```markdown
> NOTE: Experimental features are not covered by semver and can change at any time.

 - **[Experimental]**: ... (URL by @author)
```

## Step 6 — Create the draft release (or fall back to a file)

Always write the notes to a file first (preserves Markdown):

```bash
NOTES_FILE=/tmp/metro-release-notes.md   # write the changelog here
```

Then check whether you can actually create the release. You need `gh` authenticated **and** write/admin access to `react/metro`:

```bash
gh auth status >/dev/null 2>&1 \
  && gh api repos/react/metro --jq '.permissions.push' 2>/dev/null
# prints "true" only if authenticated with write access
```

**If that prints `true`** — create the draft. The tag does not need to exist yet; for a draft, GitHub creates it on publish.

```bash
gh release create <NEW_TAG> \
  --repo react/metro \
  --draft \
  --target main \
  --title <NEW_TAG> \
  --notes-file "$NOTES_FILE"
```

Print the draft URL from the command output and **stop**. Do not publish — a human reviews and publishes.

**If `gh` is not authenticated, or push access is missing/`false`** — do not attempt the API call. Fall back to the manual path:

1. Leave the formatted notes in `$NOTES_FILE` and print its path.
2. Tell the user to open https://github.com/react/metro/releases/new, set the tag to `<NEW_TAG>`, target `main`, title `<NEW_TAG>`, paste the notes, and **Save draft** (not publish).
3. If `gh` is installed but unauthenticated, mention they can run `! gh auth login` and re-run this skill to automate it; if they lack write access, they need admin/maintainer permission on `react/metro` first.
