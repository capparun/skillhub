import { randomDelay } from './utils.js';

// Read only the editor's stored values, never unlock a contact or click Save.
// Compare in the page and return booleans instead of exposing contact values.
export async function verifyCandidateContacts(page, detailUrl, expected, delay = randomDelay) {
  const result = {};
  for (const field of Object.keys(expected)) {
    if (!['email', 'mobile'].includes(field)) throw new Error('Unsupported contact field');
    if (!expected[field]) { result[field] = false; continue; }
    const prepared = await page.evaluate(({ field, detailUrl }) => {
      if (location.href !== detailUrl) return false;
      const container = document.querySelector(`[data-test="detail-field:candidate$${field}"]`);
      const button = document.querySelector(`[data-test="inline-edit-btn:candidate$${field}"]`);
      if (!container || !button) return false;
      container.scrollIntoView?.({ block: 'center' });
      for (const type of ['mouseenter', 'mouseover']) {
        container.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
      }
      return true;
    }, { field, detailUrl });
    result[field] = false;
    if (!prepared) continue;
    try {
      await page.click(`[data-test="inline-edit-btn:candidate$${field}"]`);
      const selector = `[data-test="field-edit:candidate$${field}"] input[name="${field}"]`;
      await page.wait({ selector, timeout: 10 });
      for (let attempt = 0; attempt < 5; attempt++) {
        await delay([400, 700]);
        const evidence = await page.evaluate(({ selector, detailUrl, expected }) => {
          const input = document.querySelector(selector);
          return { matches: location.href === detailUrl && !!input && input.value.trim() === expected.trim() };
        }, { selector, detailUrl, expected: expected[field] });
        if (evidence?.matches === true) { result[field] = true; break; }
      }
    } finally {
      // Failure to close is not success: stop rather than interact with another editor.
      await page.click(`[data-test="inline-edit-popover-cancel:candidate$${field}"]`);
    }
  }
  return result;
}
