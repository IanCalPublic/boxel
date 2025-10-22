/*
 * @fileoverview Ensure that linksTo and linksToMany use thunks (arrow functions)
 *               when referring to the same card definition (self-reference) or to a
 *               card defined later in the file (forward-reference).
 *
 * For example:
 *   class CardA extends CardDef {
 *     @field friend = linksTo(CardA); // self-reference, must use thunk
 *     @field foe    = linksTo(CardB); // CardB declared later, must use thunk
 *   }
 *   class CardB extends CardDef {}
 *
 * Should be rewritten to:
 *   class CardA extends CardDef {
 *     @field friend = linksTo(() => CardA);
 *     @field foe    = linksTo(() => CardB);
 *   }
 *
 * The rule auto-fixes offending usages by wrapping the identifier in an arrow
 * function. If the first argument is already an arrow function it is ignored.
 */
'use strict';

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
    meta: {
        type: 'suggestion',
        docs: {
            description:
                'Require thunks (arrow functions) for linksTo/linksToMany when referring to self or to a card defined later in the file',
            recommended: true,
            url: 'https://github.com/cardstack/boxel/blob/main/packages/eslint-plugin-boxel/docs/rules/links-to-require-thunk.md',
        },
        fixable: 'code',
        schema: [],
        messages: {
            needThunk:
                "Wrap '{{name}}' in an arrow function when using linksTo/linksToMany to reference itself or a card defined later in the file",
        },
    },

    /**
     * @param {import('eslint').Rule.RuleContext} context
     */
    create(context) {
        // Map of class name -> start position (index of first char in source code)
        /** @type {Map<string, number>} */
        const classPositions = new Map();

        //--------------------------------------------------------------------------
        // Helpers
        //--------------------------------------------------------------------------

        /**
         * Find the nearest ancestor ClassDeclaration node.
         * @param {import('estree').Node} node
         * @returns {import('estree').ClassDeclaration | null}
         */
        function getEnclosingClass(node) {
            let current = node.parent;
            while (current) {
                if (current.type === 'ClassDeclaration') {
                    return current;
                }
                current = current.parent;
            }
            return null;
        }

        //--------------------------------------------------------------------------
        // Visitors
        //--------------------------------------------------------------------------

        return {
            /** Collect positions of class declarations so we can determine forward references. */
            ClassDeclaration(node) {
                if (node.id && node.id.name) {
                    classPositions.set(node.id.name, node.range[0]);
                }
            },

            /**
             * Detect linksTo/linksToMany call expressions.
             * @param {import('estree').CallExpression & { callee: import('estree').Identifier }} node
             */
            CallExpression(node) {
                if (
                    node.callee.type !== 'Identifier' ||
                    (node.callee.name !== 'linksTo' && node.callee.name !== 'linksToMany')
                ) {
                    return;
                }

                const firstArg = node.arguments[0];
                if (!firstArg) {
                    return; // Not our concern
                }

                // If first argument is already an arrow function => already a thunk.
                if (firstArg.type === 'ArrowFunctionExpression') {
                    return;
                }

                // Interested only in identifiers (simple cases) for now
                if (firstArg.type !== 'Identifier') {
                    return;
                }

                const targetName = firstArg.name;
                const callPos = node.range[0];

                const enclosingClass = getEnclosingClass(node);
                let needsThunk = false;

                // Self-reference
                if (enclosingClass && enclosingClass.id && enclosingClass.id.name === targetName) {
                    needsThunk = true;
                } else {
                    // Forward reference (class declared later in the same file)
                    const targetPos = classPositions.get(targetName);
                    if (typeof targetPos === 'number' && targetPos > callPos) {
                        needsThunk = true;
                    }
                }

                if (needsThunk) {
                    context.report({
                        node: firstArg,
                        messageId: 'needThunk',
                        data: { name: targetName },
                        fix(fixer) {
                            // Replace identifier with arrow function returning the identifier
                            return fixer.replaceText(firstArg, `() => ${targetName}`);
                        },
                    });
                }
            },
        };
    },
};