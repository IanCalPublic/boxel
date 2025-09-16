import qs from 'qs';
import { module, test } from 'qunit';

import {
  parseQuery,
  Query,
  assertQuery,
} from '@cardstack/runtime-common/query';

module('Unit | qs | parse', function () {
  test('parseQuery errors out if the query is too deep', async function (assert) {
    assert.throws(
      () => parseQuery('a[b][c][d][e][f][g][h][i][j][k][l]=m'),
      /RangeError: Input depth exceeded depth option of 10 and strictDepth is true/,
    );
  });
  test('invertibility: applying stringify and parse on object will return the same object', async function (assert) {
    let testRealmURL = 'https://example.com/';
    let query: Query = {
      filter: {
        on: {
          module: `${testRealmURL}book`,
          name: 'Book',
        },
        every: [
          {
            eq: {
              'author.firstName': 'Cardy',
              series: null,
            },
          },
          {
            any: [
              {
                eq: {
                  'author.lastName': 'Jones',
                },
              },
              {
                eq: {
                  'author.lastName': 'Stackington Jr. III',
                },
              },
            ],
          },
        ],
      },
      sort: [
        {
          by: 'author.lastName',
          on: { module: `${testRealmURL}book`, name: 'Book' },
        },
      ],
    };
    let queryString = qs.stringify(query, {
      strictNullHandling: true,
    });
    let parsedQuery: any = parseQuery(queryString);
    assert.deepEqual(parsedQuery, query);
  });

  test('assertQuery checks all items in every filter', async function (assert) {
    let queryString =
      'filter[every][0][eq][name]=Mango&filter[every][1]=not-a-filter';
    let query = parseQuery(queryString);
    assert.throws(
      () => assertQuery(query),
      /missing filter object/,
      'invalid filter entry triggers error',
    );
  });

  test('assertQuery validates range filter keys', async function (assert) {
    let queryString = 'filter[range][age][gt]=10&filter[range][age][foo]=20';
    let query = parseQuery(queryString);
    assert.throws(
      () => assertQuery(query),
      /range item must be gt, gte, lt, or lte/,
      'invalid range key triggers error',
    );
  });
});
