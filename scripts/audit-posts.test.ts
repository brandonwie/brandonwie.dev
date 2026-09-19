/**
 * Regression guard for deny-list term matching. Terms here are neutral
 * placeholders — the real deny list is private and never appears in this repo.
 *
 * Run: pnpm exec tsx --test scripts/audit-posts.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wordHit } from './audit-posts';

test('ASCII term matches whole-word-ish, including joined identifiers', () => {
	assert.equal(wordHit('deploys to acme-works today', 'acme'), true);
	assert.equal(wordHit('acme_production', 'acme'), true);
	assert.equal(wordHit('the acmeology course', 'acme'), false);
});

test('Hangul term matches standing alone or with a particle', () => {
	assert.equal(wordHit('우리 가나 팀', '가나'), true);
	assert.equal(wordHit('가나에서 일했다', '가나'), true);
	assert.equal(wordHit('가나의 시스템', '가나'), true);
	assert.equal(wordHit('(가나)', '가나'), true);
});

test('Hangul term matches with stacked particles and copular forms', () => {
	assert.equal(wordHit('가나에서는 이렇게 했다', '가나'), true);
	assert.equal(wordHit('가나라는 회사', '가나'), true);
	assert.equal(wordHit('제 직장은 가나입니다.', '가나'), true);
	assert.equal(wordHit('가나에서의 경험', '가나'), true);
	assert.equal(wordHit('가나이라고 불렀다', '가나'), true);
	assert.equal(wordHit('가나였다', '가나'), true);
});

test('Hangul term does not match inside a longer word', () => {
	assert.equal(wordHit('가나안 땅', '가나'), false);
	assert.equal(wordHit('가나다 순서로 정렬', '가나'), false);
	assert.equal(wordHit('친구가나타났다', '가나'), false);
});
