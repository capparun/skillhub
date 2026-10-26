// Fixed platform observation; never dismiss an unknown modal automatically.
export const blockingDialogExpression = `(() => [...document.querySelectorAll('[role="dialog"][aria-modal="true"],dialog[open]')].some(e => {
  const style = getComputedStyle(e);
  return e.getClientRects().length > 0 && style.display !== 'none' && style.visibility !== 'hidden';
}))()`;
