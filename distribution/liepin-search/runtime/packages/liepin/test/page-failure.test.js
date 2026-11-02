import test from 'node:test';
import assert from 'node:assert/strict';
import {BlankPageError,connectionFailureEvidence} from '../lib/page-failure.js';
import {PreparePreflightError} from '../lib/site-scope.js';
test('preflight wrapper preserves blank diagnosis without copying arbitrary error text',()=>{
 const failure=connectionFailureEvidence(new PreparePreflightError(new BlankPageError('private')));
 assert.equal(failure.code,'LIEPIN_UNEXPECTED_BLANK_PAGE');
 assert.equal(failure.causeConfirmed,false);
 assert.equal(connectionFailureEvidence(new Error('about:blank')),undefined);
});
