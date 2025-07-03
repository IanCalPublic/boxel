/*
 * @fileoverview Tests for links-to-require-thunk rule
 */
'use strict';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const rule = require('../../../lib/rules/links-to-require-thunk');
const RuleTester = require('eslint').RuleTester;

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

const ruleTester = new RuleTester({
    parser: require.resolve('ember-eslint-parser'),
    parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

ruleTester.run('links-to-require-thunk', rule, {
    valid: [
        // Self-reference already using thunk
        `
      class CardA extends CardDef {
        @field friend = linksTo(() => CardA);
      }
    `,
        // Forward reference already using thunk
        `
      class CardA extends CardDef {
        @field friend = linksTo(() => CardB);
      }

      class CardB extends CardDef {}
    `,
        // linksToMany with thunk
        `
      class CardA extends CardDef {
        @field friends = linksToMany(() => CardA);
      }
    `,
    ],

    invalid: [
        {
            // Self-reference without thunk
            code: `
        class CardA extends CardDef {
          @field friend = linksTo(CardA);
        }
      `,
            output: `
        class CardA extends CardDef {
          @field friend = linksTo(() => CardA);
        }
      `,
            errors: [
                {
                    messageId: 'needThunk',
                    type: 'Identifier',
                },
            ],
        },
        {
            // Forward reference without thunk
            code: `
        class CardA extends CardDef {
          @field friend = linksTo(CardB);
        }

        class CardB extends CardDef {}
      `,
            output: `
        class CardA extends CardDef {
          @field friend = linksTo(() => CardB);
        }

        class CardB extends CardDef {}
      `,
            errors: [
                {
                    messageId: 'needThunk',
                    type: 'Identifier',
                },
            ],
        },
        {
            // linksToMany forward reference without thunk
            code: `
        class CardA extends CardDef {
          @field friends = linksToMany(CardB);
        }

        class CardB extends CardDef {}
      `,
            output: `
        class CardA extends CardDef {
          @field friends = linksToMany(() => CardB);
        }

        class CardB extends CardDef {}
      `,
            errors: [
                {
                    messageId: 'needThunk',
                    type: 'Identifier',
                },
            ],
        },
    ],
});