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
    const text = gmailAdapter.getComposeParts(dialog).authored;
    expect(text).toContain('Contract details');
    expect(text).toContain('219-09-9999');
  });

  test('reads recipient addresses from chip "email" attributes', () => {
    const { dialog } = buildComposeFixture(document, { body: 'hi' });
    const chip1 = document.createElement('span');
    chip1.setAttribute('email', 'alice@company.com');
    const chip2 = document.createElement('span');
    chip2.setAttribute('email', 'bob@company.com');
    dialog.appendChild(chip1);
    dialog.appendChild(chip2);

    expect(gmailAdapter.getRecipients(dialog)).toEqual(['alice@company.com', 'bob@company.com']);
  });

  test('never reads recipients from the message body', () => {
    const { dialog, bodyDiv } = buildComposeFixture(document, { body: 'cc carol@company.com' });
    Object.defineProperty(dialog, 'innerText', { value: bodyDiv.innerText, configurable: true });

    expect(gmailAdapter.getRecipients(dialog)).toEqual([]);
  });

  test('ignores recipient-looking elements inside the message body', () => {
    const { dialog, bodyDiv } = buildComposeFixture(document, { body: 'hi' });
    const chip = document.createElement('span');
    chip.setAttribute('email', 'alice@company.com');
    bodyDiv.appendChild(chip);

    expect(gmailAdapter.getRecipients(dialog)).toEqual([]);
  });

  test('includes addresses still typed into a recipient input alongside chips', () => {
    const { dialog } = buildComposeFixture(document, { subject: 'see bob@company.com', body: 'hi' });
    const chip = document.createElement('span');
    chip.setAttribute('email', 'alice@company.com');
    dialog.appendChild(chip);
    const toInput = document.createElement('input');
    toInput.value = 'outsider@gmail.com';
    dialog.appendChild(toInput);

    expect(gmailAdapter.getRecipients(dialog)).toEqual(['alice@company.com', 'outsider@gmail.com']);
  });

  test('returns unresolved typed recipients as-is so they are never trusted', () => {
    const { dialog } = buildComposeFixture(document, { body: 'hi' });
    const toInput = document.createElement('input');
    toInput.value = 'bob, carol@company.com';
    dialog.appendChild(toInput);

    expect(gmailAdapter.getRecipients(dialog)).toEqual(['bob', 'carol@company.com']);
  });

  test('skips hidden inputs such as the sender address', () => {
    const { dialog } = buildComposeFixture(document, { body: 'hi' });
    const fromInput = document.createElement('input');
    fromInput.type = 'hidden';
    fromInput.value = 'me@company.com';
    dialog.appendChild(fromInput);

    expect(gmailAdapter.getRecipients(dialog)).toEqual([]);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });
});

describe('gmailAdapter.isSendShortcut', () => {
  const key = (init) => new KeyboardEvent('keydown', init);

  test('matches Ctrl+Enter and Cmd+Enter', () => {
    expect(gmailAdapter.isSendShortcut(key({ key: 'Enter', ctrlKey: true }))).toBe(true);
    expect(gmailAdapter.isSendShortcut(key({ key: 'Enter', metaKey: true }))).toBe(true);
  });

  test('ignores plain Enter, Alt+S, and IME composition', () => {
    expect(gmailAdapter.isSendShortcut(key({ key: 'Enter' }))).toBe(false);
    expect(gmailAdapter.isSendShortcut(key({ key: 's', code: 'KeyS', altKey: true }))).toBe(false);
    expect(gmailAdapter.isSendShortcut(key({ key: 'Enter', ctrlKey: true, isComposing: true }))).toBe(false);
  });
});

describe('gmailAdapter in a non-English UI', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  test.each(['Envoyer', 'Senden', 'Enviar', 'Invia', '送信'])('finds a Send button labelled "%s"', (label) => {
    const { dialog, sendBtn } = buildComposeFixture(document, { body: 'hi', sendLabel: label });
    expect(gmailAdapter.findSendButton(dialog)).toBe(sendBtn);
  });

  test('does not mistake an unrelated localized button for Send', () => {
    const { dialog, sendBtn } = buildComposeFixture(document, { body: 'hi', sendLabel: 'Envoyer' });
    const discard = document.createElement('div');
    discard.setAttribute('role', 'button');
    discard.setAttribute('aria-label', 'Supprimer le brouillon');
    dialog.insertBefore(discard, sendBtn);

    expect(gmailAdapter.findSendButton(dialog)).toBe(sendBtn);
  });
});

describe('gmailAdapter.getComposeParts', () => {
  /** Sets innerText, which jsdom doesn't compute, on an element. */
  const setText = (el, text) => Object.defineProperty(el, 'innerText', { value: text, configurable: true });

  /** Builds a reply body: authored text, signature, then the quoted earlier message. */
  function buildReply({ authored, signature, quote }) {
    const { dialog, bodyDiv } = buildComposeFixture(document, { subject: 'Re: plans' });
    const sig = document.createElement('div');
    sig.className = 'gmail_signature';
    sig.setAttribute('data-smartmail', 'gmail_signature');
    setText(sig, signature);
    const quoteDiv = document.createElement('div');
    quoteDiv.className = 'gmail_quote';
    const nested = document.createElement('blockquote');
    nested.className = 'gmail_quote';
    setText(nested, quote.split('\n').slice(1).join('\n'));
    quoteDiv.appendChild(nested);
    setText(quoteDiv, quote);
    bodyDiv.append(sig, quoteDiv);
    setText(bodyDiv, `${authored}\n\n${signature}\n\n${quote}`);
    return dialog;
  }

  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('separates the signature and quoted message from what the user wrote', () => {
    const dialog = buildReply({
      authored: 'Sounds good, see you then.',
      signature: 'Jane Doe\njane@example.com',
      quote: 'On Mon, Bob <bob@example.com> wrote:\nLunch on Friday?',
    });

    const { authored, quoted } = gmailAdapter.getComposeParts(dialog);
    expect(authored).toContain('Re: plans');
    expect(authored).toContain('Sounds good, see you then.');
    expect(authored).not.toContain('jane@example.com');
    expect(authored).not.toContain('bob@example.com');
    expect(quoted).toBe('Jane Doe\njane@example.com\nOn Mon, Bob <bob@example.com> wrote:\nLunch on Friday?');
  });

  test('treats everything as authored when quoted text cannot be located in the body', () => {
    const { dialog, bodyDiv } = buildComposeFixture(document, { body: 'hello' });
    const sig = document.createElement('div');
    sig.className = 'gmail_signature';
    setText(sig, 'text that is not in the body');
    bodyDiv.appendChild(sig);

    expect(gmailAdapter.getComposeParts(dialog)).toEqual({ authored: '\nhello', quoted: '' });
  });
});
