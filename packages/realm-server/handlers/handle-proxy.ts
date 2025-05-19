import { SupportedMimeType } from '@cardstack/runtime-common';
import Koa from 'koa';
import {
  fetchRequestFromContext,
  sendResponseForBadRequest,
  sendResponseForSystemError,
  sendResponseForPaymentRequired,
  setContextResponse,
} from '../middleware';
import { RealmServerTokenClaim } from '../utils/jwt';
import {
  getUserByMatrixUserId,
  spendCredits,
  insertProxyCall,
  sumUpCreditsLedger,
} from '@cardstack/billing/billing-queries';
import { CreateRoutesArgs } from '../routes';

const PROXY_CREDIT_COST = 1;

export default function handleProxyRequest({
  dbAdapter,
}: CreateRoutesArgs): (ctxt: Koa.Context, next: Koa.Next) => Promise<void> {
  return async function (ctxt: Koa.Context) {
    let token = ctxt.state.token as RealmServerTokenClaim;
    if (!token) {
      await sendResponseForSystemError(
        ctxt,
        'token is required to proxy request',
      );
      return;
    }

    let { user: matrixUserId } = token;
    let user = await getUserByMatrixUserId(dbAdapter, matrixUserId);
    if (!user) {
      await sendResponseForSystemError(ctxt, 'user not found');
      return;
    }

    let request = await fetchRequestFromContext(ctxt);
    let bodyText = await request.text();
    let params: {
      url: string;
      method?: string;
      headers?: Record<string, string>;
      body?: any;
    };
    try {
      params = JSON.parse(bodyText);
    } catch (e) {
      await sendResponseForBadRequest(ctxt, 'Request body is not valid JSON');
      return;
    }

    if (!params.url) {
      await sendResponseForBadRequest(ctxt, 'url is required');
      return;
    }

    let availableCredits = await sumUpCreditsLedger(dbAdapter, {
      userId: user.id,
    });
    if (availableCredits < PROXY_CREDIT_COST) {
      await sendResponseForPaymentRequired(ctxt, 'Not enough credits');
      return;
    }

    let response = await fetch(params.url, {
      method: params.method ?? 'GET',
      headers: params.headers,
      body: params.body,
    });

    let responseBody = await response.text();

    await spendCredits(dbAdapter, user.id, PROXY_CREDIT_COST);
    await insertProxyCall(dbAdapter, {
      userId: user.id,
      url: params.url,
      creditsSpent: PROXY_CREDIT_COST,
    });

    return setContextResponse(
      ctxt,
      new Response(responseBody, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          'content-type':
            response.headers.get('content-type') || SupportedMimeType.JSON,
        },
      }),
    );
  };
}
