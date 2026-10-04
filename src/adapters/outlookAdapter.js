const {
  findByAccessibleName,
  getElementText,
  extractEmailsFromText,
  isInside,
  getTypedRecipients,
} = require('./adapterUtils');

/**
 * Adapter for Outlook on the web (outlook.office.com, outlook.live.com,
 * outlook.office365.com).
 */
const id = 'outlook';

const hostnames = ['outlook.office.com', 'outlook.live.com', 'outlook.office365.com'];

const BODY_SELECTOR = 'div[aria-label="Message body"][contenteditable="true"], div[aria-label="Message Body"][contenteditable="true"], div[role="textbox"][contenteditable="true"]';
const SUBJECT_SELECTOR = 'input[aria-label="Add a subject"], input[aria-label="Subject"]';
const SEND_BUTTON_SELECTOR = 'button, div[role="button"]';

function findComposeBodies(root) {
  return Array.from(root.querySelectorAll(BODY_SELECTOR));
}

function findComposeContainer(bodyEl) {
  return (
    bodyEl.closest('div[role="dialog"], div[role="complementary"], form') ||
    bodyEl.parentElement
  );
}

function findSendButton(container) {
  const candidates = findByAccessibleName(container, SEND_BUTTON_SELECTOR, ['send']);
  return candidates[0] || null;
}

/**
 * Returns the email addresses of every recipient (To/Cc/Bcc) in a compose
 * container. Outlook recipient "personas" commonly carry the address in a
 * `title` attribute (as plain "name@domain.com" or "Name <name@domain.com>");
 * addresses still typed into a recipient input are included too. The message
 * body is never read, so an address mentioned (or linked) in the body can't
 * make the draft look internal. If no recipients can be found this returns
 * [], which is treated as untrusted.
 */
function getRecipients(container) {
  const titledEls = Array.from(container.querySelectorAll('[title]'))
    .filter((el) => !isInside(el, container, BODY_SELECTOR));
  const emails = [];
  for (const el of titledEls) {
    emails.push(...extractEmailsFromText(el.getAttribute('title')));
  }
  return [...emails, ...getTypedRecipients(container, SUBJECT_SELECTOR)];
}

/**
 * True for Outlook's keyboard send shortcuts: Ctrl+Enter / Cmd+Enter, and
 * Alt+S. Alt+S is matched on `code` because macOS turns Option+S into "ß".
 */
function isSendShortcut(event) {
  if (event.isComposing) return false;
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) return true;
  return event.altKey && event.code === 'KeyS';
}

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
