// NOTE: We intentionally do not define wildcard declarations for the
// `@ember/*` and `@glimmer/*` modules here—`ember-source` already provides
// those typings.

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
    export interface ChatCompletionMessageToolCall {
        id: string;
        type: 'function';
        function: {
            name: string;
            arguments: string;
        };
    }
}