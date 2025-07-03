// Declare ambient modules for external packages that do not ship with TypeScript
// NOTE: We intentionally do not define wildcard declarations for the
// `@ember/*` and `@glimmer/*` module specifiers here. Those typings are
// supplied by `ember-source` which is already included via the `types` field
// in each package's tsconfig. If your editor still reports unresolved Ember
// modules, make sure it is honoring the project-level tsconfig paths.

declare module 'ember-concurrency' {
    export const task: any;
    const mod: any;
    export default mod;
}

declare module 'ember-window-mock' {
    const mod: any;
    export = mod;
}

declare module 'safe-stable-stringify' {
    const stringify: (obj: any) => string;
    export = stringify;
}

declare module 'tracked-built-ins' {
    export class TrackedMap<K, V> extends Map<K, V> { }
    export class TrackedArray<T> extends Array<T> { }
    /**
     * Minimal polyfill for the `@glimmer/tracking`‐powered TrackedObject used by
     * Boxel. It behaves like a POJO but notifies Glimmer of changes.
     */
    export class TrackedObject<T extends object = Record<string, unknown>> {
        constructor(initial?: T);
        [key: string]: any;
    }
}

declare module '@sentry/node' {
    const mod: any;
    export = mod;
}

// We also omit declarations for 'matrix-js-sdk' and the OpenAI client path so that
// we can use the rich type information they already provide.

// Note: we intentionally do not declare modules for '@cardstack/runtime-common'
// or its sub-paths, or for the remote `https://cardstack.com/base/*` specifiers
// because these are real, typed modules that live within the monorepo and we
// want the TypeScript compiler to resolve their actual exports.

// Provide minimal typings for things the codebase uses from these libraries

declare module 'matrix-js-sdk' {
    /**
     * Minimal subset of the full MatrixEvent interface required by this codebase.
     * We purposefully keep it loose – for richer typings you should depend on the
     * official `matrix-js-sdk` types instead.
     */
    export interface MatrixEvent {
        event: any;
        getContent(): any;
        getType(): string;
        getId(): string;
        room_id?: string;
        sender?: string;
        content?: any;
        type?: string;
    }
}

declare module 'openai/resources/chat/completions' {
    /**
     * Partial shape of the tool-call object the codebase references.
     * Expand as needed.
     */
    export interface ChatCompletionMessageToolCall {
        id: string;
        type: 'function';
        function: {
            name: string;
            arguments: string;
        };
    }
}

// Generic fallbacks for any untyped Ember module that might leak through
declare module '@ember/*' {
    const value: any;
    export default value;
    export = value;
}

declare module '@glimmer/*' {
    const value: any;
    export default value;
    export = value;
}

// Allow importing runtime-common helpers directly from packages without type errors
// NOTE: We intentionally do not add ambient declarations for
// `@cardstack/runtime-common` because the real package in the monorepo already
// provides rich typings. Adding a wildcard here would mask those.

// Fallback for in-repo bare specifiers that might escape type checking
declare module '@cardstack/host/*' {
    const mod: any;
    export = mod;
}