import test from 'node:test';
import assert from 'node:assert/strict';
import {validateIdentityTarget} from '../lib/identity-probe.js';

test('identity targets accept raw and percent-encoded non-ASCII profile slugs',()=>{
 assert.equal(validateIdentityTarget('https://www.linkedin.com/in/妍-王-a52634337/'),'https://www.linkedin.com/in/%E5%A6%8D-%E7%8E%8B-a52634337/');
 assert.equal(validateIdentityTarget('https://www.linkedin.com/in/%E5%A6%8D-%E7%8E%8B-a52634337/'),'https://www.linkedin.com/in/%E5%A6%8D-%E7%8E%8B-a52634337/');
 assert.equal(validateIdentityTarget('https://www.linkedin.com/in/ascii-user/'),'https://www.linkedin.com/in/ascii-user/');
});
test('identity targets still reject foreign origins, query strings and non-profile paths',()=>{
 for(const bad of ['https://example.com/in/user/','https://www.linkedin.com/in/user/?trk=x','https://www.linkedin.com/feed/','https://www.linkedin.com/in/user/extra/'])
  assert.throws(()=>validateIdentityTarget(bad),{code:'invalid_identity_target'});
});
