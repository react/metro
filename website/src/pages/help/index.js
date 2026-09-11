/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import Layout from '@theme/Layout';
import * as React from 'react';

const supportLinks = [
  {
    title: 'Browse the docs',
    summary:
      "Find what you're looking for in our detailed documentation and guides",
    content: (
      <ul>
        <li>
          Learn how to <a href="/docs/getting-started">get started</a> with
          Metro.
        </li>
        <li>
          <a href="/docs/troubleshooting">Troubleshoot</a> problems with Metro.
        </li>
        <li>
          Learn how to <a href="/docs/configuration">configure Metro</a>.
        </li>
        <li>
          Look at the full <a href="/docs/api">API Reference</a>.
        </li>
      </ul>
    ),
  },
  {
    summary: 'Ask questions and find answers from other Metro users like you.',
    title: 'Join the community',
    content: (
      <ul>
        <li>
          Join the{' '}
          <a href="https://discordapp.com/channels/102860784329052160/103622435865104384">
            #metro
          </a>{' '}
          channel on <a href="http://www.reactiflux.com/">Reactiflux</a>, a
          Discord community.
        </li>
        <li>
          Many members of the community use Stack Overflow. Read through the{' '}
          <a href="https://stackoverflow.com/search?q=metro+bundler">
            existing questions
          </a>{' '}
          or <a href="https://stackoverflow.com/questions/ask">ask your own</a>!
        </li>
      </ul>
    ),
  },
  {
    title: 'Stay up to date',
    summary: "Find out what's new with Metro.",
    content: (
      <ul>
        <li>
          Follow <a href="https://twitter.com/MetroBundler">Metro</a> on
          Twitter.
        </li>
        <li>
          Browse our{' '}
          <a href="https://github.com/react/metro/releases">
            latest releases on GitHub
          </a>
          .
        </li>
      </ul>
    ),
  },
];

const Help = () => {
  return (
    <Layout title="Help">
      <div className="container margin-vert--lg">
        <header className="postHeader">
          <h2>Need help?</h2>
        </header>
        <p>
          Metro is worked on by Facebook's React Native team. Team members are
          often around and available for questions.
        </p>

        <div className="row">
          {supportLinks.map(({content, summary, title}, i) => {
            return (
              <div
                key={`help-column-${i}`}
                className="col col--4 margin-vert--md">
                <h2>{title}</h2>
                <p>{summary}</p>
                {content}
              </div>
            );
          })}
        </div>
      </div>
    </Layout>
  );
};

export default Help;
