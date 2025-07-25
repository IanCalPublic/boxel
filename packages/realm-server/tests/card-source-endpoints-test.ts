import { module, test } from 'qunit';
import { Test, SuperTest } from 'supertest';
import { join, resolve, basename } from 'path';
import { Server } from 'http';
import { type DirResult } from 'tmp';
import { existsSync, readFileSync } from 'fs-extra';
import {
  cardSrc,
  compiledCard,
} from '@cardstack/runtime-common/etc/test-fixtures';
import {
  baseRealm,
  RealmPaths,
  Realm,
  type LooseSingleCardDocument,
} from '@cardstack/runtime-common';
import {
  setupCardLogs,
  setupBaseRealmServer,
  setupPermissionedRealm,
  setupMatrixRoom,
  createVirtualNetworkAndLoader,
  matrixURL,
  testRealmHref,
  testRealmURL,
  createJWT,
} from './helpers';
import { expectIncrementalIndexEvent } from './helpers/indexing';
import '@cardstack/runtime-common/helpers/code-equality-assertion';
import stripScopedCSSGlimmerAttributes from '@cardstack/runtime-common/helpers/strip-scoped-css-glimmer-attributes';
import { APP_BOXEL_REALM_EVENT_TYPE } from '@cardstack/runtime-common/matrix-constants';
import type { MatrixEvent } from 'https://cardstack.com/base/matrix-event';
import isEqual from 'lodash/isEqual';

module(basename(__filename), function () {
  module('Realm-specific Endpoints | card source requests', function (hooks) {
    let testRealm: Realm;
    let testRealmHttpServer: Server;
    let request: SuperTest<Test>;
    let dir: DirResult;

    function onRealmSetup(args: {
      testRealm: Realm;
      testRealmHttpServer: Server;
      request: SuperTest<Test>;
      dir: DirResult;
    }) {
      testRealm = args.testRealm;
      testRealmHttpServer = args.testRealmHttpServer;
      request = args.request;
      dir = args.dir;
    }

    function getRealmSetup() {
      return {
        testRealm,
        testRealmHttpServer,
        request,
        dir,
      };
    }
    let { virtualNetwork, loader } = createVirtualNetworkAndLoader();

    setupCardLogs(
      hooks,
      async () => await loader.import(`${baseRealm.url}card-api`),
    );

    setupBaseRealmServer(hooks, virtualNetwork, matrixURL);

    module('card source GET request', function (_hooks) {
      module('public readable realm', function (hooks) {
        setupPermissionedRealm(hooks, {
          permissions: {
            '*': ['read'],
          },
          onRealmSetup,
        });

        test('serves the request', async function (assert) {
          let response = await request
            .get('/person.gts')
            .set('Accept', 'application/vnd.card+source');

          assert.strictEqual(response.status, 200, 'HTTP 200 status');
          assert.strictEqual(
            response.get('X-boxel-realm-url'),
            testRealmHref,
            'realm url header is correct',
          );
          assert.strictEqual(
            response.get('X-boxel-realm-public-readable'),
            'true',
            'realm is public readable',
          );
          let result = response.text.trim();
          assert.strictEqual(result, cardSrc, 'the card source is correct');
          assert.ok(
            response.headers['last-modified'],
            'last-modified header exists',
          );
        });

        test('serves a card-source GET request that results in redirect', async function (assert) {
          let response = await request
            .get('/person')
            .set('Accept', 'application/vnd.card+source');

          assert.strictEqual(response.status, 302, 'HTTP 302 status');
          assert.strictEqual(
            response.get('X-boxel-realm-url'),
            testRealmHref,
            'realm url header is correct',
          );
          assert.strictEqual(
            response.get('X-boxel-realm-public-readable'),
            'true',
            'realm is public readable',
          );
          assert.strictEqual(response.headers['location'], '/person.gts');
        });

        test('serves a card instance GET request with card-source accept header that results in redirect', async function (assert) {
          let response = await request
            .get('/person-1')
            .set('Accept', 'application/vnd.card+source');

          assert.strictEqual(response.status, 302, 'HTTP 302 status');
          assert.strictEqual(
            response.get('X-boxel-realm-url'),
            testRealmHref,
            'realm url header is correct',
          );
          assert.strictEqual(
            response.get('X-boxel-realm-public-readable'),
            'true',
            'realm is public readable',
          );
          assert.strictEqual(response.headers['location'], '/person-1.json');
        });

        test('serves source of a card module that is in error state', async function (assert) {
          let response = await request
            .get('/person-with-error.gts')
            .set('Accept', 'application/vnd.card+source');

          assert.strictEqual(
            response.headers['content-type'],
            'text/plain; charset=utf-8',
            'content type is correct',
          );
          assert.strictEqual(
            readFileSync(
              join(__dirname, '../tests/cards', 'person-with-error.gts'),
              {
                encoding: 'utf8',
              },
            ),
            response.text,
            'the card source is correct',
          );

          assert.strictEqual(response.status, 200, 'HTTP 200 status');
        });

        test('serves a card instance GET request with a .json extension and json accept header that results in redirect', async function (assert) {
          let response = await request
            .get('/person.json')
            .set('Accept', 'application/vnd.card+json');

          assert.strictEqual(response.status, 302, 'HTTP 302 status');
          assert.strictEqual(
            response.get('X-boxel-realm-url'),
            testRealmHref,
            'realm url header is correct',
          );
          assert.strictEqual(
            response.get('X-boxel-realm-public-readable'),
            'true',
            'realm is public readable',
          );
          assert.strictEqual(response.headers['location'], '/person');
        });

        test('serves a module GET request', async function (assert) {
          let response = await request.get('/person');

          assert.strictEqual(response.status, 200, 'HTTP 200 status');
          assert.strictEqual(
            response.get('X-boxel-realm-url'),
            testRealmHref,
            'realm URL header is correct',
          );
          assert.strictEqual(
            response.get('X-boxel-realm-public-readable'),
            'true',
            'realm is public readable',
          );
          let body = response.text.trim();
          let moduleAbsolutePath = resolve(join(__dirname, '..', 'person.gts'));

          // Remove platform-dependent id, from https://github.com/emberjs/babel-plugin-ember-template-compilation/blob/d67cca121cfb3bbf5327682b17ed3f2d5a5af528/__tests__/tests.ts#LL1430C1-L1431C1
          body = stripScopedCSSGlimmerAttributes(
            body.replace(/"id":\s"[^"]+"/, '"id": "<id>"'),
          );

          assert.codeEqual(
            body,
            compiledCard('"<id>"', moduleAbsolutePath),
            'module JS is correct',
          );
        });
      });

      module('permissioned realm', function (hooks) {
        setupPermissionedRealm(hooks, {
          permissions: {
            john: ['read'],
          },
          onRealmSetup,
        });

        test('401 with invalid JWT', async function (assert) {
          let response = await request
            .get('/person.gts')
            .set('Accept', 'application/vnd.card+source')
            .set('Authorization', `Bearer invalid-token`);

          assert.strictEqual(response.status, 401, 'HTTP 401 status');
        });

        test('401 without a JWT', async function (assert) {
          let response = await request
            .get('/person.gts')
            .set('Accept', 'application/vnd.card+source'); // no Authorization header

          assert.strictEqual(response.status, 401, 'HTTP 401 status');
        });

        test('403 without permission', async function (assert) {
          let response = await request
            .get('/person.gts')
            .set('Accept', 'application/vnd.card+source')
            .set('Authorization', `Bearer ${createJWT(testRealm, 'not-john')}`);

          assert.strictEqual(response.status, 403, 'HTTP 403 status');
        });

        test('200 with permission', async function (assert) {
          let response = await request
            .get('/person.gts')
            .set('Accept', 'application/vnd.card+source')
            .set(
              'Authorization',
              `Bearer ${createJWT(testRealm, 'john', ['read'])}`,
            );

          assert.strictEqual(response.status, 200, 'HTTP 200 status');
        });
      });
    });

    module('card source HEAD request', function (_hooks) {
      module('public readable realm', function (hooks) {
        setupPermissionedRealm(hooks, {
          permissions: {
            '*': ['read'],
          },
          onRealmSetup,
        });

        test('serves the request', async function (assert) {
          let response = await request
            .head('/person.gts')
            .set('Accept', 'application/vnd.card+source');

          assert.strictEqual(response.status, 200, 'HTTP 200 status');
          assert.strictEqual(
            response.get('X-boxel-realm-url'),
            testRealmHref,
            'realm url header is correct',
          );
          assert.strictEqual(
            response.get('X-boxel-realm-public-readable'),
            'true',
            'realm is public readable',
          );
          assert.notOk(response.text, 'no body in HEAD response');
        });

        test('serves a card-source HEAD request that results in redirect', async function (assert) {
          let response = await request
            .head('/person')
            .set('Accept', 'application/vnd.card+source');

          assert.strictEqual(response.status, 302, 'HTTP 302 status');
          assert.strictEqual(
            response.get('X-boxel-realm-url'),
            testRealmHref,
            'realm url header is correct',
          );
          assert.strictEqual(
            response.get('X-boxel-realm-public-readable'),
            'true',
            'realm is public readable',
          );
          assert.strictEqual(response.headers['location'], '/person.gts');
        });
      });
    });

    module('card-source DELETE request', function (_hooks) {
      module('public writable realm', function (hooks) {
        setupPermissionedRealm(hooks, {
          permissions: {
            '*': ['read', 'write'],
          },
          onRealmSetup,
        });

        let { getMessagesSince } = setupMatrixRoom(hooks, getRealmSetup);

        test('serves the request', async function (assert) {
          let entry = 'unused-card.gts';

          let response = await request
            .delete('/unused-card.gts')
            .set('Accept', 'application/vnd.card+source');

          assert.strictEqual(response.status, 204, 'HTTP 204 status');
          assert.strictEqual(
            response.get('X-boxel-realm-url'),
            testRealmHref,
            'realm url header is correct',
          );
          assert.strictEqual(
            response.get('X-boxel-realm-public-readable'),
            'true',
            'realm is public readable',
          );
          let cardFile = join(dir.name, entry);
          assert.false(existsSync(cardFile), 'card module does not exist');
        });

        test('broadcasts realm events', async function (assert) {
          let realmEventTimestampStart = Date.now();

          await request
            .delete('/unused-card.gts')
            .set('Accept', 'application/vnd.card+source');

          await expectIncrementalIndexEvent(
            `${testRealmURL}unused-card.gts`,
            realmEventTimestampStart,
            {
              assert,
              getMessagesSince,
              realm: testRealmHref,
            },
          );
        });

        test('serves a card-source DELETE request for a card instance', async function (assert) {
          let entry = 'person-1';
          let response = await request
            .delete('/person-1')
            .set('Accept', 'application/vnd.card+source');

          assert.strictEqual(response.status, 204, 'HTTP 204 status');
          assert.strictEqual(
            response.get('X-boxel-realm-url'),
            testRealmHref,
            'realm url header is correct',
          );
          assert.strictEqual(
            response.get('X-boxel-realm-public-readable'),
            'true',
            'realm is public readable',
          );
          let cardFile = join(dir.name, entry);
          assert.false(existsSync(cardFile), 'card instance does not exist');
        });
      });

      module('permissioned realm', function (hooks) {
        setupPermissionedRealm(hooks, {
          permissions: {
            john: ['read', 'write'],
          },
          onRealmSetup,
        });

        test('401 with invalid JWT', async function (assert) {
          let response = await request
            .delete('/unused-card.gts')
            .set('Accept', 'application/vnd.card+source')
            .set('Authorization', `Bearer invalid-token`);

          assert.strictEqual(response.status, 401, 'HTTP 401 status');
        });

        test('403 without permission', async function (assert) {
          let response = await request
            .delete('/unused-card.gts')
            .set('Accept', 'application/vnd.card+source')
            .set('Authorization', `Bearer ${createJWT(testRealm, 'not-john')}`);

          assert.strictEqual(response.status, 403, 'HTTP 403 status');
        });

        test('204 with permission', async function (assert) {
          let response = await request
            .delete('/unused-card.gts')
            .set('Accept', 'application/vnd.card+source')
            .set(
              'Authorization',
              `Bearer ${createJWT(testRealm, 'john', ['read', 'write'])}`,
            );

          assert.strictEqual(response.status, 204, 'HTTP 204 status');
        });
      });
    });

    module('card-source POST request', function (_hooks) {
      module('public writable realm', function (hooks) {
        setupPermissionedRealm(hooks, {
          permissions: {
            '*': ['read', 'write'],
          },
          onRealmSetup,
        });

        let { getMessagesSince } = setupMatrixRoom(hooks, getRealmSetup);

        test('serves a card-source POST request', async function (assert) {
          let entry = 'unused-card.gts';
          let response = await request
            .post('/unused-card.gts')
            .set('Accept', 'application/vnd.card+source')
            .send(`//TEST UPDATE\n${cardSrc}`);

          assert.strictEqual(response.status, 204, 'HTTP 204 status');
          assert.strictEqual(
            response.get('X-boxel-realm-url'),
            testRealmHref,
            'realm url header is correct',
          );
          assert.strictEqual(
            response.get('X-boxel-realm-public-readable'),
            'true',
            'realm is public readable',
          );

          let srcFile = join(dir.name, 'realm_server_1', 'test', entry);
          assert.ok(existsSync(srcFile), 'card src exists');
          let src = readFileSync(srcFile, { encoding: 'utf8' });
          assert.codeEqual(
            src,
            `//TEST UPDATE
          ${cardSrc}`,
          );
        });

        test('broadcasts realm events', async function (assert) {
          let realmEventTimestampStart = Date.now();

          await request
            .post('/unused-card.gts')
            .set('Accept', 'application/vnd.card+source')
            .send(`//TEST UPDATE\n${cardSrc}`);

          await expectIncrementalIndexEvent(
            `${testRealmURL}unused-card.gts`,
            realmEventTimestampStart,
            {
              assert,
              getMessagesSince,
              realm: testRealmHref,
            },
          );
        });

        test('serves a card-source POST request for a .txt file', async function (assert) {
          let response = await request
            .post('/hello-world.txt')
            .set('Accept', 'application/vnd.card+source')
            .send(`Hello World`);

          assert.strictEqual(response.status, 204, 'HTTP 204 status');

          let txtFile = join(
            dir.name,
            'realm_server_1',
            'test',
            'hello-world.txt',
          );
          assert.ok(existsSync(txtFile), 'file exists');
          let src = readFileSync(txtFile, { encoding: 'utf8' });
          assert.strictEqual(src, 'Hello World');
        });

        test('can serialize a card instance correctly after card definition is changed', async function (assert) {
          let realmEventTimestampStart = Date.now();

          // create a card def
          {
            let response = await request
              .post('/test-card.gts')
              .set('Accept', 'application/vnd.card+source').send(`
                import { contains, field, CardDef } from 'https://cardstack.com/base/card-api';
                import StringField from 'https://cardstack.com/base/string';

                export class TestCard extends CardDef {
                  @field field1 = contains(StringField);
                  @field field2 = contains(StringField);
                }
              `);

            assert.strictEqual(response.status, 204, 'HTTP 204 status');
          }

          // make an instance of the card def
          let maybeId: string | undefined;
          {
            let response = await request
              .post('/')
              .send({
                data: {
                  type: 'card',
                  attributes: {
                    field1: 'a',
                    field2: 'b',
                  },
                  meta: {
                    adoptsFrom: {
                      module: `${testRealmURL}test-card`,
                      name: 'TestCard',
                    },
                  },
                },
              })
              .set('Accept', 'application/vnd.card+json');

            assert.strictEqual(response.status, 201, 'HTTP 201 status');
            maybeId = response.body.data.id;
          }
          if (!maybeId) {
            assert.ok(false, 'new card identifier was undefined');
            // eslint-disable-next-line qunit/no-early-return
            return;
          }
          let id = maybeId;

          // modify field
          {
            let response = await request
              .post('/test-card.gts')
              .set('Accept', 'application/vnd.card+source').send(`
                import { contains, field, CardDef } from 'https://cardstack.com/base/card-api';
                import StringField from 'https://cardstack.com/base/string';

                export class TestCard extends CardDef {
                  @field field1 = contains(StringField);
                  @field field2a = contains(StringField); // rename field2 -> field2a
                }
              `);

            assert.strictEqual(response.status, 204, 'HTTP 204 status');
          }

          // verify serialization matches new card def
          {
            let response = await request
              .get(new URL(id).pathname)
              .set('Accept', 'application/vnd.card+json');

            assert.strictEqual(response.status, 200, 'HTTP 200 status');
            let json = response.body;
            assert.deepEqual(json.data.attributes, {
              field1: 'a',
              field2a: null,
              title: null,
              description: null,
              thumbnailURL: null,
            });
          }

          // set value on renamed field
          {
            let response = await request
              .patch(new URL(id).pathname)
              .send({
                data: {
                  type: 'card',
                  attributes: {
                    field2a: 'c',
                  },
                  meta: {
                    adoptsFrom: {
                      module: `${testRealmURL}test-card`,
                      name: 'TestCard',
                    },
                  },
                },
              })
              .set('Accept', 'application/vnd.card+json');

            assert.strictEqual(response.status, 200, 'HTTP 200 status');
            assert.strictEqual(
              response.get('X-boxel-realm-url'),
              testRealmHref,
              'realm url header is correct',
            );
            assert.strictEqual(
              response.get('X-boxel-realm-public-readable'),
              'true',
              'realm is public readable',
            );

            let json = response.body;
            assert.deepEqual(json.data.attributes, {
              field1: 'a',
              field2a: 'c',
              title: null,
              description: null,
              thumbnailURL: null,
            });
          }

          // verify file serialization is correct
          {
            let localPath = new RealmPaths(testRealmURL).local(new URL(id));
            let jsonFile = `${join(
              dir.name,
              'realm_server_1',
              'test',
              localPath,
            )}.json`;
            let doc = JSON.parse(
              readFileSync(jsonFile, { encoding: 'utf8' }),
            ) as LooseSingleCardDocument;
            assert.deepEqual(
              doc,
              {
                data: {
                  type: 'card',
                  attributes: {
                    field1: 'a',
                    field2a: 'c',
                    title: null,
                    description: null,
                    thumbnailURL: null,
                  },
                  meta: {
                    adoptsFrom: {
                      module: '/test-card',
                      name: 'TestCard',
                    },
                  },
                },
              },
              'instance serialized to filesystem correctly',
            );
          }

          // verify instance GET is correct
          {
            let response = await request
              .get(new URL(id).pathname)
              .set('Accept', 'application/vnd.card+json');

            assert.strictEqual(response.status, 200, 'HTTP 200 status');
            let json = response.body;
            assert.deepEqual(json.data.attributes, {
              field1: 'a',
              field2a: 'c',
              title: null,
              description: null,
              thumbnailURL: null,
            });
          }

          let messages = await getMessagesSince(realmEventTimestampStart);

          let expected = [
            {
              type: APP_BOXEL_REALM_EVENT_TYPE,
              content: {
                eventName: 'index',
                indexType: 'incremental-index-initiation',
                updatedFile: `${testRealmURL}test-card.gts`,
              },
            },
            {
              type: APP_BOXEL_REALM_EVENT_TYPE,
              content: {
                eventName: 'index',
                indexType: 'incremental',
                invalidations: [`${testRealmURL}test-card.gts`],
                clientRequestId: null,
              },
            },
            {
              type: APP_BOXEL_REALM_EVENT_TYPE,
              content: {
                eventName: 'index',
                indexType: 'incremental-index-initiation',
                updatedFile: `${testRealmURL}test-card.gts`,
              },
            },
            {
              type: APP_BOXEL_REALM_EVENT_TYPE,
              content: {
                eventName: 'index',
                indexType: 'incremental',
                invalidations: [`${testRealmURL}test-card.gts`, id],
                clientRequestId: null,
              },
            },
            {
              type: APP_BOXEL_REALM_EVENT_TYPE,
              content: {
                eventName: 'index',
                indexType: 'incremental-index-initiation',
                updatedFile: `${id}.json`,
              },
            },
            {
              type: APP_BOXEL_REALM_EVENT_TYPE,
              content: {
                eventName: 'index',
                indexType: 'incremental',
                invalidations: [id],
                clientRequestId: null,
              },
            },
          ];

          for (let expectedEvent of expected) {
            // FIXME is there a better way?
            let actualEvent = matchRealmEvent(messages, expectedEvent);

            assert.deepEqual(
              actualEvent?.content,
              expectedEvent.content,
              'expected event was broadcast',
            );
          }
        });
      });

      module('permissioned realm', function (hooks) {
        setupPermissionedRealm(hooks, {
          permissions: {
            john: ['read', 'write'],
          },
          onRealmSetup,
        });

        test('401 with invalid JWT', async function (assert) {
          let response = await request
            .post('/unused-card.gts')
            .set('Accept', 'application/vnd.card+source')
            .send(`//TEST UPDATE\n${cardSrc}`)
            .set('Authorization', `Bearer invalid-token`);

          assert.strictEqual(response.status, 401, 'HTTP 401 status');
        });

        test('401 without a JWT', async function (assert) {
          let response = await request
            .post('/unused-card.gts')
            .set('Accept', 'application/vnd.card+source')
            .send(`//TEST UPDATE\n${cardSrc}`); // no Authorization header

          assert.strictEqual(response.status, 401, 'HTTP 401 status');
        });

        test('403 without permission', async function (assert) {
          let response = await request
            .post('/unused-card.gts')
            .set('Accept', 'application/vnd.card+source')
            .send(`//TEST UPDATE\n${cardSrc}`)
            .set('Authorization', `Bearer ${createJWT(testRealm, 'not-john')}`);

          assert.strictEqual(response.status, 403, 'HTTP 403 status');
        });

        test('204 with permission', async function (assert) {
          let response = await request
            .post('/unused-card.gts')
            .set('Accept', 'application/vnd.card+source')
            .send(`//TEST UPDATE\n${cardSrc}`)
            .set(
              'Authorization',
              `Bearer ${createJWT(testRealm, 'john', ['read', 'write'])}`,
            );

          assert.strictEqual(response.status, 204, 'HTTP 204 status');
        });
      });
    });
  });
});

function matchRealmEvent(events: MatrixEvent[], event: any) {
  return events.find(
    (m) => m.type === event.type && isEqual(event.content, m.content),
  );
}
