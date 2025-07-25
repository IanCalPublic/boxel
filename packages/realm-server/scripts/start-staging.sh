#! /bin/sh
pnpm setup:base-in-deployment
pnpm setup:experiments-in-deployment
pnpm setup:catalog-in-deployment
pnpm setup:skills-in-deployment
NODE_NO_WARNINGS=1 \
  MATRIX_URL=https://matrix-staging.stack.cards \
  REALM_SERVER_MATRIX_USERNAME=realm_server \
  HOST_MODE_DOMAIN_ROOT=boxel.build \
  ts-node \
  --transpileOnly main \
  --port=3000 \
  --matrixURL='https://matrix-staging.stack.cards' \
  --realmsRootPath='/persistent/realms' \
  --serverURL='https://realms-staging.stack.cards' \
  \
  --path='/persistent/base' \
  --username='base_realm' \
  --distURL='https://boxel-host-staging.stack.cards' \
  --fromUrl='https://cardstack.com/base/' \
  --toUrl='https://realms-staging.stack.cards/base/' \
  \
  --path='/persistent/experiments' \
  --username='experiments_realm' \
  --fromUrl='https://realms-staging.stack.cards/experiments/' \
  --toUrl='https://realms-staging.stack.cards/experiments/' \
  \
  --path='/persistent/catalog' \
  --username='catalog_realm' \
  --fromUrl='https://realms-staging.stack.cards/catalog/' \
  --toUrl='https://realms-staging.stack.cards/catalog/'\
  \
  --path='/persistent/skills' \
  --username='skills_realm' \
  --fromUrl='https://realms-staging.stack.cards/skills/' \
  --toUrl='https://realms-staging.stack.cards/skills/'
