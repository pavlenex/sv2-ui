import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createAdvancedMiningConfigValues,
  isAdvancedMiningConfigValid,
  parseAdvancedMiningConfigValues,
} from './mining/AdvancedMiningConfigForm';

test('creates advanced mining form values from shared defaults', () => {
  assert.deepEqual(createAdvancedMiningConfigValues(), {
    sharesPerMinute: '6',
    downstreamExtranonce2Size: '4',
    verifyPayout: true,
  });
});

test('creates advanced mining form values from translator configuration', () => {
  assert.deepEqual(createAdvancedMiningConfigValues({
    enable_vardiff: true,
    aggregate_channels: false,
    verify_payout: false,
    min_hashrate: 100_000_000_000_000,
    shares_per_minute: 12.5,
    downstream_extranonce2_size: 8,
  }), {
    sharesPerMinute: '12.5',
    downstreamExtranonce2Size: '8',
    verifyPayout: false,
  });
});

test('validates positive share rates and unsigned 16-bit extranonce2 sizes', () => {
  assert.equal(isAdvancedMiningConfigValid({
    sharesPerMinute: '6.5',
    downstreamExtranonce2Size: '65535',
    verifyPayout: true,
  }), true);
  assert.equal(isAdvancedMiningConfigValid({
    sharesPerMinute: '0',
    downstreamExtranonce2Size: '8',
    verifyPayout: true,
  }), false);
  assert.equal(isAdvancedMiningConfigValid({
    sharesPerMinute: '6.5',
    downstreamExtranonce2Size: '4.5',
    verifyPayout: true,
  }), false);
  assert.equal(isAdvancedMiningConfigValid({
    sharesPerMinute: '6.5',
    downstreamExtranonce2Size: '65536',
    verifyPayout: true,
  }), false);
  assert.equal(isAdvancedMiningConfigValid({
    sharesPerMinute: '6.5',
    downstreamExtranonce2Size: '1000000000000',
    verifyPayout: true,
  }), false);
});

test('parses form values for translator configuration', () => {
  assert.deepEqual(parseAdvancedMiningConfigValues({
    sharesPerMinute: '12.5',
    downstreamExtranonce2Size: '8',
    verifyPayout: false,
  }), {
    sharesPerMinute: 12.5,
    downstreamExtranonce2Size: 8,
    verifyPayout: false,
  });
});

test('falls back to the default for an out-of-range extranonce2 size', () => {
  assert.equal(parseAdvancedMiningConfigValues({
    sharesPerMinute: '6',
    downstreamExtranonce2Size: '1000000000000',
    verifyPayout: true,
  }).downstreamExtranonce2Size, 4);
});
