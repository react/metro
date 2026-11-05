/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

'use strict';

const {fbContent} = require('docusaurus-plugin-internaldocs-fb/internal');
const fs = require('node:fs');
const path = require('node:path');

// Docusaurus reads docs from one folder, so the root and per-package
// `__docs__` folders are mirrored into `website/.docs`.
const metroRoot = path.resolve(__dirname, '..');
const docsMirror = path.join(__dirname, '.docs');
const docsFolders = [
  '__docs__',
  ...fs
    .readdirSync(path.join(metroRoot, 'packages'))
    .map(pkg => path.join('packages', pkg, '__docs__')),
].filter(dir => fs.existsSync(path.join(metroRoot, dir)));

function mirrorDocs() {
  for (const dir of docsFolders) {
    fs.cpSync(path.join(metroRoot, dir), path.join(docsMirror, dir), {
      recursive: true,
    });
  }
}

fs.rmSync(docsMirror, {recursive: true, force: true});
mirrorDocs();

/** @type {import('@docusaurus/types').Config} */
const siteConfig = {
  presets: [
    [
      require.resolve('docusaurus-plugin-internaldocs-fb/docusaurus-preset'),
      {
        docs: {
          path: '.docs',
          // The default excludes `_`-prefixed folders such as `__docs__`.
          // `__docs__/index.md` lists the docs for readers of the repository.
          exclude: ['__docs__/index.md'],
          // `docPath` mirrors the source path relative to the metro folder.
          editUrl: ({docPath}) =>
            fbContent({
              internal:
                'https://www.internalfb.com/intern/diffusion/FBS/browse/master/xplat/js/tools/metro/',
              external: 'https://github.com/react/metro/edit/main/',
            }) + docPath,
          sidebarPath: require.resolve('./sidebars.json'),
          showLastUpdateTime: fbContent({
            internal: false,
            external: true,
          }),
        },
        theme: {
          customCss: require.resolve('./src/css/custom.scss'),
        },
        staticDocsProject: 'metro',
        enableEditor: true,
        gtag: {
          trackingID: 'G-Q1FRRC47Y6',
          anonymizeIP: true,
        },
      },
    ],
  ],
  plugins: [
    'docusaurus-plugin-sass',
    () => ({
      name: 'metro-docs-mirror',
      getPathsToWatch: () =>
        docsFolders.map(dir => path.join(metroRoot, dir, '*.md')),
      loadContent: mirrorDocs,
    }),
  ],
  title: 'Metro',
  tagline: '\ud83d\ude87 The JavaScript bundler for React Native',
  organizationName: 'react',
  projectName: 'metro',
  url: 'https://metrobundler.dev',
  baseUrl: '/',
  favicon: 'img/favicon.png',
  onBrokenAnchors: 'throw',
  themeConfig: {
    navbar: {
      title: 'Metro',
      logo: {
        alt: 'Metro Logo',
        src: 'img/metro.svg',
      },
      items: [
        {label: 'Docs', to: 'docs/getting-started'},
        {label: 'API', to: 'docs/api'},
        {label: 'Help', to: 'help'},
        {
          label: 'Twitter',
          href: 'https://twitter.com/MetroBundler',
          position: 'right',
        },
        {
          label: 'GitHub',
          href: 'https://github.com/react/metro',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {label: 'Quick Start', to: 'docs/getting-started'},
            {label: 'Configuration', to: 'docs/configuration'},
            {label: 'API Reference', to: 'docs/api'},
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'Twitter',
              href: 'https://twitter.com/MetroBundler',
            },
            {
              label: 'GitHub',
              href: 'https://github.com/react/metro',
            },
            {
              label: 'Stack Overflow',
              href: 'https://stackoverflow.com/questions/tagged/metrojs',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'React Native',
              href: 'https://reactnative.dev/',
            },
            {
              label: 'Privacy Policy',
              href: 'https://opensource.fb.com/legal/privacy/',
            },
            {
              label: 'Terms of Service',
              href: 'https://opensource.fb.com/legal/terms/',
            },
          ],
        },
      ],
      logo: {
        alt: 'Meta Open Source Logo',
        src: 'img/oss_logo.svg',
        href: 'https://opensource.fb.com/',
      },
      copyright: `Copyright © ${new Date().getFullYear()} Meta Platforms, Inc.`,
    },
    image: 'img/opengraph.png',
    algolia: {
      apiKey: 'd51e7fbd21ccab3db4c83f0f736f6a3a',
      appId: 'T38HJZTD87',
      indexName: 'metro',
    },
    prism: {
      additionalLanguages: ['flow', 'bash', 'json', 'diff'],
    },
  },
  scripts: ['https://buttons.github.io/buttons.js'],
};

module.exports = siteConfig;
