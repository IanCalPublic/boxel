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

    export { MatrixEvent as DiscreteMatrixEvent };
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