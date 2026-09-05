/**
 * Builds and shows the modal that blocks a send action when PII is detected.
 * Pure DOM construction so it can be unit tested with jsdom without any
 * chrome.* APIs.
 */

const { SEVERITY_ORDER } = require('../detector/piiRules');

function groupFindings(findings) {
  const byRule = new Map();
  for (const f of findings) {
    if (!byRule.has(f.ruleId)) {
      byRule.set(f.ruleId, { label: f.label, severity: f.severity, count: 0, samples: [] });
    }
    const g = byRule.get(f.ruleId);
    g.count += 1;
    if (g.samples.length < 3) g.samples.push(f.match);
  }
  return Array.from(byRule.values()).sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  );
}

function maskSample(sample, ruleId) {
  if (ruleId === 'creditCard' || ruleId === 'ssn' || ruleId === 'bankAccount') {
    const digitsOnly = sample.replace(/\D/g, '');
    if (digitsOnly.length >= 4) {
      return `••••${digitsOnly.slice(-4)}`;
    }
  }
  return sample;
}

/**
 * @param {Document} doc
 * @param {Array} findings - output of piiDetector.scanText().findings
 * @param {Object} callbacks
 * @param {Function} callbacks.onSendAnyway
 * @param {Function} callbacks.onEditDraft
 * @returns {HTMLElement} the overlay element, already appended to doc.body
 */
function createWarningDialog(doc, findings, callbacks = {}) {
  const groups = groupFindings(findings);

  const overlay = doc.createElement('div');
  overlay.className = 'pii-guard-overlay';
  overlay.setAttribute('role', 'alertdialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'pii-guard-title');

  const modal = doc.createElement('div');
  modal.className = 'pii-guard-modal';

  const title = doc.createElement('h2');
  title.id = 'pii-guard-title';
  title.className = 'pii-guard-title';
  title.textContent = 'Possible personal information detected';
  modal.appendChild(title);

  const intro = doc.createElement('p');
  intro.className = 'pii-guard-intro';
  intro.textContent = `This message looks like it contains ${findings.length} item(s) of sensitive information. Review before sending.`;
  modal.appendChild(intro);

  const list = doc.createElement('ul');
  list.className = 'pii-guard-list';
  for (const g of groups) {
    const item = doc.createElement('li');
    item.className = `pii-guard-item pii-guard-severity-${g.severity}`;
    const samplesText = g.samples.map((s) => maskSample(s, g.ruleId)).join(', ');
    item.textContent = `${g.label} — ${g.count} match(es): ${samplesText}`;
    list.appendChild(item);
  }
  modal.appendChild(list);

  const actions = doc.createElement('div');
  actions.className = 'pii-guard-actions';

  const editBtn = doc.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'pii-guard-btn pii-guard-btn-primary';
  editBtn.textContent = 'Go back and edit';
  editBtn.addEventListener('click', () => {
    overlay.remove();
    if (callbacks.onEditDraft) callbacks.onEditDraft();
  });

  const sendBtn = doc.createElement('button');
  sendBtn.type = 'button';
  sendBtn.className = 'pii-guard-btn pii-guard-btn-danger';
  sendBtn.textContent = 'Send anyway';
  sendBtn.addEventListener('click', () => {
    overlay.remove();
    if (callbacks.onSendAnyway) callbacks.onSendAnyway();
  });

  actions.appendChild(editBtn);
  actions.appendChild(sendBtn);
  modal.appendChild(actions);

  overlay.appendChild(modal);
  doc.body.appendChild(overlay);

  editBtn.focus();

  return overlay;
}

module.exports = { createWarningDialog, groupFindings, maskSample };
