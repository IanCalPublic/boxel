import { registerDestructor } from '@ember/destroyable';
import type Owner from '@ember/owner';
import { service } from '@ember/service';

import { buildWaiter } from '@ember/test-waiters';
import { isTesting } from '@embroider/macros';
import Component from '@glimmer/component';

import { task } from 'ember-concurrency';
import perform from 'ember-concurrency/helpers/perform';

import FromElseWhere from 'ember-elsewhere/components/from-elsewhere';

import { provide } from 'ember-provide-consume-context';

import { Modal } from '@cardstack/boxel-ui/components';

import { or, not } from '@cardstack/boxel-ui/helpers';

import {
  GetCardContextName,
  GetCardsContextName,
  GetCardCollectionContextName,
} from '@cardstack/runtime-common';

import Auth from '@cardstack/host/components/matrix/auth';

import CodeSubmode from '@cardstack/host/components/operator-mode/code-submode';
import HostSubmode from '@cardstack/host/components/operator-mode/host-submode';
import InteractSubmode from '@cardstack/host/components/operator-mode/interact-submode';
import { getCardCollection } from '@cardstack/host/resources/card-collection';
import { getCard } from '@cardstack/host/resources/card-resource';
import { getSearch } from '@cardstack/host/resources/search';

import MessageService from '@cardstack/host/services/message-service';

import CardCatalogModal from '../card-catalog/modal';
import { Submodes } from '../submode-switcher';

import ChooseFileModal from './choose-file-modal';

import type BillingService from '../../services/billing-service';
import type CardService from '../../services/card-service';
import type MatrixService from '../../services/matrix-service';
import type OperatorModeStateService from '../../services/operator-mode-state-service';
import type RealmServerService from '../../services/realm-server';

const waiter = buildWaiter('operator-mode-container:saveCard-waiter');

interface Signature {
  Args: {
    onClose: () => void;
  };
}

export default class OperatorModeContainer extends Component<Signature> {
  @service private declare billingService: BillingService;
  @service private declare cardService: CardService;
  @service declare matrixService: MatrixService;
  @service private declare operatorModeStateService: OperatorModeStateService;
  @service private declare messageService: MessageService;
  @service declare realmServer: RealmServerService;

  constructor(owner: Owner, args: Signature['Args']) {
    super(owner, args);
    this.messageService.register();

    registerDestructor(this, () => {
      this.operatorModeStateService.clearStacks();
    });
  }

  @provide(GetCardContextName)
  // @ts-ignore "getCard" is declared but not used
  private get getCard() {
    return getCard;
  }

  @provide(GetCardsContextName)
  // @ts-ignore "getCards" is declared but not used
  private get getCards() {
    return getSearch;
  }

  @provide(GetCardCollectionContextName)
  // @ts-ignore "getCardCollection" is declared but not used
  private get getCardCollection() {
    return getCardCollection;
  }

  private saveSource = task(async (url: URL, content: string) => {
    await this.withTestWaiters(async () => {
      await this.cardService.saveSource(url, content, 'editor');
    });
  });

  private async withTestWaiters<T>(cb: () => Promise<T>) {
    let token = waiter.beginAsync();
    try {
      let result = await cb();
      // only do this in test env--this makes sure that we also wait for any
      // interior card instance async as part of our ember-test-waiters
      if (isTesting()) {
        await this.cardService.cardsSettled();
      }
      return result;
    } finally {
      waiter.endAsync(token);
    }
  }

  private get isCodeMode() {
    return this.operatorModeStateService.state?.submode === Submodes.Code;
  }

  private get isHostMode() {
    return this.operatorModeStateService.state?.submode === Submodes.Host;
  }

  <template>
    <Modal
      class='operator-mode'
      @size='full-screen'
      @isOpen={{true}}
      @onClose={{@onClose}}
      @isOverlayDismissalDisabled={{true}}
      @boxelModalOverlayColor='var(--operator-mode-bg-color)'
    >
      <ChooseFileModal />
      <CardCatalogModal />
      <FromElseWhere @name='restore-patched-file-modal' />

      {{#if
        (or
          (not this.matrixService.isLoggedIn)
          this.matrixService.isInitializingNewUser
        )
      }}
        <Auth />
      {{else if this.isCodeMode}}
        <CodeSubmode @saveSourceOnClose={{perform this.saveSource}} />
      {{else if this.isHostMode}}
        <HostSubmode />
      {{else}}
        <InteractSubmode />
      {{/if}}
    </Modal>

    <style scoped>
      :global(:root) {
        --boxel-sp-xxl: 2.5rem; /* 40px */
        --boxel-sp-lg: 1.25rem; /* 20px */
        --boxel-sp-xs: 0.625rem; /* 10px */
        --operator-mode-bg-color: #686283;
        --boxel-modal-max-width: 100%;
        --container-button-size: 2.5rem;
        --operator-mode-min-width: 20.5rem;
        --operator-mode-left-column: 21.5rem; /* 344px */
        --operator-mode-spacing: var(--boxel-sp-xs);
        --operator-mode-top-bar-item-height: var(--container-button-size);
        --operator-mode-bottom-bar-item-height: var(--container-button-size);
      }
      :global(button:focus:not(:disabled)) {
        outline-color: var(--boxel-header-text-color, var(--boxel-highlight));
        outline-offset: -2px;
      }
      :global(button:focus:not(:focus-visible)) {
        outline-color: transparent;
      }
      :global(dialog:focus) {
        outline: none;
      }
      :global(.operator-mode .boxel-modal__inner) {
        display: block;
      }
      :global(.input-container .invalid + .validation-icon-container) {
        display: none;
      }
      .operator-mode {
        min-width: var(--operator-mode-min-width);
      }
      .operator-mode > div {
        align-items: flex-start;
      }
      .payment-setup-container {
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        min-height: 100%;
        padding: var(--boxel-sp-lg);
      }
      .loading-spinner-container {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100vh;
      }
      .loading-spinner {
        width: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
      }
      .loading-spinner-text {
        color: var(--boxel-light);
        font-size: 12px;
        font-weight: 600;
      }
      .loading {
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100vh;
        padding: var(--boxel-sp);
        color: var(--boxel-light);
        font: 500 var(--boxel-font);

        --icon-color: var(--boxel-light);
      }
      .loading__message {
        margin-left: var(--boxel-sp-5xs);
      }
      .loading :deep(.boxel-loading-indicator) {
        display: flex;
        justify: center;
        align-items: center;
      }
    </style>
  </template>
}
