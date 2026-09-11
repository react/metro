#!/bin/bash
# Copyright (c) Meta Platforms, Inc. and affiliates.
#
# This source code is licensed under the MIT license found in the
# LICENSE file in the root directory of this source tree.

echo "Trying to publish the package to npm for tag $RAW_TAG_NAME"

# Validate tag's format follows conventions eg v0.1.22 or v0.90.2-alpha.5
if [[ "$RAW_TAG_NAME" =~ ^v[0-9]+(\.[0-9]+){2}(-.*)?$ ]]; then
  echo "The tag is valid.";
else
  echo "ERROR: The tag's format is wrong.";
  exit 1
fi

# Does main contain this tag? (regular release workflow)
git fetch origin main
TAG_ON_MAIN=$(git branch -a --contains "$RAW_TAG_NAME" | grep -cFx '  remotes/origin/main' || true)
echo "Tag is on main branch: $TAG_ON_MAIN"

# See https://github.com/react/metro/pull/1086 regarding handling of hotfix tags
# Deduce the expected name of a release branch for a tag based on Metro's release branch naming convention, eg v0.1.2-alpha.3 -> 0.1.x
RELEASE_BRANCH=$(echo "$RAW_TAG_NAME" | awk -F. '{print substr($1, 2) "." $2 ".x"}')

# Does a release branch contain this tag? (hotfix workflow)
git fetch origin ${RELEASE_BRANCH}
TAG_ON_RELEASE_BRANCH=$(git branch -a --contains "$RAW_TAG_NAME" | grep -cFx "  remotes/origin/$RELEASE_BRANCH" || true)
echo "Tag is on release branch $RELEASE_BRANCH: $TAG_ON_RELEASE_BRANCH"

if [ $TAG_ON_RELEASE_BRANCH -eq $TAG_ON_MAIN ]; then
    echo "Could not determine whether this tag is 'latest' or a hotfix. Aborting."
    exit 1
fi

NPM_TAG="latest"
# Use a tag name like "0.123-stable" as the dist-tag for a hotfix. This *must not* be valid semver.
[ "$TAG_ON_RELEASE_BRANCH" -eq 1 ] && NPM_TAG="${RELEASE_BRANCH%.x}-stable"

echo "Publishing with --tag=$NPM_TAG"

npm run publish --tag="$NPM_TAG"
