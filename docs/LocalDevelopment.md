---
id: local-development
title: Local Development Setup
---

This page is for contributors to Metro itself.

## Testing Metro Changes inside a React Native Project

To test your changes end-to-end, we recommend using [`yarn link`][1] to register the local packages in your Metro clone, then switching a target project to use them. These instructions cover linking into a React Native app created with `npx @react-native-community/cli init MetroTestApp`, with this directory layout:

```sh
.
└── Development
    ├── metro        # metro clone
    └── MetroTestApp # target project
```

1. **Register local packages with `yarn link` in your `metro` clone**

    `yarn link` registers local package folders so that other projects can link to them. Use `npm exec --workspaces` to register every package in the repo — you choose which ones to link in the next step.

    ```sh
    npm exec --workspaces -- yarn link
    ```

2. **Use `yarn link` to replace Metro packages in your target project**

    Inside your target project folder, run `yarn link <package-name>` to use your registered `metro` packages in that project only. At minimum, link the `metro` and `metro-runtime` packages.

    ```sh
    # Links 3 packages
    yarn link metro metro-config metro-runtime
    ```

3. **Add the linked packages to Metro's `watchFolders`**

    The linked packages live outside the target project folder. Metro follows symlinks, but their targets must be within [`watchFolders`](./Concepts.md#project-root-and-watch-folders), so add to your `metro.config.js`:

    ```diff
    + const path = require('path');

      module.exports = {
    +   watchFolders: [
    +     path.resolve(__dirname, './node_modules'),
    +     // Include necessary file paths for `yarn link`ed modules
    +     path.resolve(__dirname, '../metro/packages'),
    +     path.resolve(__dirname, '../metro/node_modules'),
    +   ],
        ...
      };
    ```

4. **Run Metro**

    Start Metro from your target project. Restart it after any change to your `metro` clone or to the target project's `metro.config.js`.

    ```sh
    yarn react-native start
    ```

5. **(Optional) Clean up with `yarn unlink`**

    To go back to the published npm versions of the `metro` packages in your target project, repeat step 2 (and optionally step 1) with `yarn unlink`.

## Debug Logging

Metro uses the [debug](https://www.npmjs.com/package/debug) package to write logs under named debug scopes (e.g. `Metro:WatchmanWatcher`). To enable logs whose scope matches a pattern, set the `DEBUG` environment variable when starting Metro, e.g. for all of Metro's logs:

```sh
DEBUG='Metro:*' yarn metro serve
```

Separate multiple patterns with commas, e.g. for only file map and file watching logs:

```sh
DEBUG='Metro:FileMap,Metro:*Watcher' yarn metro serve
```

[1]: https://classic.yarnpkg.com/en/docs/cli/link
