import test from 'node:test';import assert from 'node:assert/strict';import {acceptRemaining} from '../scripts/acceptance-remaining.mjs';
test('pending or expanded acceptance plans cannot read task files or start a browser',async()=>{
 await assert.rejects(acceptRemaining({approved:false}),/明确批准/);
 for(const altered of [{maxDetailTabs:3},{schemeApplyLimit:2},{listLimit:30},{favoritesLimit:10},{userConfirmation:''}]){
  await assert.rejects(acceptRemaining({approved:true,confirmedAt:'2026-10-20T00:00:00Z',userConfirmation:'synthetic explicit approval',maxDetailTabs:2,schemeApplyLimit:1,listLimit:10,favoritesLimit:2,schemeName:'验收6e1a',...altered}),/明确批准/);
 }
});
