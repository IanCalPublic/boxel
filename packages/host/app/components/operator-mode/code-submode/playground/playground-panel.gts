import { fn } from '@ember/helper';
import { action } from '@ember/object';
import { schedule } from '@ember/runloop';

import { service } from '@ember/service';
import { htmlSafe, type SafeString } from '@ember/template';

import Component from '@glimmer/component';
import { tracked, cached } from '@glimmer/tracking';

import { restartableTask, task } from 'ember-concurrency';
import ToElsewhere from 'ember-elsewhere/components/to-elsewhere';
import { consume } from 'ember-provide-consume-context';

import {
  BoxelSelect,
  CardContainer,
  LoadingIndicator,
} from '@cardstack/boxel-ui/components';
import { eq, MenuItem } from '@cardstack/boxel-ui/helpers';
import {
  Eye,
  Folder,
  IconCode,
  IconLink,
  IconPlusThin,
} from '@cardstack/boxel-ui/icons';

import { cardTypeDisplayName } from '@cardstack/runtime-common';

import {
  baseCardRef,
  internalKeyFor,
  type ResolvedCodeRef,
  GetCardContextName,
  type getCard,
  chooseCard,
  loadCardDef,
  specRef,
  trimJsonExtension,
  uuidv4,
  type LooseSingleCardDocument,
  type Query,
  type CardErrorJSONAPI,
  type PrerenderedCardLike,
} from '@cardstack/runtime-common';

import ListingInitCommand from '@cardstack/host/commands/listing-action-init';
import SendAiAssistantMessageCommand from '@cardstack/host/commands/send-ai-assistant-message';
import consumeContext from '@cardstack/host/helpers/consume-context';

import { urlForRealmLookup } from '@cardstack/host/lib/utils';

import type AiAssistantPanelService from '@cardstack/host/services/ai-assistant-panel-service';
import type CommandService from '@cardstack/host/services/command-service';
import type LoaderService from '@cardstack/host/services/loader-service';
import type MatrixService from '@cardstack/host/services/matrix-service';
import type OperatorModeStateService from '@cardstack/host/services/operator-mode-state-service';
import type PlaygroundPanelService from '@cardstack/host/services/playground-panel-service';
import type RealmService from '@cardstack/host/services/realm';
import type RealmServerService from '@cardstack/host/services/realm-server';
import type { RecentCard } from '@cardstack/host/services/recent-cards-service';
import type RecentCardsService from '@cardstack/host/services/recent-cards-service';
import type RecentFilesService from '@cardstack/host/services/recent-files-service';
import type StoreService from '@cardstack/host/services/store';

import type {
  CardDef,
  FieldDef,
  Format,
} from 'https://cardstack.com/base/card-api';
import type { FileDef } from 'https://cardstack.com/base/file-api';
import type { Spec } from 'https://cardstack.com/base/spec';

import PrerenderedCardSearch from '../../../prerendered-card-search';
import CardError from '../../card-error';
import FormatChooser from '../format-chooser';

import AiAssistantIcon from './ai-assistant-icon-bw';
import FieldPickerModal from './field-chooser-modal';

import InstanceSelectDropdown, {
  BULK_GENERATED_ITEM_COUNT,
} from './instance-chooser-dropdown';
import PlaygroundPreview from './playground-preview';
import SpecSearch from './spec-search';

export type SelectedInstance = {
  card: CardDef;
  fieldIndex: number | undefined;
};

export type FieldOption = {
  index: number;
  displayIndex: number;
  field: FieldDef;
};

interface Signature {
  Args: {
    codeRef: ResolvedCodeRef;
    isFieldDef?: boolean;
    isUpdating?: boolean;
  };
  Element: HTMLElement;
}

export default class PlaygroundPanel extends Component<Signature> {
  @consume(GetCardContextName) private declare getCard: getCard;
  @service private declare aiAssistantPanelService: AiAssistantPanelService;
  @service private declare commandService: CommandService;
  @service private declare loaderService: LoaderService;
  @service private declare matrixService: MatrixService;
  @service private declare operatorModeStateService: OperatorModeStateService;
  @service private declare realm: RealmService;
  @service private declare realmServer: RealmServerService;
  @service private declare recentFilesService: RecentFilesService;
  @service private declare recentCardsService: RecentCardsService;
  @service private declare playgroundPanelService: PlaygroundPanelService;
  @service private declare store: StoreService;

  @tracked private cardResource: ReturnType<getCard> | undefined;
  @tracked private fieldChooserIsOpen = false;
  @tracked private newCardNonce = 0;

  @tracked private cardOptions: PrerenderedCardLike[] = [];

  private fieldFormats: Format[] = ['embedded', 'fitted', 'atom', 'edit'];
  #creationError = false;

  private get specQuery(): Query {
    return {
      filter: {
        on: specRef,
        eq: { ref: this.args.codeRef },
      },
      sort: [
        {
          by: 'lastModified',
          direction: 'desc',
        },
      ],
    };
  }

  private get maybeGenerateFieldSpec() {
    return this.canWriteRealm && this.args.isFieldDef && !this.card;
  }

  private copyToClipboard = task(async (id?: string) => {
    if (!id) {
      return;
    }
    await navigator.clipboard.writeText(id);
  });

  private openInInteractMode = (id?: string) => {
    if (!id) {
      return;
    }
    this.operatorModeStateService.openCardInInteractMode(
      id,
      this.format === 'edit' ? 'edit' : 'isolated',
    );
  };

  private get showError() {
    // in edit format, prefer showing the stale card if possible so user can
    // attempt to fix the card error
    if (this.cardError && this.format === 'edit' && this.card) {
      return false;
    }
    return Boolean(this.cardError);
  }

  private get contextMenuItems() {
    let cardId = this.card?.id;
    let menuItems: MenuItem[] = [
      new MenuItem('Copy Card URL', 'action', {
        action: () => this.copyToClipboard.perform(cardId),
        icon: IconLink,
        disabled: !cardId,
      }),
      new MenuItem('Open in Code Mode', 'action', {
        action: async () =>
          await this.operatorModeStateService.updateCodePath(
            cardId ? new URL(cardId) : null,
          ),
        icon: IconCode,
        disabled: !cardId,
      }),
      new MenuItem('Open in Interact Mode', 'action', {
        action: () => this.openInInteractMode(cardId),
        icon: Eye,
        disabled: !cardId,
      }),
      new MenuItem('Fill in sample data with AI', 'action', {
        action: () => this.generateSampleData.perform(),
        icon: AiAssistantIcon,
        disabled: !this.canEditCard,
      }),
      new MenuItem(
        `Generate ${BULK_GENERATED_ITEM_COUNT} examples with AI`,
        'action',
        {
          action: () =>
            this.generateSampleData.perform({
              bulkGenerate: true,
            }),
          icon: AiAssistantIcon,
          disabled: !this.canWriteRealm,
        },
      ),
      new MenuItem(`Create listing with AI`, 'action', {
        action: () => this.createListingWithAI.perform(),
        icon: AiAssistantIcon,
        disabled: !this.canWriteRealm,
      }),
    ];
    return menuItems;
  }

  private get afterMenuOptions(): MenuItem[] {
    let menuItems: MenuItem[] = [
      new MenuItem('Create new instance', 'action', {
        action: () => this.createNew(),
        icon: this.createNewIsRunning ? LoadingIndicator : IconPlusThin,
        disabled: this.createNewIsRunning || !this.canWriteRealm,
      }),
      new MenuItem('Choose another instance', 'action', {
        action: () => this.chooseInstance(),
        icon: Folder,
      }),
      new MenuItem('Fill in sample data with AI', 'action', {
        action: () => this.generateSampleData.perform(),
        icon: AiAssistantIcon,
        disabled: !this.canEditCard,
      }),
      new MenuItem(
        `Generate ${BULK_GENERATED_ITEM_COUNT} examples with AI`,
        'action',
        {
          action: () =>
            this.generateSampleData.perform({
              bulkGenerate: true,
            }),
          icon: AiAssistantIcon,
          disabled: !this.canWriteRealm,
        },
      ),
    ];
    return menuItems;
  }

  @action private setFormat(format: Format) {
    if (!this.card?.id) {
      return;
    }
    this.persistSelections(this.card.id, format);
  }

  private get realmInfo() {
    let url = this.card ? urlForRealmLookup(this.card) : undefined;
    if (!url) {
      return undefined;
    }
    return this.realm.info(url);
  }

  private get canEditCard() {
    return this.card?.id && this.realm.canWrite(this.card.id);
  }

  private get setEditMode() {
    return this.format !== 'edit' && this.canEditCard;
  }

  private get prefersWideFormat() {
    if (!this.card) {
      return false;
    }
    if (this.format !== 'isolated' && this.format !== 'edit') {
      return true;
    }
    let { constructor } = this.card;
    return Boolean(
      constructor &&
        'prefersWideFormat' in constructor &&
        constructor.prefersWideFormat,
    );
  }

  private get setMaxWidth(): SafeString {
    const maxWidth = this.prefersWideFormat ? '100%' : '50rem';
    return htmlSafe(`max-width: ${maxWidth};`);
  }
  private get moduleId() {
    return internalKeyFor(this.args.codeRef, undefined);
  }

  private get isLoading() {
    return this.args.isFieldDef && this.args.isUpdating;
  }

  private makeCardResource = () => {
    this.cardResource = this.getCard(
      this,
      () => this.playgroundSelection?.cardId,
    );
  };

  private get playgroundSelection() {
    return this.playgroundPanelService.getSelection(this.moduleId);
  }

  private get card(): CardDef | undefined {
    return this.cardResource?.card;
  }

  private get cardError(): CardErrorJSONAPI | undefined {
    return this.cardResource?.cardError;
  }

  private get errorMessage() {
    let error = this.cardResource?.cardError;
    if (!error) {
      return undefined;
    }
    if (error.status === 404 && error.title === 'Not Found') {
      if (error.message.includes('missing')) {
        // missing relationship link
        return `Card "${error.id}" contains a missing link.`;
      } else {
        // custom message for missing file case
        return 'File not found. Please choose or create another instance.';
      }
    }
    // default error message will be shown
    return undefined;
  }

  private get specCard(): Spec | undefined {
    let card = this.card;
    if (!card || !this.args.isFieldDef) {
      return undefined;
    }
    if (!('ref' in card) || !('moduleHref' in card)) {
      return undefined;
    }
    if (
      card.moduleHref !== this.args.codeRef.module ||
      (card.ref as ResolvedCodeRef).name !== this.args.codeRef.name
    ) {
      return undefined;
    }
    return card as Spec;
  }

  private get recentCardIds() {
    let cards: RecentCard[] = [];
    for (let file of this.recentFilesService.recentFiles) {
      let url = `${file.realmURL}${file.filePath}`;
      if (url.endsWith('.json') && file.timestamp) {
        cards.push({
          cardId: trimJsonExtension(url),
          timestamp: file.timestamp,
        });
      }
    }
    let recentCards = this.recentCardsService.recentCards.filter((c) =>
      Boolean(c.timestamp),
    );
    let sortedCards = [...recentCards, ...cards].sort(
      (a, b) => b.timestamp! - a.timestamp!,
    );
    return [...new Set(sortedCards.map((c) => c.cardId))];
  }

  private get recentRealms() {
    return [
      ...new Set([
        this.currentRealm,
        ...this.recentFilesService.recentFiles.map((f) => f.realmURL.href),
      ]),
    ];
  }

  private get query(): Query | undefined {
    if (this.args.isFieldDef) {
      return undefined;
    }
    return {
      filter: {
        every: [
          {
            type: this.args.codeRef,
          },
          {
            any: this.recentCardIds.map((id) => ({ eq: { id } })).slice(0, 20),
          },
        ],
      },
    };
  }

  private get expandedQuery(): Query | undefined {
    if (this.args.isFieldDef) {
      return undefined;
    }
    return {
      filter: { type: this.args.codeRef },
      sort: [
        {
          by: 'lastModified',
          direction: 'desc',
        },
      ],
    };
  }

  private get fieldInstances(): FieldOption[] | undefined {
    if (!this.args.isFieldDef || !this.specCard) {
      return undefined;
    }
    let spec = this.specCard;
    let instances = spec.containedExamples;
    if (!instances?.length) {
      this.createNewField.perform(spec);
      return undefined;
    }
    return instances.map((field, i) => ({
      index: i,
      displayIndex: i + 1,
      field,
    }));
  }

  private get field(): FieldDef | undefined {
    if (!this.fieldInstances) {
      return undefined;
    }
    let index = this.fieldIndex!;
    if (index >= this.fieldInstances.length) {
      index = this.fieldInstances.length - 1;
    }
    return this.fieldInstances[index].field;
  }

  private get fieldIndex(): number | undefined {
    let index = this.playgroundPanelService.getSelection(
      this.moduleId,
    )?.fieldIndex;
    if (index !== undefined && index >= 0) {
      return index;
    }
    return this.args.isFieldDef ? 0 : undefined;
  }

  private get dropdownSelection(): SelectedInstance | undefined {
    if (!this.card) {
      return undefined;
    }
    return {
      card: this.card,
      fieldIndex: this.args.isFieldDef ? this.fieldIndex : undefined,
    };
  }

  @action private onSelect(item: PrerenderedCardLike | FieldOption) {
    if (this.args.isFieldDef) {
      this.persistSelections(
        this.card!.id,
        this.format,
        (item as FieldOption).index,
      );
    } else {
      this.persistSelections((item as PrerenderedCardLike).url);
    }
  }

  private get currentRealm() {
    return this.operatorModeStateService.realmURL.href;
  }

  private get canWriteRealm() {
    return this.realm.canWrite(this.currentRealm);
  }

  private get defaultFormat() {
    return this.args.isFieldDef ? 'embedded' : 'isolated';
  }

  private get format(): Format {
    return (
      this.playgroundPanelService.getSelection(this.moduleId)?.format ??
      this.defaultFormat
    );
  }

  private persistSelections = (
    selectedCardId: string,
    selectedFormat = this.format,
    index = this.fieldIndex,
  ) => {
    let selection = this.playgroundPanelService.getSelection(this.moduleId);
    if (selection?.cardId) {
      let { cardId, format, fieldIndex } = selection;
      if (
        cardId === trimJsonExtension(selectedCardId) &&
        format === selectedFormat &&
        fieldIndex === index
      ) {
        // this is important for preventing some unnecessary screen flashes from happening
        return;
      }
    }

    this.playgroundPanelService.persistSelections(
      this.moduleId,
      trimJsonExtension(selectedCardId),
      selectedFormat,
      index, // `undefined` means we are previewing a card instances. fields MUST have a corresponding index
      // based on their position on their spec's containedExamples field. otherwise, it means that we are previewing
      // a spec instance on playground instead of the field,
    );
  };

  @action private chooseInstance() {
    this.args.isFieldDef
      ? (this.fieldChooserIsOpen = true)
      : this.chooseCard.perform();
    this.closeInstanceChooser();
  }

  @action private chooseField(index: number) {
    if (!this.card?.id) {
      return;
    }
    this.persistSelections(this.card.id, this.format, index);
    this.closeFieldChooser();
  }

  @action private closeFieldChooser() {
    this.fieldChooserIsOpen = false;
  }

  private chooseCard = task(async () => {
    let cardId = await chooseCard({
      filter: { type: this.args.codeRef },
    });

    if (cardId) {
      this.recentFilesService.addRecentFileUrl(`${cardId}.json`);
      this.persistSelections(cardId);
    }
  });

  private autoGenerateInstance = restartableTask(async () => {
    this.#creationError = false;
    if (this.args.isFieldDef && this.specCard) {
      await this.createNewField.perform(this.specCard);
    } else {
      let maybeId = await this.createNewCard.perform();
      this.#creationError = typeof maybeId !== 'string';
    }
  });

  @action private createNew() {
    this.args.isFieldDef && this.specCard
      ? this.createNewField.perform(this.specCard)
      : this.createNewCard.perform();
  }

  private get createNewIsRunning() {
    return this.createNewCard.isRunning || this.createNewField.isRunning;
  }

  @cached
  private get newCardLocalId() {
    // we want our local id's to cycle after each successful
    // new card creation and when the module id changes
    this.newCardNonce;
    this.moduleId;
    return uuidv4();
  }

  private createNewCard = restartableTask(async () => {
    let newCardJSON: LooseSingleCardDocument;
    let isFieldDef = this.args.isFieldDef;

    if (isFieldDef) {
      let fieldCard = await loadCardDef(this.args.codeRef, {
        loader: this.loaderService.loader,
      });
      // for field def, create a new spec card instance
      newCardJSON = {
        data: {
          lid: this.newCardLocalId,
          attributes: {
            specType: 'field',
            ref: this.args.codeRef,
            title: this.args.codeRef.name,
            containedExamples: [new fieldCard()],
          },
          meta: {
            fields: {
              containedExamples: [
                {
                  adoptsFrom: this.args.codeRef,
                },
              ],
            },
            adoptsFrom: specRef,
            realmURL: this.currentRealm,
          },
        },
      };
    } else {
      newCardJSON = {
        data: {
          lid: this.newCardLocalId,
          meta: {
            adoptsFrom: this.args.codeRef,
            realmURL: this.currentRealm,
          },
        },
      };
    }
    let maybeId: string | CardErrorJSONAPI = await this.store.create(
      newCardJSON,
      {
        realm: this.currentRealm,
      },
    );
    this.persistSelections(
      // in the case of an error we still need to persist it in
      // order render the error doc
      typeof maybeId === 'string' ? maybeId : this.newCardLocalId,
      // preview new instance in isolated format
      isFieldDef ? 'edit' : 'isolated',
      isFieldDef ? 0 : undefined,
    );
    if (typeof maybeId === 'string') {
      // reset the local ID for making new cards after each successful attempt
      // such that failed attempts will use the same local ID. that way when we
      // get an error doc in the store for a particular local id based on the
      // server error response, when a new card is successfully created that
      // uses a correlating local ID we will automatically clear the error in
      // the store.
      this.newCardNonce++;
      let cardId = maybeId;
      this.recentFilesService.addRecentFileUrl(`${cardId}.json`);
    }
    this.closeInstanceChooser();
    return maybeId;
  });

  private createNewField = restartableTask(async (specCard: Spec) => {
    let fieldCard = await loadCardDef(this.args.codeRef, {
      loader: this.loaderService.loader,
    });
    let examples = specCard.containedExamples;
    examples?.push(new fieldCard());
    let index = examples?.length ? examples.length - 1 : 0;
    this.persistSelections(specCard.id, 'edit', index);
    this.closeInstanceChooser();
  });

  private closeInstanceChooser = () =>
    (
      document.querySelector(
        '[data-playground-instance-chooser][aria-expanded="true"]',
      ) as BoxelSelect | null
    )?.click();

  private get currentFileDef(): FileDef | undefined {
    let codePath = this.operatorModeStateService.state.codePath?.href;
    if (!codePath) {
      return undefined;
    }

    return this.matrixService.fileAPI.createFileDef({
      sourceUrl: codePath,
      name: codePath.split('/').pop(),
    });
  }

  private processSearchResults = (prerenderedCards?: PrerenderedCardLike[]) => {
    this.cardOptions = prerenderedCards ?? [];
    this.findSelectedCard(prerenderedCards);
  };

  private showResults = (cards: PrerenderedCardLike[] | undefined) => {
    return (
      !this.args.isFieldDef &&
      (cards?.length ||
        this.persistedCardId ||
        this.createNewIsRunning ||
        this.isBaseCardModule) // means we do not conduct the expanded search for baseCardModule
    );
  };

  private findSelectedCard = (prerenderedCards?: PrerenderedCardLike[]) => {
    if (!prerenderedCards?.length) {
      // it is possible that there's a persisted cardId in playground-selections local storage
      // but that the card is no longer in recent-files local storage
      // if that is the case, the card title will appear in dropdown menu but
      // the card will not appear in dropdown options because the card is not in recent-files
      // there are timing issues with trying to add it to recent-files service,
      // see CS-8601 for suggested resolution for similar problems
      return this.dropdownSelection;
    }

    if (!this.dropdownSelection?.card) {
      if (this.persistedCardId || this.isBaseCardModule) {
        // not displaying card preview for base card module unless user selects it specifically
        return;
      }
      let recentCard = prerenderedCards[0];
      // if there's no selected card, choose the most recent card as selected
      this.persistSelections(recentCard.url, 'isolated');
      return recentCard;
    }

    let selectedCardId = this.dropdownSelection.card.id;
    let card = prerenderedCards.find(
      (c) => trimJsonExtension(c.url) === selectedCardId,
    );
    return card;
  };

  // sort prerendered-search card results by most recently viewed
  private getSortedCards = (cards: PrerenderedCardLike[]) => {
    if (!this.recentCardIds?.length) {
      return;
    }
    let sortedCards: PrerenderedCardLike[] = [];
    for (let id of this.recentCardIds) {
      let card = cards.find((c) => trimJsonExtension(c.url) === id);
      if (card) {
        sortedCards.push(card);
      }
    }
    return sortedCards;
  };

  private get persistedCardId() {
    return this.playgroundPanelService.peekSelection(this.moduleId)?.cardId;
  }

  private get isBaseCardModule() {
    return this.moduleId === `${baseCardRef.module}/${baseCardRef.name}`;
  }

  private firstResult = (results?: PrerenderedCardLike[]) => {
    let card = results?.[0];
    return [card].filter(Boolean) as PrerenderedCardLike[];
  };

  private createNewWhenNoCards = (results?: PrerenderedCardLike[]) => {
    if (!results?.length) {
      if (this.#creationError) {
        // if we have a creation error then don't auto generate a new instance,
        // otherwise we'll trap ourselves in a loop
        this.#creationError = false;
        return;
      }

      // if expanded search returns no instances, create new instance
      afterRender(this.autoGenerateInstance.perform);
      return;
    }
  };

  private generateSampleData = restartableTask(
    async (opts?: { bulkGenerate: boolean }) => {
      if (!this.operatorModeStateService.openFileURL) {
        throw new Error('Please open a file');
      }

      let card = this.card;

      await this.aiAssistantPanelService.openPanel();

      let { commandContext } = this.commandService;
      let sendMessageCommand = new SendAiAssistantMessageCommand(
        commandContext,
      );

      let prompt: string;

      if (opts?.bulkGenerate) {
        prompt = `Generate ${BULK_GENERATED_ITEM_COUNT} additional examples`;
        if (this.args.isFieldDef) {
          prompt += ` on this card's spec.`;
        } else {
          prompt += ` of the attached card instance.`;
        }
      } else {
        prompt = `Fill in sample data`;
        if (this.args.isFieldDef) {
          prompt += ` for this example on the card's spec.`;
        } else if (card) {
          prompt += ` for the attached card instance.`;
        } else {
          // if there is no selected card for some reason (maybe an error case),
          // AI can generate sample card instances using the specified moduleId
          // otherwise it complains about not having an open card or
          // generates instances for all card definitions on the file
          prompt += ` for the selected module ${this.moduleId} in the attached file.`;
        }
      }

      await sendMessageCommand.execute({
        roomId: this.matrixService.currentRoomId,
        prompt,
        openCardIds: card?.id ? [card.id] : undefined,
        attachedCards: card ? [card] : undefined,
        attachedFileURLs: [this.operatorModeStateService.openFileURL],
        realmUrl: this.operatorModeStateService.realmURL.href,
      });
      this.closeInstanceChooser();
    },
  );

  private createListingWithAI = restartableTask(async () => {
    let { commandContext } = this.commandService;
    await new ListingInitCommand(commandContext).execute({
      actionType: 'create',
      attachedCard: this.card ? this.card : undefined,
    });
  });

  <template>
    {{consumeContext this.makeCardResource}}

    {{#if this.query}}
      <PrerenderedCardSearch
        @query={{this.query}}
        @format='fitted'
        @realms={{this.recentRealms}}
        @isLive={{true}}
      >
        <:response as |cards|>
          {{#if (this.showResults cards)}}
            {{#let (this.getSortedCards cards) as |sortedCards|}}
              {{afterRender (fn this.processSearchResults sortedCards)}}
            {{/let}}
          {{else if this.expandedQuery}}
            <PrerenderedCardSearch
              @query={{this.expandedQuery}}
              @format='fitted'
              @realms={{this.realmServer.availableRealmURLs}}
            >
              <:response as |maybeCards|>
                {{! TODO: remove side-effects for instance chooser in CS-8746 }}
                {{this.createNewWhenNoCards maybeCards}}
                {{#let (this.firstResult maybeCards) as |cards|}}
                  {{afterRender (fn this.processSearchResults cards)}}
                {{/let}}
              </:response>
            </PrerenderedCardSearch>
          {{/if}}
        </:response>
      </PrerenderedCardSearch>
    {{/if}}

    {{#if this.fieldChooserIsOpen}}
      <ToElsewhere
        @named='playground-field-picker'
        @send={{component
          FieldPickerModal
          instances=this.fieldInstances
          selectedIndex=this.dropdownSelection.fieldIndex
          onSelect=this.chooseField
          onClose=this.closeFieldChooser
          name=(if this.field (cardTypeDisplayName this.field))
        }}
      />
    {{/if}}

    <section class='playground-panel' data-test-playground-panel>
      <div class='playground-panel-content' style={{this.setMaxWidth}}>
        {{#if this.isLoading}}
          <LoadingIndicator @color='var(--boxel-light)' />
        {{else}}
          {{#let (if @isFieldDef this.field this.card) as |card|}}
            {{#let
              (component
                InstanceSelectDropdown
                isFieldDef=@isFieldDef
                cardOptions=this.cardOptions
                fieldOptions=this.fieldInstances
                findSelectedCard=this.findSelectedCard
                selection=this.dropdownSelection
                onSelect=this.onSelect
                moduleId=this.moduleId
                persistSelections=this.persistSelections
                recentCardIds=this.recentCardIds
                afterMenuOptions=this.afterMenuOptions
              )
              as |InstanceChooser|
            }}
              {{#if this.showError}}
                {{! this is for types--cardError is always true in this case !}}
                {{#if this.cardError}}
                  <CardContainer
                    class='error-container'
                    @displayBoundaries={{true}}
                    data-test-error-container
                  >
                    <CardError
                      @message={{this.errorMessage}}
                      @error={{this.cardError}}
                      @cardCreationError={{this.cardError.meta.isCreationError}}
                      @fileToFixWithAi={{this.currentFileDef}}
                    >
                      <:error>
                        <div class='instance-chooser-container'>
                          <InstanceChooser />
                        </div>
                      </:error>
                    </CardError>
                  </CardContainer>
                {{/if}}
              {{else if card}}
                <div
                  class='preview-area'
                  data-test-field-preview-card={{@isFieldDef}}
                >
                  <PlaygroundPreview
                    @card={{card}}
                    @format={{this.format}}
                    @realmInfo={{this.realmInfo}}
                    @contextMenuItems={{this.contextMenuItems}}
                    @onEdit={{if this.setEditMode (fn this.setFormat 'edit')}}
                    @onFinishEditing={{if
                      (eq this.format 'edit')
                      (fn this.setFormat this.defaultFormat)
                    }}
                    @isFieldDef={{@isFieldDef}}
                  />
                </div>
                <section class='instance-chooser-container'>
                  <InstanceChooser />
                  <FormatChooser
                    class='format-chooser'
                    @formats={{if @isFieldDef this.fieldFormats}}
                    @format={{this.format}}
                    @setFormat={{this.setFormat}}
                    data-test-playground-format-chooser
                  />
                </section>
              {{else if this.createNewIsRunning}}
                <LoadingIndicator @color='var(--boxel-light)' />
              {{else if this.maybeGenerateFieldSpec}}
                <SpecSearch
                  @query={{this.specQuery}}
                  @realms={{this.realmServer.availableRealmURLs}}
                  @createNewCard={{this.createNew}}
                />
              {{/if}}
            {{/let}}
          {{/let}}
        {{/if}}
      </div>
    </section>

    <style scoped>
      .playground-panel {
        background-image: url('./playground-background.png');
        background-position: left top;
        background-repeat: repeat;
        background-size: 22.5px;
        height: 100%;
        width: 100%;
        background-color: var(--boxel-dark);
        font: var(--boxel-font-sm);
        letter-spacing: var(--boxel-lsp-xs);
        overflow: auto;
      }
      .playground-panel-content {
        --playground-padding: var(--boxel-sp-sm);
        display: flex;
        flex-direction: column;
        gap: var(--boxel-sp);
        min-height: 100%;
        margin-inline: auto;
        padding: var(--playground-padding);
      }
      .preview-area {
        flex-grow: 1;
        z-index: 0;
        display: flex;
        flex-direction: column;
      }
      .instance-chooser-container {
        position: sticky;
        bottom: var(--playground-padding);
        border: 1px solid var(--boxel-450);
        margin: 0 auto;
        width: 380px;
        justify-content: space-between;

        /* It’s meant to have two rounded borders, this removes a gap */
        border-radius: calc(var(--boxel-border-radius) + 1px);
      }
      .instance-chooser-container :deep(.instance-chooser) {
        border-radius: 0;
        border-top-left-radius: var(--boxel-border-radius);
        border-top-right-radius: var(--boxel-border-radius);
      }
      .format-chooser {
        border-bottom-left-radius: var(--boxel-border-radius);
        border-bottom-right-radius: var(--boxel-border-radius);
      }
      .error-container {
        flex-grow: 1;
        display: grid;
        grid-template-rows: max-content 1fr;
        position: unset;

        --card-error-header-height: calc(
          40px + var(--boxel-form-control-height) + var(--boxel-sp)
        );
      }
      .error-container :deep(.instance-chooser) {
        border-radius: var(--boxel-border-radius);
        box-shadow: var(--boxel-deep-box-shadow);
      }
      .card-error-detail :deep(.instance-chooser) {
        border-radius: var(--boxel-border-radius);
      }
    </style>
  </template>
}

function afterRender(callback: () => void) {
  schedule('afterRender', callback);
}
