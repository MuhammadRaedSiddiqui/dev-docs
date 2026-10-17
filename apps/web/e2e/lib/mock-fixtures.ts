import { test as framework, expect } from './fixtures';
import { MockApplication } from './mocks/application';
import { getConsoleErrors } from './monitoring/consoleMonitor';

export const test = framework.extend<{ app: MockApplication }>({
  app: [async ({ page }, use, testInfo) => {
    const app = new MockApplication(page);
    await app.install();
    await use(app);
    expect(app.unexpected, 'Every application request must have an explicit mock').toEqual([]);
    // Failure scenarios deliberately produce HTTP/network errors. Every other
    // console error, page exception, or crash fails the test.
    const fatal = getConsoleErrors(page).filter(e => e.kind !== 'console' || !/^Failed to load resource:/.test(e.text));
    expect(fatal, 'No unexpected browser errors, crashes or hydration failures').toEqual([]);
    await testInfo.attach('api-call-summary', { body: JSON.stringify(app.calls.map(c => c.procedure)), contentType: 'application/json' });
  }, { auto: true }],
});
export { expect };
