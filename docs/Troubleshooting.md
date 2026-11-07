---
id: troubleshooting
title: Troubleshooting
---

Uh oh, something went wrong? Try these steps in order, checking after each one whether the issue is resolved.

1. **Clear Watchman watches:** `watchman watch-del-all`

   If you use [Watchman](https://facebook.github.io/watchman/), this helps when Metro doesn't [pick up file changes](./Concepts.md#file-watching), or reports errors about files you've added, moved or deleted.

2. **Reinstall dependencies:** delete `node_modules` and run `yarn install` (or your package manager's equivalent).

   Helps when a package can't be found or is in a broken state, e.g. after switching branches or upgrading dependencies.

3. **Reset Metro's cache:** pass the `--reset-cache` flag (e.g. `npx react-native start --reset-cache`), or add [`resetCache: true`](./Configuration.md#resetcache) to your Metro configuration file.

   This clears Metro's [cache](./Caching.md) of transformed files and rebuilds its map of your project's files from scratch. Helps when the bundle doesn't reflect your latest code or configuration.

4. **Delete Metro's cache files:** `rm -rf ${TMPDIR:-/tmp}/metro-*`

   Try this if resetting the cache didn't help. It removes the cache files Metro keeps in your temp directory by default.

5. **Update Metro** to the [latest version](https://www.npmjs.com/package/metro), in case your issue has been fixed in a newer release.

## Still unresolved?

See the [Help](/help) pages.
