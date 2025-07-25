import { array, fn } from '@ember/helper';
import { action } from '@ember/object';
import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import FreestyleUsage from 'ember-freestyle/components/freestyle/usage';

import menuItem from '../../helpers/menu-item.ts';
import BoxelButton from '../button/index.gts';
import BoxelMenu from '../menu/index.gts';
import BoxelDropdown from './index.gts';

export default class BoxelDropdownUsage extends Component {
  @tracked shouldDropdownAutoClose = false;

  @action log(string: string): void {
    console.log(string);
  }

  <template>
    <FreestyleUsage @name='Dropdown'>
      <:description>
        This component is a building block for more complex components. By
        default this component will render the dropdown in the body using
        #-in-element and absolutely position it to place it in the proper
        coordinates relative to the trigger. Consider using
        <a
          href='https://github.com/josemarluedke/ember-focus-trap'
        >ember-focus-trap</a>
        within the content block to improve accessibility when the dropdown is
        open.
      </:description>
      <:example>
        <BoxelDropdown @autoClose={{this.shouldDropdownAutoClose}}>
          <:trigger as |bindings|>
            <BoxelButton {{bindings}}>
              Trigger
            </BoxelButton>
          </:trigger>
          <:content as |dd|>
            <BoxelMenu
              @closeMenu={{dd.close}}
              @items={{array
                (menuItem
                  'Duplicate' (fn this.log 'Duplicate menu item clicked')
                )
                (menuItem 'Share' (fn this.log 'Share menu item clicked'))
              }}
            />
          </:content>
        </BoxelDropdown>

        {{! Note: the shape of the PublicAPI object passed to the optional
        registerAPI action is as follows:

          {
            uniqueId: string;
            disabled: boolean;
            isOpen: boolean;
            actions: {
              toggle: (e?: Event) => void;
              close: (e?: Event, skipFocus?: boolean) => void;
              open: (e?: Event) => void;
              reposition: (...args: any[]) => undefined | RepositionChanges;
            };
          }
        }}
      </:example>
      <:api as |Args|>
        <Args.String
          @name='contentClass'
          @description='CSS Class to apply to the dropdown content div'
          @hideControls={{true}}
        />
        <Args.Bool
          @name='matchTriggerWidth'
          @description='Whether to match the width of the trigger'
          @hideControls={{true}}
        />
        <Args.Action
          @name='registerAPI'
          @description='Action called when the publicAPI changes, passing the publicAPI object.'
        />
        <Args.Action
          @name='onClose'
          @description='Action called when the dropdown is closing'
        />
        <Args.Bool
          @name='autoClose'
          @optional={{true}}
          @description='Whether the dropdown should automatically close when mouse leaves the dropdown content'
          @value={{this.shouldDropdownAutoClose}}
          @onInput={{fn (mut this.shouldDropdownAutoClose)}}
        />
        <Args.Yield
          @name='trigger'
          @description='Content to be used as trigger for basic dropdown. Yields a bindings modifier which applies aria- attributes and event handling.'
        />
        <Args.Yield
          @name='content'
          @description='Content to show on dropdown. The provided block is rendered when trigger is triggered. Yields close action to close the dropdown'
        />
      </:api>
    </FreestyleUsage>
  </template>
}
