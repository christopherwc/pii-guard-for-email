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

  test('never reads recipients from the message body', () => {
    const { dialog, bodyDiv } = buildComposeFixture(document, { body: 'cc carol@company.com' });
    Object.defineProperty(dialog, 'innerText', { value: bodyDiv.innerText, configurable: true });

    expect(outlookAdapter.getRecipients(dialog)).toEqual([]);
  });

  test('ignores recipient-looking elements inside the message body', () => {
    const { dialog, bodyDiv } = buildComposeFixture(document, { body: 'hi' });
    const chip = document.createElement('div');
    chip.setAttribute('title', 'Alice <alice@company.com>');
    bodyDiv.appendChild(chip);

    expect(outlookAdapter.getRecipients(dialog)).toEqual([]);
  });

  test('includes addresses still typed into a recipient input alongside chips', () => {
    const { dialog } = buildComposeFixture(document, { subject: 'see bob@company.com', body: 'hi' });
    const chip = document.createElement('div');
    chip.setAttribute('title', 'Alice <alice@company.com>');
    dialog.appendChild(chip);
    const toInput = document.createElement('input');
    toInput.value = 'outsider@gmail.com';
    dialog.appendChild(toInput);

    expect(outlookAdapter.getRecipients(dialog)).toEqual(['alice@company.com', 'outsider@gmail.com']);
  });

  test('returns unresolved typed recipients as-is so they are never trusted', () => {
    const { dialog } = buildComposeFixture(document, { body: 'hi' });
    const toInput = document.createElement('input');
    toInput.value = 'bob, carol@company.com';
    dialog.appendChild(toInput);

    expect(outlookAdapter.getRecipients(dialog)).toEqual(['bob', 'carol@company.com']);
  });

  test('skips hidden inputs such as the sender address', () => {
    const { dialog } = buildComposeFixture(document, { body: 'hi' });
    const fromInput = document.createElement('input');
    fromInput.type = 'hidden';
    fromInput.value = 'me@company.com';
    dialog.appendChild(fromInput);

    expect(outlookAdapter.getRecipients(dialog)).toEqual([]);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });
});

describe('outlookAdapter.isSendShortcut', () => {
  const key = (init) => new KeyboardEvent('keydown', init);

  test('matches Ctrl+Enter, Cmd+Enter and Alt+S (including macOS "ß")', () => {
    expect(outlookAdapter.isSendShortcut(key({ key: 'Enter', ctrlKey: true }))).toBe(true);
    expect(outlookAdapter.isSendShortcut(key({ key: 'Enter', metaKey: true }))).toBe(true);
    expect(outlookAdapter.isSendShortcut(key({ key: 's', code: 'KeyS', altKey: true }))).toBe(true);
    expect(outlookAdapter.isSendShortcut(key({ key: 'ß', code: 'KeyS', altKey: true }))).toBe(true);
  });

  test('ignores plain Enter, plain S and IME composition', () => {
    expect(outlookAdapter.isSendShortcut(key({ key: 'Enter' }))).toBe(false);
    expect(outlookAdapter.isSendShortcut(key({ key: 's', code: 'KeyS' }))).toBe(false);
    expect(outlookAdapter.isSendShortcut(key({ key: 'Enter', ctrlKey: true, isComposing: true }))).toBe(false);
  });
});

describe('outlookAdapter in a non-English UI', () => {
  function buildGermanCompose({ subject, body }) {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const subjectInput = document.createElement('input');
    subjectInput.setAttribute('aria-label', 'Betreff hinzufügen');
    subjectInput.value = subject;
    dialog.appendChild(subjectInput);
    const bodyDiv = document.createElement('div');
    bodyDiv.setAttribute('role', 'textbox');
    bodyDiv.setAttribute('contenteditable', 'true');
    Object.defineProperty(bodyDiv, 'innerText', { value: body, configurable: true });
    dialog.appendChild(bodyDiv);
    const sendBtn = document.createElement('button');
    sendBtn.setAttribute('aria-label', 'Senden');
    dialog.appendChild(sendBtn);
    document.body.appendChild(dialog);
    return { dialog, sendBtn };
  }

  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('scans a localized subject field and never treats it as a recipient', () => {
    const { dialog } = buildGermanCompose({ subject: 'SVN 219-09-9999', body: 'Hallo' });

    expect(outlookAdapter.getComposeText(dialog)).toContain('219-09-9999');
    expect(outlookAdapter.getRecipients(dialog)).toEqual([]);
  });

  test('finds a localized Send button', () => {
    const { dialog, sendBtn } = buildGermanCompose({ subject: '', body: 'Hallo' });
    expect(outlookAdapter.findSendButton(dialog)).toBe(sendBtn);
  });

  test.each([
    ['Envoyer', 'Ajouter un objet'],
    ['Enviar', 'Agregar un asunto'],
    ['送信', '件名を追加'],
  ])('matches Send "%s" and subject "%s"', (sendLabel, subjectLabel) => {
    const dialog = document.createElement('div');
    const subjectInput = document.createElement('input');
    subjectInput.setAttribute('aria-label', subjectLabel);
    subjectInput.value = 'topic';
    const sendBtn = document.createElement('button');
    sendBtn.setAttribute('aria-label', sendLabel);
    dialog.append(subjectInput, sendBtn);

    expect(outlookAdapter.findSendButton(dialog)).toBe(sendBtn);
    expect(outlookAdapter.getComposeText(dialog)).toContain('topic');
  });
});
