import assert from 'node:assert/strict';
import test from 'node:test';

import type { PoolConfig } from '@sv2-ui/shared';
import {
  SRI_POOL_AUTHORITY_KEY,
  getCompatiblePoolIdentity,
  getSriIdentityError,
  getSriIdentitySummary,
  normalizePoolPriorityIdentities,
  normalizeSriIdentity,
} from './miningIdentity';

const MAINNET_ADDRESS = 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';
const STANDARD_POOL: PoolConfig = {
  name: 'Standard Pool',
  address: 'pool.example.com',
  port: 3333,
  authority_public_key: 'standard-key',
  user_identity: MAINNET_ADDRESS,
};
const SRI_POOL: PoolConfig = {
  ...STANDARD_POOL,
  name: 'SRI Pool',
  authority_public_key: SRI_POOL_AUTHORITY_KEY,
  user_identity: `sri/solo/${MAINNET_ADDRESS}/worker1`,
};

test('getSriIdentityError accepts a valid solo identity', () => {
  assert.equal(getSriIdentityError(`sri/solo/${MAINNET_ADDRESS}/worker1`, 'mainnet'), null);
});

test('getSriIdentityError rejects a solo identity with an invalid embedded address', () => {
  assert.match(getSriIdentityError('sri/solo/not-a-bitcoin-address/worker1', 'mainnet') ?? '', /invalid bitcoin address/i);
});

test('getSriIdentityError accepts a valid partial donation identity', () => {
  assert.equal(getSriIdentityError(`sri/donate/25/${MAINNET_ADDRESS}/worker1`, 'mainnet'), null);
});

test('getSriIdentityError rejects a partial donation identity with an invalid embedded address', () => {
  assert.match(getSriIdentityError('sri/donate/25/not-a-bitcoin-address/worker1', 'mainnet') ?? '', /invalid bitcoin address/i);
});

test('getSriIdentityError accepts full donation identities without a payout address', () => {
  assert.equal(getSriIdentityError('sri/donate', 'mainnet'), null);
  assert.equal(getSriIdentityError('sri/donate/worker1', 'mainnet'), null);
});

test('normalizeSriIdentity converts a payout address to a zero donation SRI identity', () => {
  assert.equal(normalizeSriIdentity(MAINNET_ADDRESS), `sri/solo/${MAINNET_ADDRESS}`);
});

test('getSriIdentityError avoids exposing internal identity syntax', () => {
  assert.equal(
    getSriIdentityError(MAINNET_ADDRESS, 'mainnet'),
    'Enter a Bitcoin payout address, or set donation to 100% to donate the full reward',
  );
});

test('getSriIdentitySummary avoids exposing internal identity syntax', () => {
  assert.equal(
    getSriIdentitySummary(`sri/solo/${MAINNET_ADDRESS}/worker1`),
    `${MAINNET_ADDRESS}, worker worker1, 0% donation`,
  );
  assert.equal(getSriIdentitySummary('sri/donate'), 'Full reward donated, 100% donation');
});

test('getCompatiblePoolIdentity converts between standard and SRI solo identity formats', () => {
  assert.equal(
    getCompatiblePoolIdentity(SRI_POOL, STANDARD_POOL, 'solo'),
    MAINNET_ADDRESS,
  );
  assert.equal(
    getCompatiblePoolIdentity(STANDARD_POOL, SRI_POOL, 'solo'),
    `sri/solo/${MAINNET_ADDRESS}`,
  );
});

test('getCompatiblePoolIdentity does not leak a full-donation identity to another solo pool', () => {
  assert.equal(
    getCompatiblePoolIdentity({ ...SRI_POOL, user_identity: 'sri/donate' }, STANDARD_POOL, 'solo'),
    '',
  );
});

test('normalizePoolPriorityIdentities updates inherited fallback identities but preserves overrides', () => {
  const nextPrimary = { ...STANDARD_POOL, user_identity: 'new-primary.worker' };
  const inheritedFallback = { ...STANDARD_POOL, address: 'fallback.example.com' };
  const customFallback = {
    ...STANDARD_POOL,
    address: 'custom-fallback.example.com',
    user_identity: 'custom.worker',
  };

  const result = normalizePoolPriorityIdentities(
    [nextPrimary, inheritedFallback, customFallback],
    STANDARD_POOL,
    'pool',
  );

  assert.equal(result[1].user_identity, 'new-primary.worker');
  assert.equal(result[2].user_identity, 'custom.worker');
});

test('normalizePoolPriorityIdentities preserves fallback payout addresses during full donation', () => {
  const previousPrimary = {
    ...SRI_POOL,
    user_identity: `sri/donate/25/${MAINNET_ADDRESS}/worker1`,
  };
  const nextPrimary = {
    ...SRI_POOL,
    user_identity: 'sri/donate/worker1',
  };
  const fallback = {
    ...STANDARD_POOL,
    address: 'fallback.example.com',
    user_identity: MAINNET_ADDRESS,
  };

  const result = normalizePoolPriorityIdentities(
    [nextPrimary, fallback],
    previousPrimary,
    'solo',
  );

  assert.equal(result[1].user_identity, MAINNET_ADDRESS);
});
