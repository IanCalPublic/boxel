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
        callback: (hooks: Record<string, unknown>) => void,
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
     * DI container/owner interface – we only model the lookup method used in
     * tests and code for service retrieval.
     */
    export interface Owner {
        lookup(name: string): any;
    }

    /**
     * Utility to fetch the owner from an Ember object (component/service etc.)
     */
    export function getOwner(context: unknown): Owner;
}

/* ------------------------------------------------------------------
 * Ember shims
 * ------------------------------------------------------------------ */
declare module '@ember/owner' {
    export type Owner = any;
}

declare module '@ember/routing/router-service' {
    /** Minimal RouterService API used in the code-base */
    export default class RouterService {
        transitionTo(...args: unknown[]): void;
        replaceWith(...args: unknown[]): void;
        refresh(): void;
        currentURL: string;
    }
}

declare module '@ember/runloop' {
    /**
     * Schedule a one-off function to run in a specific queue.
     */
    function scheduleOnce(
        queue: string,
        target: unknown,
        method: ((...args: unknown[]) => unknown) | string,
        ...args: unknown[]
    ): void;

    /**
     * Debounce calls to a method.
     */
    function debounce(
        target: unknown,
        method: ((...args: unknown[]) => unknown) | string,
        wait: number,
    ): void;
}

declare module '@ember/service' {
    /** Base class for Ember service singletons */
    export default class Service { }
    /** Decorator factory */
    export function service(name?: string): PropertyDecorator;
}

declare module '@glimmer/tracking' {
    /** Makes a property observable for autotracking. */
    export function tracked(target: object, key: string | symbol, descriptor?: PropertyDescriptor): void;
    /** Memoizes the result of a getter until tracked dependencies change. */
    export function cached(target: object, key: string | symbol, descriptor: PropertyDescriptor): void;
}

declare module 'ember-concurrency' {
    export function task(generatorFunc: (...args: unknown[]) => unknown): any;
    export function restartableTask(generatorFunc: (...args: unknown[]) => unknown): any;
    export function dropTask(generatorFunc: (...args: unknown[]) => unknown): any;
    export function timeout(ms: number): Promise<void>;
}

declare module 'ember-window-mock' {
    const windowMock: Window & typeof globalThis;
    export default windowMock;
}

declare module 'safe-stable-stringify' {
    export default function stringify(value: unknown): string;
}

declare module 'tracked-built-ins' {
    export class TrackedMap<K, V> extends Map<K, V> { }
    export class TrackedArray<T> extends Array<T> { }
    export class TrackedObject<T extends Record<string, unknown> = Record<string, unknown>> {
        [key: string]: unknown;
    }
}

/* ------------------------------------------------------------------
 * Node utility stubs – fs-extra & path (already declared) augment Buffer
 * ------------------------------------------------------------------ */
declare module 'fs-extra' {
    type PathLike = string;
    // eslint-disable-next-line @typescript-eslint/ban-types
    interface Buffer extends Uint8Array { readonly buffer: ArrayBufferLike }
    export function readFileSync(path: PathLike | number, options?: any): string | Buffer;
}

/* ------------------------------------------------------------------
 * Cardstack runtime-common additional symbols
 * ------------------------------------------------------------------ */
declare module '@cardstack/runtime-common' {
    export interface RealmPaths {
        new(url: URL): RealmPaths;
        local(path: URL): string;
        inRealm(path: URL): boolean;
    }
    export const baseRealm: { url: string };
    export type LooseCardResource = any;
    export type ResolvedCodeRef = { module: string; name: string };
    export class Deferred<T = unknown> {
        promise: Promise<T>;
        fulfill(value: T | PromiseLike<T>): void;
        reject(reason?: unknown): void;
    }
    export function getMatrixUsername(userId: string): string;

    /* Additional data structures used throughout the code-base */
    export interface LooseSingleCardDocument {
        data: LooseCardResource;
    }
    export interface CardResource {
        id?: string;
        type?: string;
        attributes?: Record<string, unknown>;
        relationships?: Record<string, unknown>;
        meta?: Record<string, unknown>;
    }

    /* Marker constants used when eliding code patches */
    export const SEARCH_MARKER: string;
    export const SEPARATOR_MARKER: string;
    export const REPLACE_MARKER: string;
}

/* ------------------------------------------------------------------
 * Cardstack runtime-common modules
 * ------------------------------------------------------------------ */

declare module '@cardstack/runtime-common' {
    export const logger: (ns?: string) => (...args: any[]) => void;
    export const aiBotUsername: string;

    /** Default LLM model id */
    export const DEFAULT_LLM: string;

    // Matrix helpers
    export const APP_BOXEL_STOP_GENERATING_EVENT_TYPE: string;
    // Many other constants are re-exported from matrix-constants, we don't repeat them here.
}

declare module '@cardstack/runtime-common/helpers/ai' {
    /** Used to indicate to the LLM which tool to call. */
    export type ToolChoice = 'auto' | { name: string };
    export function getPatchTool(...args: any[]): any;
}

declare module '@cardstack/runtime-common/matrix-constants' {
    // Expose only the constants referenced inside ai-bot & host packages.
    export const APP_BOXEL_MESSAGE_MSGTYPE: string;
    export const APP_BOXEL_COMMAND_REQUESTS_KEY: string;
    export const APP_BOXEL_COMMAND_RESULT_EVENT_TYPE: string;
    export const APP_BOXEL_COMMAND_RESULT_WITH_OUTPUT_MSGTYPE: string;
    export const APP_BOXEL_COMMAND_RESULT_WITH_NO_OUTPUT_MSGTYPE: string;
    export const APP_BOXEL_COMMAND_RESULT_REL_TYPE: string;
    export const APP_BOXEL_CODE_PATCH_RESULT_EVENT_TYPE: string;
    export const APP_BOXEL_CODE_PATCH_RESULT_MSGTYPE: string;
    export const APP_BOXEL_CODE_PATCH_RESULT_REL_TYPE: string;
    export const APP_BOXEL_ROOM_SKILLS_EVENT_TYPE: string;
    export const APP_BOXEL_STOP_GENERATING_EVENT_TYPE: string;
    export const APP_BOXEL_ACTIVE_LLM: string;
    export const SLIDING_SYNC_AI_ROOM_LIST_NAME: string;
    export const SLIDING_SYNC_LIST_TIMELINE_LIMIT: number;
    export const SLIDING_SYNC_TIMEOUT: number;
    export const DEFAULT_LLM: string;
}

/* ------------------------------------------------------------------
 * Cardstack matrix-event definitions (greatly simplified)
 * ------------------------------------------------------------------ */

declare module 'https://cardstack.com/base/matrix-event' {
    import type { ToolChoice } from '@cardstack/runtime-common/helpers/ai';

    // A very loose representation; code mainly treats these as `any`.
    export interface MatrixEvent {
        type: string;
        sender: string;
        room_id: string;
        event_id: string;
        origin_server_ts: number;
        content: any;
        unsigned?: Record<string, unknown>;
    }

    export interface CardMessageEvent extends MatrixEvent {
        type: 'm.room.message';
        content: CardMessageContent;
    }

    export interface CommandResultEvent extends MatrixEvent { }
    export interface CodePatchResultEvent extends MatrixEvent { }

    export interface CardMessageContent {
        msgtype: string;
        format: string;
        body: string;
        data?: {
            context?: BoxelContext;
            attachedCards?: any[];
            attachedFiles?: any[];
        };
        [key: string]: any;
    }

    export interface Tool {
        type: 'function';
        function: {
            name: string;
            description: string;
            parameters: any;
        };
    }

    export interface BoxelContext {
        agentId?: string;
        submode?: string;
        realmUrl?: string;
        openCardIds?: string[];
        tools?: Tool[];
        toolChoice?: ToolChoice;
        codeMode?: {
            currentFile?: string;
            moduleInspectorPanel?: string;
            previewPanelSelection?: { cardId: string; format: string };
            selectedCodeRef?: any;
            selectedText?: string;
        };
        debug?: boolean;
    }

    /* Union helper used throughout host/bot for events that include context */
    export type MatrixEventWithBoxelContext = CardMessageEvent | CommandResultEvent | CodePatchResultEvent;

    /* Room skills configuration event */
    export interface SkillsConfigEvent extends MatrixEvent {
        type: 'app.boxel.room.skills';
        content: {
            enabledSkillCards: any[];
            disabledSkillCards: any[];
            commandDefinitions?: any[];
        };
    }

    export { MatrixEvent as DiscreteMatrixEvent };

    /* -----------------------
     * Additional Event Types
     * ----------------------- */
    export interface ActiveLLMEvent extends MatrixEvent {
        type: 'app.boxel.active-llm';
        content: { model: string };
    }

    // Helper structure used when encoding command requests
    export interface EncodedCommandRequest {
        id: string;
        name: string;
        /** stringified JSON of the arguments */
        arguments: string;
        description?: string;
    }
}

/* ------------------------------------------------------------------
 * matrix-js-sdk – extend previous minimal shim
 * ------------------------------------------------------------------ */

declare module 'matrix-js-sdk' {
    // Event enums already stubbed; add RoomEvent & RoomMemberEvent names used via dot-access on the SDK.
    export enum RoomEvent {
        Timeline = 'Room.timeline',
        LocalEchoUpdated = 'Room.localEchoUpdated',
    }
    export enum RoomMemberEvent {
        Membership = 'RoomMember.membership',
    }
    export enum RoomStateEvent {
        Update = 'RoomState.events',
    }
    export interface RoomState { }

    /** Generic matrix event wrapper */
    export interface MatrixEvent {
        getId(): string | undefined;
        getType(): string | undefined;
        getContent(): any;
        getSender(): string | undefined;
        roomId?: string;
    }

    /** Status enum for local echo events */
    export enum EventStatus {
        /** sent to the server */
        SENT = 'sent',
        /** not yet sent */
        UNSENT = 'unsent',
        /** sending failed */
        NOT_SENT = 'not_sent',
    }
}

/* Sliding-sync state enum stub */
declare module 'matrix-js-sdk/lib/sliding-sync' {
    export enum SlidingSyncEvent {
        State = 'state',
    }
}

/* ------------------------------------------------------------------
 * OpenAI – extend completions types
 * ------------------------------------------------------------------ */

declare module 'openai/resources/chat/completions' {
    export type ChatCompletionMessageParam = any;
    export type ChatCompletionMessageToolCall = any;
}

/* ------------------------------------------------------------------
 * Cardstack base modules – expose minimal APIs needed by code/tests
 * ------------------------------------------------------------------ */

declare module 'https://cardstack.com/base/card-api' {
    export class CardDef<T = any> {
        constructor(attrs?: any);
        static displayName?: string;
        static isolated?: any;
        static embedded?: any;
        static fitted?: any;
        static edit?: any;
        id?: string;
    }
    export class FieldDef { }
    export class Component<T = any> { }

    // Helper decorators – no-op typings
    export function field(...args: any[]): any;
    export function contains(type: any, opts?: any): any;
    export function linksTo(type: any): any;
    export function linksToMany(type: any): any;
    export function serialize(value: any): any;
}

declare module 'https://cardstack.com/base/file-api' {
    export interface SerializedFile {
        url: string;
        sourceUrl?: string;
        name: string;
        contentType: string;
        content?: string;
        error?: string;
    }
    export type SerializedFileDef = SerializedFile;
}

declare module 'https://cardstack.com/base/skill' {
    export interface Skill {
        attributes?: any;
        meta?: any;
    }
    export interface CommandField { }
}

declare module '@cardstack/runtime-common' {
    export function skillCardRef(fileURL: string): string;
}

/* ------------------------------------------------------------------
 * Sentry – ensure captureException available (already declared but complete)
 * ------------------------------------------------------------------ */
declare module '@sentry/node' {
    export function captureException(error: unknown, context?: unknown): void;
    export function captureMessage(message: string, level?: string): void;
    export function init(opts: unknown): void;
}

/* ------------------------------------------------------------------
 * Node built-in minimal typings (fs, path, url) to avoid @types/node dep
 * ------------------------------------------------------------------ */
declare module 'path' {
    export function join(...paths: string[]): string;
    export function resolve(...paths: string[]): string;
    export const sep: string;
}

declare module 'url' {
    export class URL {
        constructor(url: string, base?: string | URL);
        href: string;
        toString(): string;
    }
}

/* ------------------------------------------------------------------
 * Global NodeJS namespace additions (Buffer)
 * ------------------------------------------------------------------ */

declare namespace NodeJS {
    interface Global { }
}