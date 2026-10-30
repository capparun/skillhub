import { accountCheck } from './account-check.mjs';
import { accountRead, normalizeCompany } from './account-read.mjs';
import { leadRead } from './lead-read.mjs';
import { accountSearch } from './account-search.mjs';
import { leadSearch } from './lead-search.mjs';
import { PROFILE_URL_PATTERN } from './linkedin/profile-url.mjs';
const operations = { 'account-read': accountRead, 'lead-read': leadRead, 'account-search': accountSearch, 'lead-search': leadSearch };
const fail = code => { throw Object.assign(new Error(code), { code }); };
// A bounded process-scoped workflow, not a persistent browser daemon.
export async function batch(input, transport, options = {}) {
  if (!input || Object.keys(input).some(k => !['profile','expected_identity','expected_profile_url','operations'].includes(k))
      || !Array.isArray(input.operations) || !input.operations.length || input.operations.length > 50) fail('invalid_input');
  for (const step of input.operations) {
    if (!step || Object.keys(step).some(k => !['command','input'].includes(k)) || !operations[step.command]
        || !step.input || typeof step.input !== 'object' || Array.isArray(step.input)
        || Object.keys(step.input).some(k => ['profile','expected_identity','expected_profile_url','execution_context','request_budget'].includes(k))) fail('invalid_input');
  }
  if (typeof input.expected_profile_url !== 'string' || !PROFILE_URL_PATTERN.test(input.expected_profile_url)) fail('invalid_input');
  const binding = Object.fromEntries(['profile','expected_identity','expected_profile_url'].map(k => [k,input[k]]));
  const batchIdentity = {};
  let contextSnapshot = options.contextSnapshot;
  if (!contextSnapshot) {
    const report = await accountCheck(binding, transport, { ...options, captureConnection:true, batchIdentity });
    if (!report.identity_match || report.account_binding.status !== 'observed' || report.connection_binding.status !== 'observed') fail('account_unconfirmed');
    // Full check established the in-memory lease on this owned transport.
    contextSnapshot = { report, expires_at:Date.now()+300000 };
  }
  const receipts = [];
  const details = new Map();
  for (const [index,step] of input.operations.entries()) {
    try {
      const key = step.command === 'account-read' ? normalizeCompany(step.input.company) : null;
      if (key && details.has(key)) {
        receipts.push({index,command:step.command,status:'reused',source_index:details.get(key)});
        continue;
      }
      const data = await operations[step.command]({...step.input,...binding},transport,{...options,contextSnapshot,batchIdentity});
      receipts.push({index,command:step.command,status:'completed',data});
      if (data.interruption) return {operation:'batch',receipts,completeness:'partial',interruption:data.interruption};
      if (key) details.set(key,index);
    } catch(error) {
      return {operation:'batch',receipts,completeness:'partial',interruption:{index,code:error.code ?? 'invalid_input',...(error.details ? {details:error.details} : {})},stop_reason:'operation_interrupted'};
    }
  }
  return {operation:'batch',receipts,completeness:'complete',scope:'requested_operations_only',identity_policy:'self_url_once_per_batch_then_connection_and_target_identity_checks',identity_expires_at:contextSnapshot.expires_at};
}
