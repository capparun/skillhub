#!/usr/bin/env node
import './distribution-binding.mjs';
import { batch } from './batch.mjs';
import { prepareEvidenceDirectory, captureSearchEvidence, captureFailureEvidence } from './search-evidence.mjs';
import { managedSessionTransport } from './session-lifecycle.mjs';
import { issueExecutionContext, readExecutionContext, invalidateExecutionContext, invalidateInterruptedContext } from './execution-context.mjs';
import { searchPage } from './pagination.mjs';
import { readCheckpoint } from './checkpoints.mjs';
import { VERSION } from './version.mjs';
import { FIELD_SCHEMAS } from './fields.mjs';
import { doctor } from './doctor.mjs';
import { executionTransport } from './execution.mjs';
import { capabilities } from './capabilities.mjs';
import { leadRead } from './lead-read.mjs';
import { accountRead } from './account-read.mjs';
import { leadSearch } from './lead-search.mjs';
import { exportFile } from './export.mjs';
import { accountSearch } from './account-search.mjs';
import { accountCheck } from './account-check.mjs';
import { withProfileLock } from './profile-lock.mjs';
import { filterOptions } from './filter-options.mjs';
import { createTransport } from './opencli.mjs';

const [command, raw, ...rest] = process.argv.slice(2);
let execution;
let contextToInvalidate;
try {
  if (rest.length) throw new Error('Unexpected arguments');
  if (command === 'capabilities' && raw === undefined) {
    process.stdout.write(JSON.stringify({ ok: true, data: {
      version: VERSION, mode: 'development',
      search_fields: Object.fromEntries(Object.entries(FIELD_SCHEMAS).map(([type, fields]) => [type, Object.entries(fields).map(([key, schema]) => ({ key, label: schema.label, type: schema.source, modes: schema.modes, ...(schema.source==='range'?{unit:schema.query_type==='ANNUAL_REVENUE'?'millions':schema.query_type.includes('GROWTH')?'percent':'people',subfield:schema.query_type==='ANNUAL_REVENUE'?'currency':schema.query_type.startsWith('DEPARTMENT_')?'department':null}:{}), ...(schema.source==='restricted'?{status:'restricted_in_validated_account'}:{}) }))])),
      search_contract: { filters: 'field key to [{label,mode,lookup_query?}], range {min?,max?,currency|department}, text string or boolean; restricted fields explicitly fail', limit: { min: 1, max: 2500 }, max_pages: { min: 1, max: 10 }, result_scope: 'visible_cards_or_explicit_bounded_collection', boolean_keywords: 'platform_interpreted_verbatim', execution_context: { input: 'optional opaque id from a full account-check', max_age_ms: 300000, identity: 'fresh connection generation and self URL per operation', capability_evidence: 'cached snapshot plus actual target validation' } },
      operations: { batch: 'bounded_single_tab_read_only_workflow', 'account-check': 'implemented', 'account-search': 'implemented_core_filters_and_bounded_pagination', 'lead-search': 'implemented_core_filters_and_bounded_pagination', 'account-read': 'implemented_header_and_expanded_about', 'lead-read': 'implemented_profile_card_current_roles_and_expanded_about', 'filter-options': 'implemented_core_fields_and_account_static', 'search-page': 'implemented_query_bound_local_checkpoint', export: 'implemented_local_json_csv_markdown_html' },
    } }) + '\n');
  } else if (command === 'doctor') {
    const data = await doctor(JSON.parse(raw ?? '{}'), { transport: createTransport() });
    process.stdout.write(JSON.stringify({ ok: true, data: { ...data, adapter_version: VERSION } }) + '\n');
  } else if (command === 'export') {
    const data = await exportFile(JSON.parse(raw ?? '{}'));
    process.stdout.write(JSON.stringify({ ok: true, data: { ...data, adapter_version: VERSION } }) + '\n');
  } else if (command === 'batch' || command === 'account-check' || command === 'filter-options' || command === 'account-search' || command === 'lead-search' || command === 'account-read' || command === 'lead-read' || command === 'capabilities' || command === 'search-page') {
    const { request_budget, execution_context, evidence_directory, ...input } = JSON.parse(raw ?? '{}');
    if (command === 'account-check' && execution_context !== undefined) throw new Error('account-check always refreshes the complete diagnostic');
    if (evidence_directory !== undefined && !['account-search','lead-search','search-page'].includes(command)) throw new Error('evidence_directory is only supported for search commands');
    const evidenceDirectory = evidence_directory === undefined ? undefined : await prepareEvidenceDirectory(evidence_directory);
    const contextSnapshot = execution_context === undefined ? undefined : await readExecutionContext(execution_context, input);
    contextToInvalidate = contextSnapshot?.id;
    // Match upstream's background API lifecycle; UI operations remain foreground.
    const keywordApiOnly = command === 'lead-search' && typeof input.keywords === 'string' && input.filters && Object.keys(input.filters).length === 0;
    // Checkpoint is checksummed and version-bound before choosing a mode;
    // searchPage still validates its account/query binding before browser actions.
    const apiResume = command === 'search-page' && (await readCheckpoint(input.cursor)).collection_provider === 'salesnav_read_api';
    const owned = managedSessionTransport(createTransport({ windowMode: keywordApiOnly || apiResume ? 'background' : 'foreground' }), input.profile);
    execution = executionTransport(owned.transport, request_budget, { cleanup: owned.cleanup });
    let fullCheck;
    const data = await withProfileLock(input.profile, async () => {
      try {
        const result = await ({ batch, 'account-check': accountCheck, 'filter-options': filterOptions, 'account-search': accountSearch, 'lead-search': leadSearch, 'account-read': accountRead, 'lead-read': leadRead, capabilities, 'search-page': searchPage }[command])(input, execution.transport, { onStage: execution.markStage, contextSnapshot, captureConnection: !contextSnapshot, onFullCheck: report => { fullCheck = report; } });
        if (evidenceDirectory) result.ui_evidence = await captureSearchEvidence(result,input,execution.transport,{profile:input.profile,session:'salesnav-evidence'},evidenceDirectory);
        return result;
      } catch (error) {
        if (evidenceDirectory) error.details = { ...error.details, ui_evidence: await captureFailureEvidence(execution.transport,{profile:input.profile,session:'salesnav-evidence'},evidenceDirectory) };
        throw error;
      }
      finally { await execution.cleanup(); }
    });
    if (execution.usage.cleanup?.status === 'failed') {
      if (contextToInvalidate) await invalidateExecutionContext(contextToInvalidate);
      data.execution_context = { status: 'unavailable', reason: 'cleanup_failed' };
    } else if (data.interruption) {
      // Collection returns a partial envelope instead of throwing. It must not
      // accidentally keep a diagnostic context alive after a browser failure.
      await invalidateInterruptedContext(data, contextToInvalidate);
    } else if (fullCheck) {
      try { data.execution_context = await issueExecutionContext(fullCheck); }
      catch { data.execution_context = { status: 'unavailable', reason: 'context_storage_failed' }; }
    } else if (contextSnapshot) {
      data.execution_context = { id: contextSnapshot.id, status: command === 'batch' ? 'batch_identity_lease' : 'identity_revalidated', connection_generation_verified: true, full_check_at: contextSnapshot.report.checked_at, expires_at: contextSnapshot.expires_at, capability_evidence: 'snapshot_with_target_validation' };
    }
    if (['account-search', 'lead-search'].includes(command) && input.filters !== undefined) data.timing = execution.timings();
    data.navigation = owned.navigation;
    data.local_budget = execution.usage;
    process.stdout.write(JSON.stringify({ ok: true, data: { ...data, adapter_version: VERSION } }) + '\n');
  } else {
    process.stdout.write(JSON.stringify({ ok: false, error: { code: 'unsupported', message: 'Use capabilities or account-check with a JSON object.' } }) + '\n');
    process.exitCode = 2;
  }
} catch (error) {
  if (contextToInvalidate && execution?.usage.used > 0) await invalidateExecutionContext(contextToInvalidate);
  const code = execution?.usage.last_outcome === 'not_dispatched_budget_exhausted' ? 'budget_exhausted' : ['evidence_exists', 'api_read_failed', 'bridge_unreachable', 'profile_not_connected', 'context_invalidated', 'context_expired', 'invalid_execution_context', 'page_blocked', 'access_denied', 'rate_limited', 'window_not_visible', 'verification_required', 'login_required', 'invalid_response', 'invalid_checkpoint', 'checkpoint_version_mismatch', 'checkpoint_expired', 'query_mismatch', 'page_incomplete', 'budget_exhausted', 'export_read_failed', 'export_write_failed', 'export_exists', 'sensitive_data', 'profile_busy', 'unsupported', 'account_unconfirmed', 'identity_mismatch', 'page_not_ready', 'options_not_ready', 'bridge_failure', 'bridge_timeout', 'page_changed', 'dirty_query_state', 'invalid_option', 'search_not_confirmed', 'unsupported_keyword_syntax', 'keyword_input_failed'].includes(error.code) ? error.code : 'invalid_input';
  process.stdout.write(JSON.stringify({ ok: false, error: { code, message: code === 'window_not_visible' ? 'The target Chrome page is hidden. Make the OpenCLI window visible before using UI filters. This is not evidence of a disconnected profile.' : code === 'account_unconfirmed' && error.details?.stage === 'account_check' ? error.message + (execution ? '; timing_ms=' + Math.round(execution.timings().total) + '; cleanup=' + (execution.usage.cleanup?.status ?? 'not_recorded') : '') : code === 'bridge_unreachable' ? 'Cannot reach the local OpenCLI service from this execution environment. Check local service access and permissions before asking to reconnect Chrome.' : code === 'profile_not_connected' ? 'The explicitly selected Chrome profile is not connected. No other profile was selected.' : 'Operation did not complete; inspect the error code.', ...(execution ? { execution: execution.usage, timing: execution.timings() } : {}), ...(error.details ? { details: error.details } : {}) } }) + '\n');
  process.exitCode = 2;
}
