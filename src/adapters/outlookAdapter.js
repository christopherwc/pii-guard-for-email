const { findByAccessibleName, getElementText } = require('./adapterUtils');

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
