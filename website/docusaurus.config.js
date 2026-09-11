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

/** @type {import('@docusaurus/types').Config} */
const siteConfig = {
  presets: [
    [
      require.resolve('docusaurus-plugin-internaldocs-fb/docusaurus-preset'),
      {
        docs: {
          path: '../docs',
          editUrl: fbContent({
            internal:
              'https://www.internalfb.com/intern/diffusion/FBS/browse/master/xplat/js/tools/metro/docs/',
            external: 'https://github.com/react/metro/edit/main/docs',
          }),
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
  plugins: ['docusaurus-plugin-sass'],
  title: 'Metro',
  tagline: '\ud83d\ude87 The JavaScript bundler for React Native',
  organizationName: 'facebook',
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
