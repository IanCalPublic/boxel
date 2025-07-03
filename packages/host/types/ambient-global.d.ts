/// <reference path="../../types/ambient.d.ts" />

// Re-export commonly used Ember modules so local compilation does not rely
// solely on root ambient paths (prevents path-mapping edge cases).

declare module '@ember/application';
declare module '@ember/owner';
declare module '@ember/routing/router-service';
declare module '@ember/runloop';
declare module '@ember/service';
declare module '@glimmer/tracking';
declare module '@ember/component';
declare module 'ember-concurrency';
declare module 'ember-window-mock';