import test from 'node:test';
import assert from 'node:assert/strict';
import { pipFrame, pipPosition } from '../src/pip-animation.ts';

test('idle blinks and waves automatically without a tap', () => {
  assert.equal(pipFrame('welcome', 0), 0);
  assert.equal(pipFrame('welcome', 1290), 2);
  assert.equal(pipFrame('welcome', 2200), 6);
  assert.equal(pipFrame('welcome', 1e9) >= 0, true);
});

test('listening and calling use their own frames; reduced motion stays still', () => {
  for (let time = 0; time < 10000; time += 80) {
    assert.ok(pipFrame('listening', time) >= 8 && pipFrame('listening', time) <= 11);
    assert.ok(pipFrame('calling', time) >= 12 && pipFrame('calling', time) <= 14);
    assert.equal(pipFrame('welcome', time, true), 0);
    assert.equal(pipFrame('listening', time, true), 9);
  }
});

test('atlas corners map to complete cells without stepping across the sheet', () => {
  assert.equal(pipPosition(0), '0% 0%');
  assert.equal(pipPosition(3), '100% 0%');
  assert.equal(pipPosition(12), '0% 100%');
  assert.equal(pipPosition(15), '100% 100%');
});
