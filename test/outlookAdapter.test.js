const outlookAdapter = require('../src/adapters/outlookAdapter');

function buildComposeFixture(doc, { subject = '', body = '', sendLabel = 'Send' } = {}) {
  const dialog = doc.createElement('div');
  dialog.setAttribute('role', 'dialog');

  const subjectInput = doc.createElement('input');
  subjectInput.setAttribute('aria-label', 'Add a subject');
  subjectInput.value = subject;
  dialog.appendChild(subjectInput);

  const bodyDiv = doc.createElement('div');
  bodyDiv.setAttribute('aria-label', 'Message body');
  bodyDiv.setAttribute('contenteditable', 'true');
  bodyDiv.textContent = body;
  Object.defineProperty(bodyDiv, 'innerText', { value: body, configurable: true });
  dialog.appendChild(bodyDiv);

  const sendBtn = doc.createElement('button');
  sendBtn.setAttribute('aria-label', sendLabel);
  sendBtn.textContent = sendLabel;
  dialog.appendChild(sendBtn);

  doc.body.appendChild(dialog);
  return { dialog, subjectInput, bodyDiv, sendBtn };
}

describe('outlookAdapter', () => {
  test('recognizes Outlook Web hostnames', () => {
    expect(outlookAdapter.hostnames).toEqual(
      expect.arrayContaining(['outlook.office.com', 'outlook.live.com', 'outlook.office365.com'])
    );
  });

  test('finds the compose body and its container', () => {
    const { bodyDiv, dialog } = buildComposeFixture(document, { body: 'hello' });
    const bodies = outlookAdapter.findComposeBodies(document);
    expect(bodies).toContain(bodyDiv);

    const container = outlookAdapter.findComposeContainer(bodyDiv);
    expect(container).toBe(dialog);
  });

  test('finds the Send button among other buttons', () => {
    const { dialog, sendBtn } = buildComposeFixture(document, { body: 'hi' });

    const attachBtn = document.createElement('button');
    attachBtn.setAttribute('aria-label', 'Attach file');
    dialog.appendChild(attachBtn);

    const found = outlookAdapter.findSendButton(dialog);
    expect(found).toBe(sendBtn);
  });

  test('concatenates subject and body text for scanning', () => {
    const { dialog } = buildComposeFixture(document, {
      subject: 'Invoice',
      body: 'card 4111 1111 1111 1111',
    });
    const text = outlookAdapter.getComposeText(dialog);
    expect(text).toContain('Invoice');
    expect(text).toContain('4111 1111 1111 1111');
  });

  test('reads recipient addresses from "title" attributes on persona chips', () => {
    const { dialog } = buildComposeFixture(document, { body: 'hi' });
    const persona1 = document.createElement('div');
    persona1.setAttribute('title', 'Alice <alice@company.com>');
    const persona2 = document.createElement('div');
    persona2.setAttribute('title', 'bob@company.com');
    dialog.appendChild(persona1);
    dialog.appendChild(persona2);

    expect(outlookAdapter.getRecipients(dialog)).toEqual(['alice@company.com', 'bob@company.com']);
  });

  test('falls back to scanning text for recipients when no titled chips are present', () => {
    const { dialog, bodyDiv } = buildComposeFixture(document, { body: 'hi' });
    Object.defineProperty(dialog, 'innerText', {
      value: `carol@company.com ${bodyDiv.innerText}`,
      configurable: true,
    });

    expect(outlookAdapter.getRecipients(dialog)).toEqual(['carol@company.com']);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });
});
