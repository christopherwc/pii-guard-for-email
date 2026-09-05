/**
 * Shared DOM helpers used by every webmail adapter. Kept provider-agnostic
 * and free of chrome.* APIs so they can be unit tested with plain jsdom.
 */

/**
 * Returns true if an element's accessible name (aria-label, data-tooltip,
 * or visible text) starts with one of the given (case-insensitive) prefixes.
 */
function accessibleNameStartsWith(el, prefixes) {
  const candidates = [
    el.getAttribute && el.getAttribute('aria-label'),
    el.getAttribute && el.getAttribute('data-tooltip'),
    el.textContent,
  ];
  return candidates.some((value) => {
    if (!value) return false;
    const normalized = value.trim().toLowerCase();
    return prefixes.some((p) => normalized.startsWith(p.toLowerCase()));
  });
}

/**
 * Finds all elements under `root` matching `selector` whose accessible name
 * starts with one of `prefixes`.
 */
function findByAccessibleName(root, selector, prefixes) {
  const nodes = Array.from(root.querySelectorAll(selector));
  return nodes.filter((el) => accessibleNameStartsWith(el, prefixes));
}

/**
 * Extracts plain text content from a contenteditable compose body element.
 */
function getElementText(el) {
  if (!el) return '';
  return el.innerText !== undefined ? el.innerText : el.textContent || '';
}

module.exports = { accessibleNameStartsWith, findByAccessibleName, getElementText };
