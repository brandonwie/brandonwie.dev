/**
 * Regression guard for deny-list term matching. Terms and benign words here are
 * neutral placeholders — the real lists are private and never appear in this
 * repo.
 *
 * Run: pnpm exec tsx --test scripts/audit-posts.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wordHit } from './audit-posts';

const TERM = '가나';
const BENIGN = ['가나다', '가나안'];

test('ASCII term matches whole-word-ish, including joined identifiers', () => {
	assert.equal(wordHit('deploys to acme-works today', 'acme'), true);
	assert.equal(wordHit('acme_production', 'acme'), true);
	assert.equal(wordHit('the acmeology course', 'acme'), false);
});

test('Hangul term hits standing alone and inside punctuation', () => {
	assert.equal(wordHit('우리 가나 팀', TERM, BENIGN), true);
	assert.equal(wordHit('(가나)', TERM, BENIGN), true);
});

test('Hangul term hits with any ending, listed nowhere', () => {
	const forms = [
		'가나에서 일했다',
		'가나의 시스템',
		'가나에서는 이렇게 했다',
		'가나라는 회사',
		'제 직장은 가나입니다.',
		'가나인데 말이죠',
		'그때는 가나였어요',
		'가나랑 계약했다',
		'가나하고 협업',
		'가나로서 말하자면',
	];
	for (const form of forms) assert.equal(wordHit(form, TERM, BENIGN), true, form);
});

test('Hangul term embedded on the left still hits — detection is the default', () => {
	assert.equal(wordHit('친구가나타났다', TERM, BENIGN), true);
});

test('Hangul term inside a listed benign word is cleared', () => {
	assert.equal(wordHit('가나다 순서로 정렬', TERM, BENIGN), false);
	assert.equal(wordHit('가나다에서는 정렬한다', TERM, BENIGN), false);
	assert.equal(wordHit('가나안 땅', TERM, BENIGN), false);
});

test('a benign word does not mask a real mention beside it', () => {
	assert.equal(wordHit('가나다 순서지만 가나에서 배웠다', TERM, BENIGN), true);
});

test('without a benign list, an unrelated longer word is flagged for review', () => {
	assert.equal(wordHit('가나다 순서로 정렬', TERM), true);
});
