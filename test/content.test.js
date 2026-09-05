const { pickAdapter } = require('../src/content/content');

describe('pickAdapter', () => {
  test('selects the Gmail adapter for mail.google.com', () => {
    expect(pickAdapter('mail.google.com').id).toBe('gmail');
  });

  test('selects the Outlook adapter for outlook.office.com and outlook.live.com', () => {
    expect(pickAdapter('outlook.office.com').id).toBe('outlook');
    expect(pickAdapter('outlook.live.com').id).toBe('outlook');
  });

  test('returns null for unrelated hostnames', () => {
    expect(pickAdapter('example.com')).toBeNull();
  });
});
