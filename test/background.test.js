describe('background toolbar badge', () => {
  let onMessage;

  beforeEach(() => {
    jest.resetModules();
    global.chrome = {
      runtime: {
        onInstalled: { addListener: jest.fn() },
        onMessage: { addListener: jest.fn((fn) => { onMessage = fn; }) },
      },
      action: { setBadgeText: jest.fn(), setBadgeBackgroundColor: jest.fn(), setTitle: jest.fn() },
      storage: { sync: { get: jest.fn(), set: jest.fn() } },
    };
    require('../src/background/background');
  });

  afterEach(() => {
    delete global.chrome;
  });

  const status = (fields) => ({ type: 'PII_TAB_STATUS', count: 0, sendButtonMissing: false, ...fields });

  test('shows the live count on the sending tab only', () => {
    onMessage(status({ count: 3 }), { tab: { id: 7 } }, jest.fn());
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ tabId: 7, text: '3' });
    expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith(expect.objectContaining({ tabId: 7 }));
    expect(chrome.action.setTitle).toHaveBeenCalledWith({ tabId: 7, title: 'PII Guard' });
  });

  test('clears the badge when the count is zero', () => {
    onMessage(status({}), { tab: { id: 7 } }, jest.fn());
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ tabId: 7, text: '' });
  });

  test('a missing Send button shows "!" and an explanation, taking priority over the count', () => {
    onMessage(status({ count: 3, sendButtonMissing: true }), { tab: { id: 7 } }, jest.fn());
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ tabId: 7, text: '!' });
    expect(chrome.action.setTitle).toHaveBeenCalledWith({
      tabId: 7,
      title: expect.stringMatching(/can't find the Send button/),
    });
  });

  test('ignores status messages that did not come from a tab', () => {
    onMessage(status({ count: 3 }), {}, jest.fn());
    expect(chrome.action.setBadgeText).not.toHaveBeenCalled();
  });
});
