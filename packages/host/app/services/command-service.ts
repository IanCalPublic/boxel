import { getOwner, setOwner } from '@ember/owner';
import { debounce } from '@ember/runloop';
import Service, { service } from '@ember/service';
import { isTesting } from '@embroider/macros';

import { task, timeout, all } from 'ember-concurrency';

import { IEvent } from 'matrix-js-sdk';

import { TrackedSet } from 'tracked-built-ins';

import {
  Command,
  CommandContext,
  CommandContextStamp,
  delay,
  getClass,
  identifyCard,
  type PatchData,
} from '@cardstack/runtime-common';

import PatchCodeCommand from '@cardstack/host/commands/patch-code';

import type MatrixService from '@cardstack/host/services/matrix-service';
import type Realm from '@cardstack/host/services/realm';

import type { CardDef } from 'https://cardstack.com/base/card-api';
import { CodePatchStatus } from 'https://cardstack.com/base/matrix-event';

import type LoaderService from './loader-service';
import type OperatorModeStateService from './operator-mode-state-service';
import type RealmServerService from './realm-server';
import type StoreService from './store';
import type MessageCodePatchResult from '../lib/matrix-classes/message-code-patch-result';
import type MessageCommand from '../lib/matrix-classes/message-command';

const DELAY_FOR_APPLYING_UI = isTesting() ? 50 : 500;

type GenericCommand = Command<
  typeof CardDef | undefined,
  typeof CardDef | undefined
>;

export default class CommandService extends Service {
  @service declare private loaderService: LoaderService;
  @service declare private matrixService: MatrixService;
  @service declare private operatorModeStateService: OperatorModeStateService;
  @service declare private realm: Realm;
  @service declare private realmServer: RealmServerService;
  @service declare private store: StoreService;
  currentlyExecutingCommandRequestIds = new TrackedSet<string>();
  executedCommandRequestIds = new TrackedSet<string>();
  private commandProcessingEventQueue: string[] = [];
  private flushCommandProcessingQueue: Promise<void> | undefined;

  public queueEventForCommandProcessing(event: Partial<IEvent>) {
    let eventId = event.event_id;
    if (event.content?.['m.relates_to']?.rel_type === 'm.replace') {
      eventId = event.content?.['m.relates_to']!.event_id;
    }
    if (!eventId) {
      throw new Error(
        'No event id found for event with commands, this should not happen',
      );
    }
    let roomId = event.room_id;
    if (!roomId) {
      throw new Error(
        'No room id found for event with commands, this should not happen',
      );
    }
    let compoundKey = `${roomId}|${eventId}`;
    if (this.commandProcessingEventQueue.includes(compoundKey)) {
      return;
    }

    this.commandProcessingEventQueue.push(compoundKey);

    debounce(this, this.drainCommandProcessingQueue, 100);
  }

  private async drainCommandProcessingQueue() {
    await this.flushCommandProcessingQueue;

    let finishedProcessingCommands: () => void;
    this.flushCommandProcessingQueue = new Promise(
      (res) => (finishedProcessingCommands = res),
    );

    let commandSpecs = [...this.commandProcessingEventQueue];
    this.commandProcessingEventQueue = [];

    while (commandSpecs.length > 0) {
      let [roomId, eventId] = commandSpecs.shift()!.split('|');

      let roomResource = this.matrixService.roomResources.get(roomId!);
      if (!roomResource) {
        throw new Error(
          `Room resource not found for room id ${roomId}, this should not happen`,
        );
      }
      let timeout = Date.now() + 60_000; // reset the timer to avoid a long wait if the room resource is processing
      let currentRoomProcessingTimestamp = roomResource.processingLastStartedAt;
      while (
        roomResource.isProcessing &&
        currentRoomProcessingTimestamp ===
          roomResource.processingLastStartedAt &&
        Date.now() < timeout
      ) {
        // wait for the room resource to finish processing
        await delay(100);
      }
      if (
        roomResource.isProcessing &&
        currentRoomProcessingTimestamp === roomResource.processingLastStartedAt
      ) {
        // room seems to be stuck processing, so we will log and skip this event
        console.error(
          `Room resource for room ${roomId} seems to be stuck processing, skipping event ${eventId}`,
        );
        continue;
      }

      let message = roomResource.messages.find((m) => m.eventId === eventId);
      if (!message) {
        continue;
      }
      if (message.agentId !== this.matrixService.agentId) {
        // This command was sent by another agent, so we will not auto-execute it
        continue;
      }
      for (let messageCommand of message.commands) {
        if (this.currentlyExecutingCommandRequestIds.has(messageCommand.id!)) {
          continue;
        }
        if (this.executedCommandRequestIds.has(messageCommand.id!)) {
          continue;
        }
        if (messageCommand.status === 'applied') {
          continue;
        }
        if (!messageCommand.name) {
          continue;
        }
        if (messageCommand.requiresApproval === false) {
          this.run.perform(messageCommand);
        }
      }
    }
    finishedProcessingCommands!();
  }

  get commandContext(): CommandContext {
    let result = {
      [CommandContextStamp]: true,
    };
    setOwner(result, getOwner(this)!);

    return result;
  }

  //TODO: Convert to non-EC async method after fixing CS-6987
  run = task(async (command: MessageCommand) => {
    let { arguments: payload, eventId, id: commandRequestId } = command;
    let resultCard: CardDef | undefined;
    // There may be some race conditions where the command is already being executed when this task starts
    if (
      this.currentlyExecutingCommandRequestIds.has(commandRequestId!) ||
      this.executedCommandRequestIds.has(commandRequestId!)
    ) {
      return; // already executing this command
    }
    try {
      this.matrixService.failedCommandState.delete(commandRequestId!);
      this.currentlyExecutingCommandRequestIds.add(commandRequestId!);

      let commandToRun;

      // If we don't find it in the one-offs, start searching for
      // one in the skills we can construct
      let commandCodeRef = command.codeRef;
      if (commandCodeRef) {
        let CommandConstructor = (await getClass(
          commandCodeRef,
          this.loaderService.loader,
        )) as { new (context: CommandContext): Command<any, any> };
        commandToRun = new CommandConstructor(this.commandContext);
      }

      if (commandToRun) {
        let typedInput = await this.instantiateCommandInput(
          commandToRun,
          payload?.attributes,
          payload?.relationships,
        );
        [resultCard] = await all([
          await commandToRun.execute(typedInput as any),
          await timeout(DELAY_FOR_APPLYING_UI), // leave a beat for the "applying" state of the UI to be shown
        ]);
      } else if (command.name === 'patchCardInstance') {
        if (!hasPatchData(payload)) {
          throw new Error(
            "Patch command can't run because it doesn't have all the fields in arguments returned by open ai",
          );
        }
        await this.store.patch(payload?.attributes?.cardId, {
          attributes: payload?.attributes?.patch?.attributes,
          relationships: payload?.attributes?.patch?.relationships,
        });
      } else {
        // Unrecognized command. This can happen if a programmatically-provided command is no longer available due to a browser refresh.
        throw new Error(
          `Unrecognized command: ${command.name}. This command may have been associated with a previous browser session.`,
        );
      }
      this.executedCommandRequestIds.add(commandRequestId!);
      await this.matrixService.updateSkillsAndCommandsIfNeeded(
        command.message.roomId,
      );
      let userContextForAiBot =
        await this.operatorModeStateService.getSummaryForAIBot();

      await this.matrixService.sendCommandResultEvent(
        command.message.roomId,
        eventId,
        commandRequestId!,
        resultCard,
        [],
        [],
        userContextForAiBot,
      );
    } catch (e) {
      let error =
        typeof e === 'string'
          ? new Error(e)
          : e instanceof Error
            ? e
            : new Error('Command failed.');
      console.error(error);
      await timeout(DELAY_FOR_APPLYING_UI); // leave a beat for the "applying" state of the UI to be shown
      this.matrixService.failedCommandState.set(commandRequestId!, error);
    } finally {
      this.currentlyExecutingCommandRequestIds.delete(commandRequestId!);
    }
  });

  // Construct a new instance of the input type with the
  // The input is undefined if the command has no input type
  private async instantiateCommandInput(
    command: GenericCommand,
    attributes: Record<string, any> | undefined,
    relationships: Record<string, any> | undefined,
  ) {
    // Get the input type and validate/construct the payload
    let typedInput;
    let InputType = await command.getInputType();
    if (InputType) {
      let adoptsFrom = identifyCard(InputType);
      if (adoptsFrom) {
        let inputDoc = {
          type: 'card',
          data: {
            meta: {
              adoptsFrom,
            },
            attributes: attributes ?? {},
            relationships: relationships ?? {},
          },
        };
        typedInput = await this.store.add(inputDoc, { doNotPersist: true });
      } else {
        // identifyCard can fail in some circumstances where the input type is not exported
        // in that case, we'll fall back to this less reliable method of constructing the input type
        typedInput = new InputType({ ...attributes, ...relationships });
      }
    } else {
      typedInput = undefined;
    }
    return typedInput;
  }

  patchCode = async (
    roomId: string,
    fileUrl: string | null,
    codeDataItems: {
      searchReplaceBlock?: string | null;
      eventId: string;
      codeBlockIndex: number;
    }[],
  ) => {
    if (!fileUrl) {
      throw new Error('File URL is required to patch code');
    }
    for (const codeData of codeDataItems) {
      this.currentlyExecutingCommandRequestIds.add(
        `${codeData.eventId}:${codeData.codeBlockIndex}`,
      );
    }
    let finalFileUrl: string | undefined;
    try {
      let patchCodeCommand = new PatchCodeCommand(this.commandContext);
      let patchCodeResult = await patchCodeCommand.execute({
        fileUrl,
        codeBlocks: codeDataItems.map(
          (codeData) => codeData.searchReplaceBlock!,
        ),
      });
      finalFileUrl = patchCodeResult.finalFileUrl;

      for (let i = 0; i < codeDataItems.length; i++) {
        const codeData = codeDataItems[i];
        const patchResult = patchCodeResult.results[i];
        if (patchResult.status === 'applied') {
          this.executedCommandRequestIds.add(
            `${codeData.eventId}:${codeData.codeBlockIndex}`,
          );
        }
      }

      await this.matrixService.updateSkillsAndCommandsIfNeeded(roomId);
      let fileDef = this.matrixService.fileAPI.createFileDef({
        sourceUrl: finalFileUrl ?? fileUrl,
        name: fileUrl.split('/').pop(),
      });

      let context = await this.operatorModeStateService.getSummaryForAIBot();

      let resultSends: Promise<unknown>[] = [];
      for (let i = 0; i < codeDataItems.length; i++) {
        const codeData = codeDataItems[i];
        const result = patchCodeResult.results[i];
        resultSends.push(
          this.matrixService.sendCodePatchResultEvent(
            roomId,
            codeData.eventId,
            codeData.codeBlockIndex,
            result.status as CodePatchStatus,
            [],
            [fileDef],
            context,
            result.failureReason,
          ),
        );
      }
      await Promise.all(resultSends);
    } finally {
      // remove the code blocks from the currently executing command request ids
      for (const codeData of codeDataItems) {
        this.currentlyExecutingCommandRequestIds.delete(
          `${codeData.eventId}:${codeData.codeBlockIndex}`,
        );
      }
    }
  };

  private isCodeBlockApplying(codeData: {
    eventId: string;
    codeBlockIndex: number;
  }) {
    return this.currentlyExecutingCommandRequestIds.has(
      `${codeData.eventId}:${codeData.codeBlockIndex}`,
    );
  }

  private isCodeBlockRecentlyApplied(codeBlock: {
    eventId: string;
    codeBlockIndex: number;
  }) {
    return this.executedCommandRequestIds.has(
      `${codeBlock.eventId}:${codeBlock.codeBlockIndex}`,
    );
  }

  getCodePatchStatus = (codeData: {
    roomId: string;
    eventId: string;
    codeBlockIndex: number;
  }): CodePatchStatus | 'applying' | 'ready' => {
    if (this.isCodeBlockApplying(codeData)) {
      return 'applying';
    }
    if (this.isCodeBlockRecentlyApplied(codeData)) {
      return 'applied';
    }
    return this.getCodePatchResult(codeData)?.status ?? 'ready';
  };

  getCodePatchResult = (codeData: {
    roomId: string;
    eventId: string;
    codeBlockIndex: number;
  }): MessageCodePatchResult | undefined => {
    let roomResource = this.matrixService.roomResources.get(codeData.roomId);
    if (!roomResource) {
      return undefined;
    }
    let message = roomResource.messages.find(
      (m) => m.eventId === codeData.eventId,
    );
    return message?.codePatchResults?.find(
      (c) => c.index === codeData.codeBlockIndex,
    );
  };
}

type PatchPayload = { attributes: { cardId: string; patch: PatchData } };

function hasPatchData(payload: any): payload is PatchPayload {
  return (
    payload.attributes?.cardId &&
    (payload.attributes?.patch?.attributes ||
      payload.attributes?.patch?.relationships)
  );
}

declare module '@ember/service' {
  interface Registry {
    'command-service': CommandService;
  }
}
