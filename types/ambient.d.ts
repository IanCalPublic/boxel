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