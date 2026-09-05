const { createWarningDialog, groupFindings, maskSample } = require('../src/ui/warningDialog');

describe('groupFindings', () => {
  test('groups findings by rule and orders by severity', () => {
    const findings = [
      { ruleId: 'phone', label: 'Phone numbers', severity: 'low', match: '415-555-0132', index: 0 },
      { ruleId: 'ssn', label: 'Social Security Numbers', severity: 'high', match: '219-09-9999', index: 1 },
    ];
    const groups = groupFindings(findings);
    expect(groups[0].label).toBe('Social Security Numbers');
    expect(groups[1].label).toBe('Phone numbers');
  });

  test('counts repeated matches for the same rule', () => {
    const findings = [
      { ruleId: 'email', label: 'Email addresses', severity: 'medium', match: 'a@b.com', index: 0 },
      { ruleId: 'email', label: 'Email addresses', severity: 'medium', match: 'c@d.com', index: 10 },
    ];
    const groups = groupFindings(findings);
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(2);
  });
});

describe('maskSample', () => {
  test('masks all but the last 4 digits for sensitive numeric rules', () => {
    expect(maskSample('219-09-9999', 'ssn')).toBe('••••9999');
    expect(maskSample('4111111111111111', 'creditCard')).toBe('••••1111');
  });

  test('leaves non-numeric rule samples untouched', () => {
    expect(maskSample('jane@example.com', 'email')).toBe('jane@example.com');
  });
});

describe('createWarningDialog', () => {
  const findings = [
    { ruleId: 'ssn', label: 'Social Security Numbers', severity: 'high', match: '219-09-9999', index: 0 },
  ];

  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('appends a modal overlay to the document body', () => {
    createWarningDialog(document, findings, {});
    const overlay = document.querySelector('.pii-guard-overlay');
    expect(overlay).not.toBeNull();
    expect(overlay.querySelector('.pii-guard-title').textContent).toMatch(/personal information/i);
  });

  test('clicking "Go back and edit" removes the dialog and calls onEditDraft', () => {
    const onEditDraft = jest.fn();
    createWarningDialog(document, findings, { onEditDraft });
    document.querySelector('.pii-guard-btn-primary').click();
    expect(onEditDraft).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.pii-guard-overlay')).toBeNull();
  });

  test('clicking "Send anyway" removes the dialog and calls onSendAnyway', () => {
    const onSendAnyway = jest.fn();
    createWarningDialog(document, findings, { onSendAnyway });
    document.querySelector('.pii-guard-btn-danger').click();
    expect(onSendAnyway).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.pii-guard-overlay')).toBeNull();
  });
});
