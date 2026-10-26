import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { runtimeInvocation } from './runtime-invocation.mjs';
const exec = promisify(execFile);
export async function doctor(input = {}, { run = exec, transport } = {}) {
  if (!input || Object.keys(input).some(key => key !== 'profile') || input.profile !== undefined && (typeof input.profile !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(input.profile))) throw Object.assign(new Error('invalid_input'), { code: 'invalid_input' });
  const node = { version: process.versions.node, supported: Number(process.versions.node.split('.')[0]) >= 22 };
  let opencli = { status: 'unavailable', validated_version: '2.0.1' };
  try {
    const invocation = runtimeInvocation();
    const { stdout } = await run(invocation.command, [...invocation.prefix, '--version'], { timeout: 10000, maxBuffer: 65536 });
    const version = stdout.trim().match(/\b(\d+\.\d+\.\d+)\b/)?.[1];
    opencli = { status: version === '2.0.1' ? 'validated_version' : 'unverified_version', version: version ?? null, validated_version: '2.0.1' };
  } catch { /* Diagnostic result, never forward raw stderr. */ }
  let bridge = { status: 'unknown', connected_profiles: [] };
  if (opencli.status !== 'unavailable' && transport) {
    try {
      const result = await transport.profiles();
      const connected = (result.profiles ?? []).filter(profile => profile.connected).map(profile => ({ profile: profile.contextId, extension_version: profile.extensionVersion ?? null }));
      bridge = { status: input.profile ? connected.some(profile => profile.profile === input.profile) ? 'selected_profile_connected' : 'selected_profile_disconnected' : connected.length ? 'connected' : 'disconnected', connected_profiles: connected };
    } catch (error) { bridge.status = ['bridge_unreachable', 'bridge_timeout'].includes(error.code) ? error.code : 'bridge_failure'; }
  }
  return { operation: 'doctor', node, opencli, bridge, account_access: 'not_checked', next_action: !node.supported ? 'use_node_22_or_newer' : opencli.status === 'unavailable' ? 'make_opencli_available' : ['bridge_unreachable', 'bridge_timeout', 'bridge_failure'].includes(bridge.status) ? 'check_local_service_and_execution_permissions' : !['connected', 'selected_profile_connected'].includes(bridge.status) ? 'connect_selected_chrome_profile' : 'run_account_check', ready_for_account_check: node.supported && opencli.status !== 'unavailable' && ['connected', 'selected_profile_connected'].includes(bridge.status) };
}
