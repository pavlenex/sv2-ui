import assert from 'node:assert/strict';
import test from 'node:test';

import { getSriIdentityError, getSriIdentitySummary, normalizeSriIdentity } from './miningIdentity';

const MAINNET_ADDRESS = 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';

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
