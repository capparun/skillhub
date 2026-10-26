import { ArgumentError, CommandExecutionError, EmptyResultError } from '@jackwener/opencli/errors';

export const normalizeWhitespace = value => String(value ?? '').replace(/\s+/g, ' ').trim();

export function canonicalizeThreadUrl(value) {
  let url;
  try { url = new URL(normalizeWhitespace(value)); }
  catch { throw new ArgumentError('threadUrl must be an exact LinkedIn messaging thread URL'); }
  const match = url.pathname.match(/^\/messaging\/thread\/([^/]+)\/?$/i);
  if (url.protocol !== 'https:' || url.hostname !== 'www.linkedin.com' || !match) {
    throw new ArgumentError('threadUrl must be an exact https://www.linkedin.com/messaging/thread/<id>/ URL');
  }
  return `https://www.linkedin.com/messaging/thread/${match[1]}/`;
}

export function parseMaxScrolls(value) {
  const parsed = value === undefined || value === null || value === '' ? 30 : Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 80) {
    throw new ArgumentError('maxScrolls must be an integer between 0 and 80');
  }
  return parsed;
}

export function buildThreadSnapshot(observation, expectedName) {
  const recipient = normalizeWhitespace(observation?.headerName);
  if (!recipient || recipient !== normalizeWhitespace(expectedName)) {
    throw new CommandExecutionError(`LinkedIn thread-snapshot recipient mismatch: expected ${expectedName}; visible ${recipient || 'unknown'}`);
  }
  const messages = Array.isArray(observation?.messages)
    ? observation.messages.map((message, index) => ({
      index,
      speaker: normalizeWhitespace(message?.speaker),
      text: normalizeWhitespace(message?.text),
      timestamp: normalizeWhitespace(message?.timestamp) || null,
    })).filter(message => message.text)
    : [];
  if (!messages.length) {
    throw new EmptyResultError('hunter-linkedin thread-snapshot', 'No rendered messages were found in the exact LinkedIn thread');
  }
  return { recipient, profileUrl: normalizeWhitespace(observation?.headerProfileUrl) || null, messages };
}
