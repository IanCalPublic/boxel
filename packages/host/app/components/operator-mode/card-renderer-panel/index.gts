import { registerDestructor } from '@ember/destroyable';
import { array } from '@ember/helper';
import { service } from '@ember/service';
import Component from '@glimmer/component';

import { task } from 'ember-concurrency';

import perform from 'ember-concurrency/helpers/perform';
import Modifier from 'ember-modifier';

import { provide } from 'ember-provide-consume-context';

import {
  BoxelDropdown,
  IconButton,
  Menu as BoxelMenu,
  RealmIcon,
  Tooltip,
} from '@cardstack/boxel-ui/components';

import { eq, menuItem } from '@cardstack/boxel-ui/helpers';
import { IconLink, Eye, ThreeDotsHorizontal } from '@cardstack/boxel-ui/icons';

import {
  realmURL,
  cardTypeDisplayName,
  RealmURLContextName,
} from '@cardstack/runtime-common';

import CardRenderer from '@cardstack/host/components/card-renderer';

import OperatorModeStateService from '@cardstack/host/services/operator-mode-state-service';

import RealmService from '@cardstack/host/services/realm';

import type { CardDef, Format } from 'https://cardstack.com/base/card-api';

import FormatChooser from '../code-submode/format-chooser';

import EmbeddedPreview from './embedded-preview';
import FittedFormatGallery from './fitted-format-gallery';

interface Signature {
  Element: HTMLElement;
  Args: {
    card: CardDef;
    realmURL: URL;
    format?: Format; // defaults to 'isolated'
    setFormat: (format: Format) => void;
  };
  Blocks: {};
}

export default class CardRendererPanel extends Component<Signature> {
  @service private declare operatorModeStateService: OperatorModeStateService;
  @service private declare realm: RealmService;

  private scrollPositions = new Map<string, number>();
  private copyToClipboard = task(async () => {
    await navigator.clipboard.writeText(this.args.card.id);
  });

  private onScroll = (event: Event) => {
    let scrollPosition = (event.target as HTMLElement).scrollTop;
    this.scrollPositions.set(this.format, scrollPosition);
  };

  private get scrollPosition() {
    return this.scrollPositions.get(this.format);
  }

  private get format(): Format {
    return this.args.format ?? 'isolated';
  }

  private get urlForRealmLookup() {
    let urlForRealmLookup =
      this.args.card?.id ?? this.args?.card?.[realmURL]?.href;
    if (!urlForRealmLookup) {
      throw new Error(
        `bug: cannot determine a URL to use for realm lookup of a card--this should always be set even for new cards`,
      );
    }
    return urlForRealmLookup;
  }

  @provide(RealmURLContextName)
  get realmURL() {
    return this.args.realmURL;
  }

  openInInteractMode = () => {
    this.operatorModeStateService.openCardInInteractMode(this.args.card.id);
  };

  <template>
    <div
      class='card-renderer-header'
      data-test-code-mode-card-renderer-header={{@card.id}}
      ...attributes
    >
      <RealmIcon @realmInfo={{this.realm.info this.urlForRealmLookup}} />
      <div class='header-title'>
        {{cardTypeDisplayName @card}}
      </div>
      <div class='header-actions'>
        <BoxelDropdown class='card-options'>
          <:trigger as |bindings|>
            <Tooltip @placement='top'>
              <:trigger>
                <IconButton
                  @icon={{ThreeDotsHorizontal}}
                  @width='20px'
                  @height='20px'
                  class='icon-button'
                  aria-label='Options'
                  data-test-more-options-button
                  {{bindings}}
                />
              </:trigger>
              <:content>
                More Options
              </:content>
            </Tooltip>
          </:trigger>
          <:content as |dd|>
            <BoxelMenu
              @closeMenu={{dd.close}}
              @items={{array
                (menuItem
                  'Copy Card URL' (perform this.copyToClipboard) icon=IconLink
                )
              }}
            />
            <BoxelMenu
              @closeMenu={{dd.close}}
              @items={{array
                (menuItem
                  'Open in Interact Mode' this.openInInteractMode icon=Eye
                )
              }}
            />
          </:content>
        </BoxelDropdown>
      </div>
    </div>

    <div
      class='card-renderer-body'
      data-test-code-mode-card-renderer-body
      {{ScrollModifier
        initialScrollPosition=this.scrollPosition
        onScroll=this.onScroll
      }}
    >
      <div class='card-renderer-content'>
        {{#if (eq this.format 'fitted')}}
          <FittedFormatGallery @card={{@card}} />
        {{else if (eq this.format 'embedded')}}
          <EmbeddedPreview @card={{@card}} />
        {{else if (eq this.format 'atom')}}
          <div class='atom-wrapper'>
            <CardRenderer @card={{@card}} @format={{this.format}} />
          </div>
        {{else}}
          <CardRenderer @card={{@card}} @format={{this.format}} />
        {{/if}}
      </div>
    </div>
    <div class='card-renderer-format-chooser'>
      <FormatChooser @format={{this.format}} @setFormat={{@setFormat}} />
    </div>

    <style scoped>
      .card-renderer-header {
        background-color: var(--boxel-light);
        padding: var(--boxel-sp);
        display: flex;
        gap: var(--boxel-sp-xxs);
        align-items: center;
      }

      .card-renderer-body {
        flex-grow: 1;
        overflow-y: auto;
      }

      .card-renderer-content {
        height: auto;
        margin: var(--boxel-sp-sm);
      }

      .card-renderer-content > :deep(.boxel-card-container.boundaries) {
        overflow: hidden;
      }

      .header-actions {
        margin-left: auto;
      }

      .header-title {
        font: 600 var(--boxel-font);
        letter-spacing: var(--boxel-lsp-xs);
      }

      .card-renderer-format-chooser {
        background-color: var(--boxel-dark);
        position: sticky;
        bottom: 100px;
        width: 380px;
        margin: 0 auto;
        border-radius: var(--boxel-border-radius);
      }

      :deep(.format-chooser) {
        --boxel-format-chooser-border-color: var(--boxel-400);
        margin: 0;
        width: 100%;
        box-shadow: none;
        border-radius: var(--boxel-border-radius);
      }

      .icon-button {
        --boxel-icon-button-width: 28px;
        --boxel-icon-button-height: 28px;
        border-radius: var(--boxel-border-radius-xs);

        display: flex;
        align-items: center;
        justify-content: center;

        font: var(--boxel-font-sm);
        margin-left: var(--boxel-sp-xxxs);
        z-index: 1;
      }

      .icon-button:not(:disabled):hover {
        background-color: var(--boxel-dark-hover);
      }
      .atom-wrapper {
        padding: var(--boxel-sp);
      }
    </style>
  </template>
}

interface ScrollSignature {
  Args: {
    Named: {
      initialScrollPosition?: number;
      onScroll?: (event: Event) => void;
    };
  };
}

class ScrollModifier extends Modifier<ScrollSignature> {
  modify(
    element: HTMLElement,
    _positional: [],
    { initialScrollPosition = 0, onScroll }: ScrollSignature['Args']['Named'],
  ) {
    // note that when testing make sure "disable cache" in chrome network settings is unchecked,
    // as this assumes that previously loaded images will be cached. otherwise the scroll will
    // happen *before* the geometry is altered by images that haven't completed loading yet.
    element.scrollTop = initialScrollPosition;
    if (onScroll) {
      element.addEventListener('scroll', onScroll);
      registerDestructor(this, () => {
        element.removeEventListener('scroll', onScroll);
      });
    }
  }
}
