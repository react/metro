---
id: local-development
title: Local Development Setup
---

This page includes tips for developers working on Metro itself, including how to test your changes within other local projects.

### Testing Metro Changes inside a React Native Project

When developing Metro, running your iterations against a local target project can be a great way to test the impact of your changes end-to-end.

Our recommended workflow is to use [`yarn link`][1] to register local `metro` packages within your development clone and then hot-switch to these versions in the consuming project. These instructions cover linking a local Metro clone with a bare workflow React Native app (i.e. having run `npx react-native init MetroTestApp`).

```sh
.
└── Development
    ├── metro        # metro clone
    └── MetroTestApp # target project
 ```

1. **Use `yarn link` in your `metro` clone to register local packages**

    From inside our `metro` clone, `yarn link` is responsible for registering local package folders to be linked to elsewhere.

    We recommend using `npm exec --workspaces` to register all packages in the `metro` repo — these can be individually linked into the target project later.
    ```sh
    npm exec --workspaces -- yarn link
    ```
2. **Use `yarn link` to replace Metro packages in your target project**

    From inside our target project folder, `yarn link <package-name>` can be used to apply our registered `metro` packages for that project only.

    ```sh
    # Links 3 packages
    yarn link metro metro-config metro-runtime
    ```

    Note: At mininum, the `metro` and `metro-runtime` packages need to be linked.

3. **Configure Metro `watchFolders` to work with our linked packages**

    Because `yarn link` has included files outside of the immediate React Native project folder, we need to inform Metro that this set of files exists. Metro follows symlinks, but a symlink's target must itself be within `projectRoot` or `watchFolders` to be resolvable. Add the following to your `metro.config.js`:

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

    **Run Metro**

    Now we should be able to run Metro within our target project. Remember to restart this command after any code changes you make to `metro` or to the target project's `metro.config.js` file.

   ```sh
   yarn react-native start
   ```

4. **(Optional) Clean up with `yarn unlink`**

    If you want to restore the remote (i.e. production npm) versions of `metro` packages in your target project, step 2 (and 1) can be repeated with `yarn unlink`.

### Debug Logging

Metro uses the [debug](https://www.npmjs.com/package/debug) package to write logs under named debug scopes (for example: `Metro:WatchmanWatcher`). Set the `DEBUG` environment variable before starting Metro to enable logs matching the supplied pattern.

The snippet below provides a pattern matching all Metro-defined messages.
```sh
DEBUG='Metro:*' yarn metro serve
```
[1]: https://classic.yarnpkg.com/en/docs/cli/link
