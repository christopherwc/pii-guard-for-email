const { findByAccessibleName, getElementText } = require('./adapterUtils');

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
  const candidates = findByAccessibleName(container, SEND_BUTTON_SELECTOR, ['send']);
  return candidates[0] || null;
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
};
