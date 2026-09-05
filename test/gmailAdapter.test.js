const gmailAdapter = require('../src/adapters/gmailAdapter');

function buildComposeFixture(doc, { subject = '', body = '', sendLabel = 'Send' } = {}) {
  const dialog = doc.createElement('div');
  dialog.setAttribute('role', 'dialog');

  const subjectInput = doc.createElement('input');
  subjectInput.setAttribute('name', 'subjectbox');
  subjectInput.value = subject;
  dialog.appendChild(subjectInput);

  const bodyDiv = doc.createElement('div');
  bodyDiv.setAttribute('aria-label', 'Message Body');
  bodyDiv.setAttribute('contenteditable', 'true');
  bodyDiv.textContent = body;
  // jsdom doesn't compute innerText, so set it directly for the test.
  Object.defineProperty(bodyDiv, 'innerText', { value: body, configurable: true });
  dialog.appendChild(bodyDiv);

  const sendBtn = doc.createElement('div');
  sendBtn.setAttribute('role', 'button');
  sendBtn.setAttribute('data-tooltip', `${sendLabel} ⌘Enter`);
  sendBtn.textContent = sendLabel;
  dialog.appendChild(sendBtn);

  doc.body.appendChild(dialog);
  return { dialog, subjectInput, bodyDiv, sendBtn };
}

describe('gmailAdapter', () => {
  test('recognizes mail.google.com as a supported hostname', () => {
    expect(gmailAdapter.hostnames).toContain('mail.google.com');
  });

  test('finds the compose body and its container', () => {
    const { bodyDiv, dialog } = buildComposeFixture(document, { body: 'hello' });
    const bodies = gmailAdapter.findComposeBodies(document);
    expect(bodies).toContain(bodyDiv);

    const container = gmailAdapter.findComposeContainer(bodyDiv);
    expect(container).toBe(dialog);
  });

  test('finds the Send button by accessible name, ignoring unrelated buttons', () => {
    const { dialog, sendBtn } = buildComposeFixture(document, { body: 'hi' });

    const discardBtn = document.createElement('div');
    discardBtn.setAttribute('role', 'button');
    discardBtn.setAttribute('data-tooltip', 'Discard draft');
    dialog.appendChild(discardBtn);

    const found = gmailAdapter.findSendButton(dialog);
    expect(found).toBe(sendBtn);
  });

  test('concatenates subject and body text for scanning', () => {
    const { dialog } = buildComposeFixture(document, {
      subject: 'Contract details',
      body: 'my ssn is 219-09-9999',
    });
    const text = gmailAdapter.getComposeText(dialog);
    expect(text).toContain('Contract details');
    expect(text).toContain('219-09-9999');
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });
});
