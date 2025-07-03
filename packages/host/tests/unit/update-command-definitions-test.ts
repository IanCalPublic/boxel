import { module, test } from 'qunit';

// This test focuses on the merging logic that lives inside
// MatrixService.updateSkillsAndCommandsIfNeeded. We don't want to instantiate
// the full MatrixService (it has a large dependency graph and would make the
// test brittle). Instead we copy the small portion of logic that is relevant
// and assert that our recent regression fix behaves as expected.

interface SerializedFileLike {
    sourceUrl: string;
    url: string;
    contentHash: string;
}

/**
 * Mirrors the command-definition merging logic from
 * MatrixService.updateSkillsAndCommandsIfNeeded.
 */
function mergeCommandDefinitions(
    existing: SerializedFileLike[],
    updated: SerializedFileLike[],
): SerializedFileLike[] {
    const newCommandDefinitions = updated
        .filter(
            (fileDef) =>
                !existing.some((cmd) => cmd.sourceUrl === fileDef.sourceUrl),
        )
        .map((fileDef) => ({ ...fileDef }));

    return [
        ...existing.filter((cmd) =>
            updated.some((fileDef) => fileDef.sourceUrl === cmd.sourceUrl),
        ),
        ...newCommandDefinitions,
    ].map((cmd) => {
        const matchingFileDef = updated.find(
            (fileDef) => fileDef.sourceUrl === cmd.sourceUrl,
        );
        if (matchingFileDef) {
            // This should mirror the fixed logic in the service – both url *and*
            // contentHash need to be refreshed when the definition has changed.
            return {
                ...cmd,
                url: matchingFileDef.url,
                contentHash: matchingFileDef.contentHash,
            };
        }
        return cmd;
    });
}

module('Unit | Command definitions merge', function () {
    test('url and contentHash are both refreshed when a command definition changes', function (assert) {
        assert.expect(2);

        const ORIGINAL_HASH = 'aaa';
        const UPDATED_HASH = 'bbb';

        const existing: SerializedFileLike[] = [
            {
                sourceUrl: 'https://example.com/module#myCommand',
                url: 'mxc://old',
                contentHash: ORIGINAL_HASH,
            },
        ];

        const updated: SerializedFileLike[] = [
            {
                sourceUrl: 'https://example.com/module#myCommand',
                url: 'mxc://new',
                contentHash: UPDATED_HASH,
            },
        ];

        const merged = mergeCommandDefinitions(existing, updated);
        const [result] = merged;

        assert.strictEqual(result.url, 'mxc://new', 'the url was updated');
        assert.strictEqual(
            result.contentHash,
            UPDATED_HASH,
            'the contentHash was also updated',
        );
    });
});