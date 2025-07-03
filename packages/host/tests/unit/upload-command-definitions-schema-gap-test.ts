import { module, test } from 'qunit';
import { getService } from '@universal-ember/test-support';

import { setupRenderingTest } from '../helpers/setup';
import { setupMockMatrix } from '../helpers/mock-matrix';

import { md5 } from 'super-fast-md5';

import { Command as RuntimeCommand } from '@cardstack/runtime-common';
import { baseRealm } from '@cardstack/runtime-common';

import type FileDefManager from '@cardstack/host/app/lib/file-def-manager';
import type MatrixService from '@cardstack/host/services/matrix-service';

// We will use a markdown field, which is *not* included in helpers/ai.basicMappings().
// That ensures the generated schema will be missing the corresponding attribute.

module('Unit | FileDefManager.uploadCommandDefinitions - schema gap', function (hooks) {
    setupRenderingTest(hooks);
    // Spin up the matrix mock so that we get a fully-wired FileDefManager instance
    const mockUtils = setupMockMatrix(hooks, {
        loggedInAs: '@user:localhost',
        autostart: true,
    });

    test('unmapped fields are dropped from the parameters schema but MD5 stays consistent', async function (assert) {
        assert.expect(3);

        // ── Grab commonly-used services ────────────────────────────
        const loader = getService('loader-service').loader;
        const matrixService = getService('matrix-service') as MatrixService;

        // Wait for matrixService to finish booting (setupMockMatrix with autostart=true starts it)
        await matrixService.ready;

        // @ts-ignore – private access acceptable in tests
        const fileDefManager: FileDefManager = matrixService._client.fileDefManager;

        // ── Build a card that uses MarkdownField (unmapped) ─────────
        const cardApi = await loader.import(`${baseRealm.url}card-api`);
        const { field, contains, CardDef } = cardApi;
        const { default: StringField } = await loader.import(`${baseRealm.url}string`);
        const { default: MarkdownField } = await loader.import(`${baseRealm.url}markdown`);

        class BlogPost extends CardDef {
            @field title = contains(StringField);
            @field body = contains(MarkdownField); // <- unmapped, will disappear
        }

        // ── Build a command whose input type is BlogPost ───────────
        class MyCommand extends (RuntimeCommand as unknown as typeof RuntimeCommand<any, any>) {
            async getInputType() {
                return BlogPost;
            }
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            protected async run() { }
        }

        // Register the two in-memory modules with the virtual network so that
        // Loader.import() inside uploadCommandDefinitions can resolve them.
        loader.virtualNetwork.shimModule('https://example.com/BlogPost', { BlogPost });
        loader.virtualNetwork.shimModule('https://example.com/MyCommand', { default: MyCommand });

        // ── Construct the CommandField record exactly as a skill card would ──
        const commandField: any = {
            functionName: 'myCommand',
            codeRef: { module: 'https://example.com/MyCommand', name: 'default' },
        };

        // ── Act: upload the command definition ──────────────────────
        const [fileDef] = await fileDefManager.uploadCommandDefinitions([commandField]);

        // Pull the raw bytes back out of the mock Matrix server. The mock Matrix
        // SDK stores uploaded media in its in-memory ServerState which we can
        // reach via the SDK instance hanging off MatrixService.
        // @ts-ignore private access in test
        const sdk = matrixService._client;
        const contentArrayBuffer: ArrayBuffer | undefined = sdk.serverState.getContent(fileDef.url);

        assert.ok(contentArrayBuffer, 'content was found in mock server state');

        const downloadedText = new TextDecoder().decode(contentArrayBuffer!);
        const parsed = JSON.parse(downloadedText);

        // Ensure the unmapped field is indeed absent while a mapped field exists
        assert.notOk(
            parsed.tool.function.parameters.properties.attributes?.properties?.body,
            'markdown-based "body" field is missing (schema gap demonstrated)',
        );

        // Verify that the MD5 in FileDef matches the MD5 of the *actual* bytes
        const calculatedHash = md5(downloadedText);
        assert.strictEqual(
            calculatedHash,
            fileDef.contentHash,
            'MD5 stored in FileDef matches md5 of downloaded content',
        );
    });
});