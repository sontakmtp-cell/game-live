// Tests for GameState — TikTok LIVE Arcade (v1.1)
// Covers: EVT-04, FSM state transitions, wear accumulation, round reset.

import test from 'node:test';
import assert from 'node:assert/strict';
import { GameState, GAME_PHASES } from '../src/core/game-state.mjs';

test('GameState: FSM and Wear accumulation up to 100% -> BREAKING', () => {
  const game = new GameState({ maxWear: 10 });
  assert.strictEqual(game.phase, GAME_PHASES.IDLE);
  assert.strictEqual(game.ropeWear, 0);
  assert.strictEqual(game.roundId, 1);

  // Hit 1: +4 wear
  const res1 = game.commitContact(4, 0.65, 'left');
  assert.strictEqual(res1.didBreak, false);
  assert.strictEqual(game.ropeWear, 4);
  assert.strictEqual(game.phase, GAME_PHASES.RECOVERING);

  // Hit 2: +4 wear -> 8 wear
  const res2 = game.commitContact(4, -0.65, 'right');
  assert.strictEqual(res2.didBreak, false);
  assert.strictEqual(game.ropeWear, 8);

  // Hit 3: +4 wear -> 12 >= 10 -> BREAKING!
  const res3 = game.commitContact(4, 0.65, 'left');
  assert.strictEqual(res3.didBreak, true);
  assert.strictEqual(game.ropeWear, 10);
  assert.strictEqual(game.phase, GAME_PHASES.BREAKING);
  assert.strictEqual(game.stats.totalBreaks, 1);

  // Reset round
  game.resetRound();
  assert.strictEqual(game.roundId, 2);
  assert.strictEqual(game.ropeWear, 0);
  assert.strictEqual(game.phase, GAME_PHASES.IDLE);
});

test('EVT-04: Game snapshot contains complete state for reconnect', () => {
  const game = new GameState({ seed: 1234 });
  game.commitContact(5, 0.65, 'left');

  const snap = game.getSnapshot(3);
  assert.strictEqual(snap.roundId, 1);
  assert.strictEqual(snap.ropeWear, 5);
  assert.strictEqual(snap.queueLength, 3);
  assert.strictEqual(snap.seed, 1234);
  assert.ok(snap.physics);
});
