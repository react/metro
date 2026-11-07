/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 * @format
 * @oncall react_native
 */

// Subsets of `react-dom/client` and `@testing-library/react` used by Metro.

declare module 'react-dom/client' {
  import type {Node} from 'react';

  declare export type ErrorInfo = {readonly componentStack?: ?string, ...};

  declare export type RootOptions = {
    identifierPrefix?: string,
    onCaughtError?: (error: unknown, errorInfo: ErrorInfo) => void,
    onRecoverableError?: (error: unknown, errorInfo: ErrorInfo) => void,
    onUncaughtError?: (error: unknown, errorInfo: ErrorInfo) => void,
  };

  declare export type Root = {
    render(children: Node): void,
    unmount(): void,
  };

  declare module.exports: {
    createRoot(
      container: Element | DocumentFragment,
      options?: RootOptions,
    ): Root,
    hydrateRoot(
      container: Element | Document | DocumentFragment,
      initialChildren: Node,
      options?: RootOptions,
    ): Root,
  };
}

declare module '@testing-library/react/pure' {
  import type {ComponentType, Node} from 'react';

  declare export type MatcherFunction = (
    content: string,
    element: Element | null,
  ) => boolean;

  declare export type Matcher = MatcherFunction | RegExp | number | string;

  declare export type SelectorMatcherOptions = {
    collapseWhitespace?: boolean,
    exact?: boolean,
    ignore?: boolean | string,
    normalizer?: (text: string) => string,
    selector?: string,
    suggest?: boolean,
    trim?: boolean,
  };

  declare export type BoundQueries = {
    getByText: (text: Matcher, options?: SelectorMatcherOptions) => HTMLElement,
    queryByText: (
      text: Matcher,
      options?: SelectorMatcherOptions,
    ) => HTMLElement | null,
    ...
  };

  declare export type RenderOptions = {
    baseElement?: HTMLElement,
    container?: HTMLElement,
    hydrate?: boolean,
    wrapper?: ComponentType<{children: Node}>,
  };

  declare export type RenderResult = {
    ...BoundQueries,
    asFragment: () => DocumentFragment,
    baseElement: HTMLElement,
    container: HTMLElement,
    rerender: (ui: Node) => void,
    unmount: () => void,
    ...
  };

  declare export var screen: BoundQueries;

  declare export function render(
    ui: Node,
    options?: RenderOptions,
  ): RenderResult;

  declare export function cleanup(): void;

  declare export function act(callback: () => void): void;
  declare export function act<T>(callback: () => T | Promise<T>): Promise<T>;
}
