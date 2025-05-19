import { module, test } from 'qunit';
import { Test, SuperTest } from 'supertest';
import { join, basename } from 'path';
import { dirSync, type DirResult } from 'tmp';
import { copySync } from 'fs-extra';
import { baseRealm, query, param } from '@cardstack/runtime-common';
import {
  setupCardLogs,
  setupBaseRealmServer,
  setupPermissionedRealm,
  createVirtualNetworkAndLoader,
  matrixURL,
  realmSecretSeed,
  insertUser,
  insertPlan,
} from './helpers';
import '@cardstack/runtime-common/helpers/code-equality-assertion';
import { type PgAdapter } from '@cardstack/postgres';
import { createJWT as createRealmServerJWT } from '../utils/jwt';
import {
  insertSubscription,
  insertSubscriptionCycle,
  addToCreditsLedger,
  sumUpCreditsLedger,
} from '@cardstack/billing/billing-queries';

module(basename(__filename), function () {
  module('Server Endpoint | POST _proxy', function (hooks) {
    let request: SuperTest<Test>;
    let dir: DirResult;
    let dbAdapter: PgAdapter;

    let { virtualNetwork, loader } = createVirtualNetworkAndLoader();

    function onRealmSetup(args: {
      request: SuperTest<Test>;
      dir: DirResult;
      dbAdapter: PgAdapter;
    }) {
      request = args.request;
      dir = args.dir;
      dbAdapter = args.dbAdapter;
    }

    setupCardLogs(
      hooks,
      async () => await loader.import(`${baseRealm.url}card-api`),
    );

    setupBaseRealmServer(hooks, virtualNetwork, matrixURL);

    hooks.beforeEach(async function () {
      dir = dirSync();
      copySync(join(__dirname, 'cards'), dir.name);
    });

    setupPermissionedRealm(hooks, {
      permissions: {
        '*': ['read', 'write'],
      },
      onRealmSetup,
    });

    hooks.beforeEach(function () {
      virtualNetwork.mount(
        async (req: Request) => {
          if (req.url === 'http://external.service/data') {
            return new Response(JSON.stringify({ data: 123 }), {
              headers: { 'content-type': 'application/json' },
            });
          }
          return null;
        },
        { prepend: true },
      );
    });

    test('proxy call deducts credits and returns response', async function (assert) {
      let user = await insertUser(
        dbAdapter,
        'user@test',
        'cus_123',
        'user@test.com',
      );
      let plan = await insertPlan(dbAdapter, 'Basic', 0, 10, 'prod_basic');
      let subscription = await insertSubscription(dbAdapter, {
        user_id: user.id,
        plan_id: plan.id,
        started_at: 1,
        status: 'active',
        stripe_subscription_id: 'sub_123',
      });
      let cycle = await insertSubscriptionCycle(dbAdapter, {
        subscriptionId: subscription.id,
        periodStart: 1,
        periodEnd: 2,
      });
      await addToCreditsLedger(dbAdapter, {
        userId: user.id,
        creditAmount: 10,
        creditType: 'plan_allowance',
        subscriptionCycleId: cycle.id,
      });

      let response = await request
        .post('/_proxy')
        .set('Accept', 'application/json')
        .set('Content-Type', 'application/json')
        .set(
          'Authorization',
          `Bearer ${createRealmServerJWT({ user: 'user@test', sessionRoom: 'room' }, realmSecretSeed)}`,
        )
        .send({ url: 'http://external.service/data' });

      assert.strictEqual(response.status, 200, 'HTTP 200 status');
      assert.deepEqual(response.body, { data: 123 });

      assert.strictEqual(
        await sumUpCreditsLedger(dbAdapter, { userId: user.id }),
        9,
      );
      let rows = await query(dbAdapter, [
        `SELECT * FROM api_proxy_calls WHERE user_id = `,
        param(user.id),
      ]);
      assert.strictEqual(rows.length, 1, 'proxy call logged');
      assert.strictEqual(rows[0].url, 'http://external.service/data');
    });

    test('proxy call fails with 402 when credits are insufficient', async function (assert) {
      let user = await insertUser(
        dbAdapter,
        'no-credits@test',
        'cus_456',
        'no-credits@test.com',
      );
      let plan = await insertPlan(dbAdapter, 'Basic', 0, 10, 'prod_basic');
      let subscription = await insertSubscription(dbAdapter, {
        user_id: user.id,
        plan_id: plan.id,
        started_at: 1,
        status: 'active',
        stripe_subscription_id: 'sub_456',
      });
      await insertSubscriptionCycle(dbAdapter, {
        subscriptionId: subscription.id,
        periodStart: 1,
        periodEnd: 2,
      });

      let response = await request
        .post('/_proxy')
        .set('Accept', 'application/json')
        .set('Content-Type', 'application/json')
        .set(
          'Authorization',
          `Bearer ${createRealmServerJWT({ user: 'no-credits@test', sessionRoom: 'room' }, realmSecretSeed)}`,
        )
        .send({ url: 'http://external.service/data' });

      assert.strictEqual(response.status, 402, 'HTTP 402 status');
      assert.strictEqual(response.body.errors[0], 'Not enough credits');
    });
  });
});
