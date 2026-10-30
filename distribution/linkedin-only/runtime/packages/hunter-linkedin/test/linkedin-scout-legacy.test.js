import assert from 'assert';
import { __test__ } from '../scout.js';

const { isConsumerTier, parseNumericIds, buildEnhancedKeyword } = __test__;

console.log('Testing isConsumerTier...');
assert.strictEqual(isConsumerTier('free'), true, 'free should be consumer');
assert.strictEqual(isConsumerTier('premium_career'), true, 'premium_career should be consumer');
assert.strictEqual(isConsumerTier('premium_business'), true, 'premium_business should be consumer');
assert.strictEqual(isConsumerTier('sales_navigator'), false, 'sales_navigator should not be consumer');
assert.strictEqual(isConsumerTier('recruiter_lite'), false, 'recruiter_lite should not be consumer');
assert.strictEqual(isConsumerTier('recruiter_corporate'), false, 'recruiter_corporate should not be consumer');
assert.strictEqual(isConsumerTier(undefined), true, 'undefined tier should default to free/consumer');

console.log('Testing parseNumericIds...');
assert.deepStrictEqual(parseNumericIds('123,456,789'), ['123', '456', '789'], 'should parse comma-separated numeric IDs');
assert.deepStrictEqual(parseNumericIds('123, abc, 456'), ['123', '456'], 'should filter out non-numeric values');
assert.deepStrictEqual(parseNumericIds('International Baccalaureate'), [], 'should reject company names');
assert.deepStrictEqual(parseNumericIds(''), [], 'should handle empty string');
assert.deepStrictEqual(parseNumericIds(undefined), [], 'should handle undefined');
assert.deepStrictEqual(parseNumericIds('  123  ,  456  '), ['123', '456'], 'should trim whitespace');

console.log('Testing buildEnhancedKeyword...');
assert.strictEqual(
  buildEnhancedKeyword('Head of Secondary', { location: 'China', industry: 'Education Management', language: 'English' }, 'free'),
  'Head of Secondary China Education Management English',
  'consumer tier should append filters to keyword'
);
assert.strictEqual(
  buildEnhancedKeyword('Head of Secondary', { location: 'Shanghai,Shenzhen', industry: 'Computer Software,Internet', language: 'English,Chinese' }, 'free'),
  'Head of Secondary Shanghai Shenzhen Computer Software Internet English Chinese',
  'consumer tier should handle multiple comma-separated filters'
);
assert.strictEqual(
  buildEnhancedKeyword('Software Engineer', { location: '', industry: '', language: '' }, 'free'),
  'Software Engineer',
  'consumer tier with empty filters should keep original keyword'
);
assert.strictEqual(
  buildEnhancedKeyword('Head of Secondary', { location: 'China', industry: 'Education Management' }, 'sales_navigator'),
  'Head of Secondary',
  'non-consumer tier should not modify keyword'
);
assert.strictEqual(
  buildEnhancedKeyword('Head of Secondary', { location: 'China' }, 'premium_business'),
  'Head of Secondary China',
  'premium_business should be treated as consumer tier'
);

console.log('All linkedin-scout unit tests passed!');

console.log('Testing multi-line card parsing keeps headline and location apart...');
const cardParse = __test__.parseLinkedInNameCard;
{
  // Rendered lines: name+degree / headline / location. The headline sits right next
  // to the city, which used to make the keyword expansion swallow it into location.
  const parsed = cardParse('Adam Rooney • 1st\nIB Schools Academic Data Coordinator\nDoha, Qatar');
  assert.strictEqual(parsed.name, 'Adam Rooney');
  assert.strictEqual(parsed.degree, '1st');
  assert.strictEqual(parsed.title, 'IB Schools Academic Data Coordinator');
  assert.strictEqual(parsed.location, 'Doha, Qatar');

  const withRegion = cardParse('Natalie King • 1st\nSenior Teacher at Eton House International Pre School\nSuzhou, Jiangsu, China');
  assert.strictEqual(withRegion.title, 'Senior Teacher at Eton House International Pre School');
  assert.strictEqual(withRegion.location, 'Suzhou, Jiangsu, China');

  // Single-line cards keep the previous heuristic.
  const flat = cardParse('Fixture Person • 2nd Engineer Singapore');
  assert.strictEqual(flat.name, 'Fixture Person');
  assert.strictEqual(flat.degree, '2nd');
}
console.log('Multi-line card parsing OK');

console.log('Testing degree rendered on its own line...');
{
  const split = cardParse('Andy Jun Bautista\n• 1st\nTEFL Teacher\nChengdu, Sichuan, China');
  assert.strictEqual(split.name, 'Andy Jun Bautista');
  assert.strictEqual(split.degree, '1st');
  assert.strictEqual(split.title, 'TEFL Teacher');
  assert.strictEqual(split.location, 'Chengdu, Sichuan, China');

  const splitNoDegreeBody = cardParse('Tyler Wright, DET\n• 2nd\nScience Teacher\nShanghai, China');
  assert.strictEqual(splitNoDegreeBody.name, 'Tyler Wright, DET');
  assert.strictEqual(splitNoDegreeBody.degree, '2nd');
  assert.strictEqual(splitNoDegreeBody.title, 'Science Teacher');
  assert.strictEqual(splitNoDegreeBody.location, 'Shanghai, China');
}
console.log('Split degree line OK');
