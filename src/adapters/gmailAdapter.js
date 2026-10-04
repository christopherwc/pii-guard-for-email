const { findByAccessibleName, getElementText, isInside, getTypedRecipients } = require('./adapterUtils');
const { SEND_LABEL_PREFIXES } = require('./localeLabels');

/**
 * Adapter for Gmail's web UI (mail.google.com).
 *
 * Gmail's DOM class names are obfuscated and change frequently between
 * deploys, so this adapter deliberately keys off stable, accessibility-facing
 * attributes (aria-label / data-tooltip / role) instead of class names.
 */
const id = 'gmail';

const hostnames = ['mail.google.com'];

const BODY_SELECTOR = 'div[aria-label="Message Body"][contenteditable="true"], div[g_editable="true"][role="textbox"]';
const SUBJECT_SELECTOR = 'input[name="subjectbox"]';
const SEND_BUTTON_SELECTOR = 'div[role="button"]';

/** Returns every open compose window's body element, each treated as one compose root. */
function findComposeBodies(root) {
  return Array.from(root.querySelectorAll(BODY_SELECTOR));
}

/** Given a compose body element, finds the nearest ancestor dialog/container that scopes it. */
function findComposeContainer(bodyEl) {
  return bodyEl.closest('div[role="dialog"], form, div.compose') || bodyEl.parentElement;
}

/** Finds the Send button within a compose container. */
function findSendButton(container) {
  const candidates = findByAccessibleName(container, SEND_BUTTON_SELECTOR, SEND_LABEL_PREFIXES);
  return candidates[0] || null;
}

const RECIPIENT_CHIP_SELECTOR = 'span[email]';

/**
 * Returns the email addresses of every recipient (To/Cc/Bcc) in a compose
 * container. Gmail tags each recipient "chip" with a stable `email`
 * attribute; addresses still typed into a recipient input (not yet a chip)
 * are included too. The message body is never read, so an address mentioned
 * in the body can't make the draft look internal. If no recipients can be
 * found this returns [], which is treated as untrusted.
 */
function getRecipients(container) {
  const chips = Array.from(container.querySelectorAll(RECIPIENT_CHIP_SELECTOR))
    .filter((c) => !isInside(c, container, BODY_SELECTOR))
    .map((c) => c.getAttribute('email'))
    .filter(Boolean);
  return [...chips, ...getTypedRecipients(container, SUBJECT_SELECTOR)];
}

/** True for Gmail's keyboard send shortcut (Ctrl+Enter / Cmd+Enter). */
function isSendShortcut(event) {
  if (event.isComposing) return false;
  return event.key === 'Enter' && (event.ctrlKey || event.metaKey);
}

/** Concatenates subject + body text for a compose container so both get scanned. */
function getComposeText(container) {
  const subjectEl = container.querySelector(SUBJECT_SELECTOR);
  const bodyEl = container.querySelector(BODY_SELECTOR);
  const subject = subjectEl ? subjectEl.value || '' : '';
  const body = getElementText(bodyEl);
  return `${subject}\n${body}`;
}

module.exports = {
  id,
  hostnames,
  findComposeBodies,
  findComposeContainer,
  findSendButton,
  getComposeText,
  getRecipients,
  isSendShortcut,
};
