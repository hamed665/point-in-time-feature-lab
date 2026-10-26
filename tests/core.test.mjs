import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sample=JSON.parse(readFileSync(new URL('../examples/input.json',import.meta.url)));

import {joinFeatures,analyze} from '../src/core.mjs';
import {timestamp} from '../src/validation.mjs';
test('late available features cannot leak into earlier predictions',()=>{
  const report=analyze(sample); assert.equal(report.joins[0].features.orders_30d.value,4);
  assert.equal(report.joins[1].features.orders_30d.value,9); assert.equal(report.joins[0].unavailable,1);
});
test('entity isolation',()=>assert.equal(analyze(sample).joins[2].features.orders_30d.value,1));
test('maximum age expires old values',()=>assert.deepEqual(joinFeatures(sample.events,[sample.queries[0]],1)[0].features,{}));
test('availability equality is eligible',()=>{
  const q={entity:'customer-01',at:'2026-01-01T11:00:00Z'};
  assert.equal(joinFeatures(sample.events,[q])[0].features.orders_30d.value,9);
});
test('reject ambiguous duplicate event keys',()=>assert.throws(()=>joinFeatures([...sample.events,sample.events[0]],sample.queries),/duplicate/));
test('reject invalid date and naive timestamp',()=>{
  assert.throws(()=>timestamp('2026-02-30T10:00:00Z'));
  assert.throws(()=>timestamp('2026-01-01T10:00:00'));
});
test('stable under shuffled input',()=>assert.deepEqual(analyze({...sample,events:[...sample.events].reverse()}),analyze(sample)));
test('unknown entity yields empty features',()=>assert.deepEqual(joinFeatures(sample.events,[{entity:'missing',at:sample.queries[0].at}])[0].features,{}));
