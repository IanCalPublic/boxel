import { hash } from '@ember/helper';
import { on } from '@ember/modifier';
import { action } from '@ember/object';

import type RouterService from '@ember/routing/router-service';
import { inject as service } from '@ember/service';

import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';

import onClickOutside from 'ember-click-outside/modifiers/on-click-outside';
import { restartableTask, timeout } from 'ember-concurrency';

import { modifier } from 'ember-modifier';

import { TrackedObject } from 'tracked-built-ins';

import {
  Avatar,
  IconButton,
  ResizablePanelGroup,
} from '@cardstack/boxel-ui/components';
import { bool, cn, not } from '@cardstack/boxel-ui/helpers';

import { BoxelIcon } from '@cardstack/boxel-ui/icons';

import { ResolvedCodeRef } from '@cardstack/runtime-common';

import AiAssistantButton from '@cardstack/host/components/ai-assistant/button';
import AiAssistantPanel from '@cardstack/host/components/ai-assistant/panel';
import AiAssistantToast from '@cardstack/host/components/ai-assistant/toast';
import ProfileSettingsModal from '@cardstack/host/components/operator-mode/profile/profile-settings-modal';
import ProfileInfoPopover from '@cardstack/host/components/operator-mode/profile-info-popover';

import config from '@cardstack/host/config/environment';

import type IndexController from '@cardstack/host/controllers';

import { assertNever } from '@cardstack/host/utils/assert-never';

import SearchSheet, {
  SearchSheetMode,
  SearchSheetModes,
} from '../search-sheet';
import SubmodeSwitcher, { Submode, Submodes } from '../submode-switcher';

import AskAiContainer from './ask-ai-container';

import ChooseSubscriptionPlanModal from './choose-subscription-plan-modal';

import NewFileButton, { type NewFileOptions } from './new-file-button';
import WorkspaceChooser from './workspace-chooser';

import type AiAssistantPanelService from '../../services/ai-assistant-panel-service';
import type CommandService from '../../services/command-service';
import type MatrixService from '../../services/matrix-service';
import type OperatorModeStateService from '../../services/operator-mode-state-service';
import type StoreService from '../../services/store';

interface Signature {
  Element: HTMLDivElement;
  Args: {
    onSearchSheetOpened?: () => void;
    onSearchSheetClosed?: () => void;
    onCardSelectFromSearch?: (cardId: string) => void;
    selectedCardRef?: ResolvedCodeRef | undefined;
    newFileOptions?: NewFileOptions;
  };
  Blocks: {
    default: [
      {
        openSearchToPrompt: () => void;
        openSearchToResults: (term: string) => void;
        updateSubmode: (submode: Submode) => void;
      },
    ];
  };
}

let handleWindowResizeModifier = modifier(
  (element, [onWindowResize]: [(width: number) => void]) => {
    let updateWindowWidth = () => {
      let boundingClient = element.getBoundingClientRect();
      onWindowResize(boundingClient.width);
    };
    updateWindowWidth();
    window.addEventListener('resize', updateWindowWidth);

    return () => {
      window.removeEventListener('resize', updateWindowWidth);
    };
  },
);

type PanelWidths = {
  defaultWidth: number | null;
  minWidth: number | null;
};

export default class SubmodeLayout extends Component<Signature> {
  @tracked private searchSheetMode: SearchSheetMode = SearchSheetModes.Closed;
  @tracked private profileSummaryOpened = false;

  private aiPanelWidths: PanelWidths = new TrackedObject({
    defaultWidth: 30,
    minWidth: 25,
  });
  @service private declare commandService: CommandService;
  @service private declare operatorModeStateService: OperatorModeStateService;
  @service private declare matrixService: MatrixService;
  @service private declare router: RouterService;
  @service private declare store: StoreService;
  @service private declare aiAssistantPanelService: AiAssistantPanelService;

  private searchElement: HTMLElement | null = null;
  private suppressSearchClose = false;
  private declare doSearch: (term: string) => void;

  onWindowResize = (windowWidth: number) => {
    let aiPanelDefaultWidthInPixels = 371;
    if (windowWidth < aiPanelDefaultWidthInPixels) {
      aiPanelDefaultWidthInPixels = windowWidth;
    }
    let aiPanelDefaultWidth = (aiPanelDefaultWidthInPixels / windowWidth) * 100;

    this.aiPanelWidths.defaultWidth = aiPanelDefaultWidth;
    this.aiPanelWidths.minWidth = aiPanelDefaultWidth;
  };

  get operatorModeController(): IndexController {
    return this.operatorModeStateService.operatorModeController;
  }

  private get aiAssistantVisibilityClass() {
    return this.aiAssistantPanelService.isOpen
      ? 'ai-assistant-open'
      : 'ai-assistant-closed';
  }

  private get allStackItems() {
    return this.operatorModeStateService.state?.stacks.flat() ?? [];
  }

  private get lastCardIdInRightMostStack() {
    if (this.allStackItems.length <= 0) {
      return null;
    }

    let stackItem = this.allStackItems[this.allStackItems.length - 1];
    return this.store.peek(stackItem.id)?.id;
  }

  private get isToggleWorkspaceChooserDisabled() {
    return this.operatorModeStateService.state.stacks.length === 0;
  }

  @action private async updateSubmode(submode: Submode) {
    switch (submode) {
      case Submodes.Interact:
        await this.operatorModeStateService.updateCodePath(null);
        break;
      case Submodes.Code:
        await this.operatorModeStateService.updateCodePath(
          this.lastCardIdInRightMostStack
            ? new URL(this.lastCardIdInRightMostStack + '.json')
            : null,
        );
        break;
      case Submodes.Host: {
        let currentSubmode = this.operatorModeStateService.state.submode;

        if (currentSubmode === Submodes.Code) {
          this.operatorModeStateService.updateTrail([]);
        } else if (currentSubmode === Submodes.Interact) {
          this.operatorModeStateService.updateTrail(
            this.lastCardIdInRightMostStack
              ? [this.lastCardIdInRightMostStack + '.json']
              : [],
          );
        }

        break;
      }
      default:
        throw assertNever(submode);
    }

    this.operatorModeStateService.updateSubmode(submode);
  }

  @action private closeSearchSheet() {
    if (this.suppressSearchClose) {
      return;
    }
    this.searchSheetMode = SearchSheetModes.Closed;
    this.args.onSearchSheetClosed?.();
  }

  @action private expandSearchToShowResults(_term: string) {
    this.searchSheetMode = SearchSheetModes.SearchResults;
  }

  @action private openSearchSheetToPrompt() {
    if (this.searchSheetMode === SearchSheetModes.Closed) {
      this.searchSheetMode = SearchSheetModes.SearchPrompt;
    }

    this.searchElement?.focus();
    this.args.onSearchSheetOpened?.();
  }

  @action private async handleCardSelectFromSearch(cardId: string) {
    this.args.onCardSelectFromSearch?.(cardId);
    this.closeSearchSheet();
  }

  private get workspaceChooserOpened() {
    return this.operatorModeStateService.workspaceChooserOpened;
  }

  private set workspaceChooserOpened(workspaceChooserOpened: boolean) {
    this.operatorModeStateService.workspaceChooserOpened =
      workspaceChooserOpened;
  }

  @action private toggleWorkspaceChooser() {
    this.operatorModeStateService.workspaceChooserOpened =
      !this.operatorModeStateService.workspaceChooserOpened;
  }

  @action private toggleProfileSettings() {
    this.operatorModeStateService.toggleProfileSettings();

    this.profileSummaryOpened = false;
  }

  @action private toggleSubscriptionPlans() {
    this.isChooseSubscriptionPlanModalOpen =
      !this.isChooseSubscriptionPlanModalOpen;

    this.profileSummaryOpened = false;
  }

  @action private toggleProfileSummary() {
    this.profileSummaryOpened = !this.profileSummaryOpened;
  }

  @action
  private storeSearchElement(element: HTMLElement) {
    this.searchElement = element;
    this.searchElement.focus();
  }
  @action
  private openSearchAndShowResults(term: string) {
    this.doOpenSearchAndShowResults.perform(term);
  }

  @action
  private setupSearch(doSearch: (term: string) => void) {
    this.doSearch = doSearch;
  }

  private doOpenSearchAndShowResults = restartableTask(async (term: string) => {
    this.suppressSearchClose = true;

    let wasClosed = this.searchSheetMode === SearchSheetModes.Closed;
    this.searchSheetMode = SearchSheetModes.SearchResults;
    this.searchElement?.focus();
    if (wasClosed) {
      this.args.onSearchSheetOpened?.();
    }
    this.doSearch(term);

    // we need to prevent the onblur of the search sheet from triggering a
    // search sheet close from the click that actually triggered the search
    // sheet to show in the first place
    await timeout(250);
    this.suppressSearchClose = false;
  });

  @tracked private isChooseSubscriptionPlanModalOpen = false;

  <template>
    <div
      {{handleWindowResizeModifier this.onWindowResize}}
      class='submode-layout {{this.aiAssistantVisibilityClass}}'
      ...attributes
    >
      <ResizablePanelGroup
        @orientation='horizontal'
        class='columns'
        as |ResizablePanel ResizeHandle|
      >
        <ResizablePanel class='main-panel'>
          <div class='top-left-menu'>
            <IconButton
              @icon={{BoxelIcon}}
              @width='40px'
              @height='40px'
              disabled={{this.isToggleWorkspaceChooserDisabled}}
              class={{cn
                'workspace-button'
                workspace-button--dark=(not this.workspaceChooserOpened)
              }}
              {{on 'click' this.toggleWorkspaceChooser}}
              data-test-workspace-chooser-toggle
            />
            {{#if this.workspaceChooserOpened}}
              <span
                class='boxel-title'
                data-test-submode-layout-title
              >BOXEL</span>
            {{else}}
              <SubmodeSwitcher
                class='submode-switcher'
                @submode={{this.operatorModeStateService.state.submode}}
                @onSubmodeSelect={{this.updateSubmode}}
              />
              {{#if @newFileOptions}}
                <NewFileButton
                  class='new-file-button'
                  @dropdownOptions={{@newFileOptions}}
                  @initiallyOpened={{bool
                    this.operatorModeStateService.state.newFileDropdownOpen
                  }}
                />
              {{/if}}
            {{/if}}
          </div>
          {{#if this.workspaceChooserOpened}}
            <WorkspaceChooser />
          {{/if}}

          {{yield
            (hash
              openSearchToPrompt=this.openSearchSheetToPrompt
              openSearchToResults=this.openSearchAndShowResults
              updateSubmode=this.updateSubmode
            )
          }}
          <button
            class='profile-icon-button'
            {{on 'click' this.toggleProfileSummary}}
            data-test-profile-icon-button
          >
            <Avatar
              @isReady={{this.matrixService.profile.loaded}}
              @userId={{this.matrixService.userId}}
              @displayName={{this.matrixService.profile.displayName}}
            />
          </button>
          {{#if @onCardSelectFromSearch}}
            <SearchSheet
              @mode={{this.searchSheetMode}}
              @onSetup={{this.setupSearch}}
              @onBlur={{this.closeSearchSheet}}
              @onCancel={{this.closeSearchSheet}}
              @onFocus={{this.openSearchSheetToPrompt}}
              @onSearch={{this.expandSearchToShowResults}}
              @onCardSelect={{this.handleCardSelectFromSearch}}
              @onInputInsertion={{this.storeSearchElement}}
            />
          {{/if}}
          <AiAssistantToast
            @hide={{this.aiAssistantPanelService.isOpen}}
            @onViewInChatClick={{this.aiAssistantPanelService.openPanel}}
          />
          {{#if config.featureFlags.SHOW_ASK_AI}}
            {{#if (not this.aiAssistantPanelService.isOpen)}}
              <AskAiContainer />
            {{/if}}
          {{/if}}
          <AiAssistantButton
            class='chat-btn'
            @isActive={{this.aiAssistantPanelService.isOpen}}
            {{on
              'click'
              (if
                this.aiAssistantPanelService.isOpen
                this.aiAssistantPanelService.closePanel
                this.aiAssistantPanelService.openPanel
              )
            }}
          />
          {{#if this.profileSummaryOpened}}
            <ProfileInfoPopover
              {{onClickOutside
                this.toggleProfileSummary
                exceptSelector='.profile-icon-button'
              }}
              @toggleProfileSettings={{this.toggleProfileSettings}}
              @toggleSubscriptionPlans={{this.toggleSubscriptionPlans}}
            />
          {{/if}}
        </ResizablePanel>
        {{#if this.aiAssistantPanelService.isOpen}}
          <ResizablePanel
            class='ai-assistant-resizable-panel'
            @defaultSize={{this.aiPanelWidths.defaultWidth}}
            @minSize={{this.aiPanelWidths.minWidth}}
            @collapsible={{false}}
          >
            <AiAssistantPanel
              @onClose={{this.aiAssistantPanelService.closePanel}}
              @resizeHandle={{ResizeHandle}}
              @selectedCardRef={{@selectedCardRef}}
              class={{cn
                'ai-assistant-panel'
                left-border=this.workspaceChooserOpened
              }}
            />
          </ResizablePanel>
        {{/if}}
      </ResizablePanelGroup>
    </div>

    {{#if this.operatorModeStateService.profileSettingsOpen}}
      <ProfileSettingsModal
        @toggleProfileSettings={{this.toggleProfileSettings}}
      />
    {{/if}}

    <ChooseSubscriptionPlanModal
      @isModalOpen={{this.isChooseSubscriptionPlanModalOpen}}
      @onClose={{this.toggleSubscriptionPlans}}
    />

    <style scoped>
      .submode-layout {
        --submode-bar-item-border-radius: var(--boxel-border-radius);
        --boxel-icon-button-width: var(--container-button-size);
        --boxel-icon-button-height: var(--container-button-size);
        display: flex;
        height: 100%;
      }

      .submode-layout > .boxel-panel-group {
        width: 100%;
      }

      .ai-assistant-resizable-panel {
        overflow: initial;
      }

      .main-panel {
        position: relative;
      }

      .ai-assistant-open {
        grid-template-columns: 1.5fr 0.5fr;
      }

      .chat-btn {
        position: absolute;
        bottom: var(--operator-mode-spacing);
        right: var(--operator-mode-spacing);
        background-color: var(--boxel-ai-purple);
        box-shadow: var(--submode-bar-item-box-shadow);
        z-index: var(--host-ai-panel-button-z-index);
      }

      .ai-assistant-panel {
        z-index: var(--host-ai-panel-z-index);
      }

      .top-left-menu {
        width: var(--operator-mode-left-column);
        position: absolute;
        top: 0;
        left: 0;
        padding: var(--operator-mode-spacing);
        z-index: var(--host-top-left-menu-z-index);

        display: flex;
        align-items: center;
      }
      .top-left-menu
        > :deep(* + *:not(.ember-basic-dropdown-content-wormhole-origin)) {
        margin-left: var(--operator-mode-spacing);
      }

      .code-submode-layout .top-left-menu {
        background-color: var(--code-mode-top-bar-background-color);
      }

      .boxel-title {
        color: var(--boxel-light);
        font: 900 var(--boxel-font-size-med) 'Rustica';
        letter-spacing: 3px;
      }

      .submode-switcher {
        border: none;
        border-radius: var(--submode-bar-item-border-radius);
        box-shadow: var(--submode-bar-item-box-shadow);
        outline: var(--submode-bar-item-outline);
      }
      .submode-switcher
        :deep(.submode-switcher-dropdown-trigger):focus:not(:focus-visible),
      .submode-switcher
        :deep(.submode-switcher-dropdown-trigger):focus:not(:disabled) {
        outline-offset: unset;
      }

      .new-file-button {
        border: none;
        border-radius: var(--submode-bar-item-border-radius);
        box-shadow: var(--submode-bar-item-box-shadow);
      }

      .profile-icon-button {
        --boxel-icon-button-width: var(--container-button-size);
        --boxel-icon-button-height: var(--container-button-size);
        position: absolute;
        top: var(--operator-mode-spacing);
        right: var(--operator-mode-spacing);
        padding: 0;
        background: none;
        border: none;
        border-radius: 50%;
        box-shadow: var(--submode-bar-item-box-shadow);
        z-index: var(--host-profile-z-index);
      }

      .workspace-button {
        border: none;
        border-radius: var(--submode-bar-item-border-radius);
        box-shadow: var(--submode-bar-item-box-shadow);
        flex-shrink: 0;
      }
      .workspace-button:focus:not(:focus-visible) {
        outline-offset: unset;
      }
      .workspace-button:focus:not(:disabled) {
        outline-offset: 1px;
      }
      .workspace-button--dark {
        --icon-bg-opacity: 1;
        --icon-color: var(--boxel-dark);
        outline: var(--submode-bar-item-outline);
      }
      .workspace-button--dark:focus:not(:focus-visible) {
        outline: var(--submode-bar-item-outline);
        outline-offset: 0px;
      }
      .workspace-button--dark:focus:focus-visible {
        outline-width: 2px;
        outline-offset: 0px;
      }

      :deep(.open-search-field) {
        box-shadow: var(--submode-bar-item-box-shadow);
        outline: var(--submode-bar-item-outline);
      }
    </style>
  </template>
}
