// Custom ambient type declarations for test and Ember shims that are
// required in the workspace but do not ship with their own TypeScript
// typings. These are intentionally minimal: they expose just enough of the
// public surface area that the code under test relies on. If fuller typings
// become available these can be removed.

/* ------------------------------------------------------------------
 * QUnit – testing framework used in many packages
 * ------------------------------------------------------------------ */
declare module 'qunit' {
    /**
     * Registers a test module. We model the signature loosely to cover the
     * common usages in the code-base (name and hooks object).
     */
    export function module(
        name: string,
        hooks?: Record<string, unknown>,
        callback?: (hooks: Record<string, unknown>) => void,
    ): void;

    /**
     * Registers an individual test. The real signature is more complex but an
     * `any` assert parameter is sufficient for our purposes here.
     */
    export function test(
        name: string,
        callback: (assert: any) => void | Promise<void>,
    ): void;

    /**
     * Direct import of the assert API is occasionally used. It is loosely typed
     * as `any` to keep things simple.
     */
    export const assert: any;
}

/* ------------------------------------------------------------------
 * Ember – minimal shim for getOwner utility
 * ------------------------------------------------------------------ */
declare module '@ember/application' {
    /**
     * Retrieves the Ember owner (dependency-injection container) for a given
     * context. We return `any` here because callers typically rely on dynamic
     * lookups.
     */
    export function getOwner(context: unknown): any;
}

/* ------------------------------------------------------------------
 * Ember shims
 * ------------------------------------------------------------------ */
declare module '@ember/owner' {
    export type Owner = any;
}

declare module '@ember/routing/router-service' {
    export default class RouterService {
        transitionTo(...args: any[]): void;
        replaceWith(...args: any[]): void;
        refresh(): void;
    }
}

declare module '@ember/runloop' {
    export function scheduleOnce(queue: string, target: any, method: any, ...args: any[]): void;
    export function debounce(target: any, method: any, wait: number): void;
}

declare module '@ember/service' {
    export default class Service { }
    export function service(name?: string): any;
}

declare module '@glimmer/tracking' {
    export function tracked(target: any, key: string): any;
    export function cached(target: any, key: string, descriptor: PropertyDescriptor): any;
}

declare module 'ember-concurrency' {
    export function task(generator: any): any;
    export function restartableTask(generator: any): any;
    export function dropTask(generator: any): any;
    export function timeout(ms: number): Promise<void>;
}

declare module 'ember-window-mock' {
    const windowMock: any;
    export default windowMock;
}

declare module 'safe-stable-stringify' {
    export default function stringify(value: any): string;
}

declare module 'tracked-built-ins' {
    export class TrackedMap<K, V> extends Map<K, V> { }
    export class TrackedArray<T> extends Array<T> { }
    export class TrackedObject<T = Record<string, any>> {
        [key: string]: any;
    }
}

/* ------------------------------------------------------------------
 * Cardstack runtime and helpers (lightweight shims)
 * ------------------------------------------------------------------ */
declare module '@cardstack/runtime-common' {
    export const logger: any;
    export const aiBotUsername: string;
    export const DEFAULT_LLM: string;
    export const APP_BOXEL_STOP_GENERATING_EVENT_TYPE: string;
}

declare module '@cardstack/runtime-common/*' {
    const value: any;
    export = value;
}

declare module '@cardstack/postgres' {
    export class PgAdapter { }
}

/* ------------------------------------------------------------------
 * Matrix SDK minimal shims
 * ------------------------------------------------------------------ */
declare module 'matrix-js-sdk' {
    export enum EventStatus {
        SENT,
    }
    export type MatrixEvent = any;
    export interface RoomMember { }
    export interface Filter {
        setDefinition(def: any): void;
    }
    export interface ClientEvent {
        AccountData: string;
    }
    export const Filter: {
        new(userId: string, name: string): Filter;
    };
    export function createClient(opts: any): any;
}

declare module 'matrix-js-sdk/lib/sliding-sync' {
    export enum SlidingSyncState { }
    export type MSC3575List = any;
    export class SlidingSync {
        constructor(baseUrl: string, lists: any, opts: any, client: any, timeout: number);
    }
}

/* ------------------------------------------------------------------
 * OpenAI client minimal shims
 * ------------------------------------------------------------------ */
declare module 'openai' {
    export default class OpenAI {
        constructor(opts: any);
        beta: any;
    }
}

declare module 'openai/error' {
    export class OpenAIError extends Error { }
    export default OpenAIError;
}

declare module 'openai/resources/chat/completions' {
    export type ChatCompletionMessageToolCall = any;
}

declare module 'openai/lib/ChatCompletionStream.mjs' {
    export class ChatCompletionStream {
        on(event: string, handler: any): ChatCompletionStream;
        abort(): void;
        finalChatCompletion(): Promise<void>;
    }
}

/* ------------------------------------------------------------------
 * URL-based cardstack imports (wildcard)
 * ------------------------------------------------------------------ */
declare module 'https://cardstack.com/base/*' {
    const value: any;
    export = value;
}