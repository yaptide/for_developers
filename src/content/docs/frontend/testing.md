---
title: Frontend Testing
description: Testing strategy and patterns for the YAPTIDE frontend.
---

The frontend uses **Jest** for unit tests and, together with **Selenium WebDriver**, for end-to-end tests that drive the running app in a browser.

## Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run a specific test file
npm test -- --testPathPattern=SetPosition

# Run in watch mode (default with npm test)
# Press 'a' to run all, 'f' to run failed, 'q' to quit
```

## Test Structure

```
src/
├── __tests__/
│   ├── commands/           # Editor command tests
│   ├── components/         # React component tests
│   └── services/           # Service logic tests
└── ThreeEditor/
    └── __tests__/          # Editor-specific tests (co-located)
```

## Test Setup

There is no global setup file (`src/setupTests.ts`). Tests use Jest's built-in matchers (`toBe`, `toEqual`, `toMatchObject`, ...). A test that needs extra matchers registers them itself, e.g. `Units.test.ts` calls `expect.extend()` with matchers from `jest-matcher-deep-close-to`.

## Testing Editor Commands

Commands are the most critical testable unit. Every command should be tested for:

1. **Execute** — correct state after applying
2. **Undo** — state reverts to original
3. **Redo** — state re-applies correctly
4. **Serialization** — `toJSON()` and `fromJSON()` round-trip

```typescript
describe('AddFigureCommand', () => {
  let editor: YaptideEditor;

  beforeEach(() => {
    editor = new YaptideEditor();
  });

  test('adds figure to scene', () => {
    const figure = createBoxFigure({ x: 10, y: 10, z: 10 });
    editor.execute(new AddFigureCommand(editor, figure));

    expect(editor.figureManager.figures).toHaveLength(1);
    expect(editor.figureManager.figures[0].name).toBe(figure.name);
  });

  test('undo removes the figure', () => {
    const figure = createBoxFigure({ x: 10, y: 10, z: 10 });
    editor.execute(new AddFigureCommand(editor, figure));
    editor.undo();

    expect(editor.figureManager.figures).toHaveLength(0);
  });
});
```

## End-to-End Tests

UI behaviour is tested end to end with Selenium WebDriver in headless Chrome (see `ProjectMenu.test.ts`, `SimulationControls.test.ts` and the converter tests in `src/__tests__/`). These tests open the app at `http://localhost:3000`, so start it with `npm start` before running `npm test`.

```typescript
import { Builder, By, until, WebDriver } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome';

describe('Navigation', () => {
  let driver: WebDriver;

  beforeAll(async () => {
    driver = await new Builder()
      .forBrowser('chrome')
      .setChromeOptions(new chrome.Options().addArguments('--headless') as chrome.Options)
      .build();
  }, 30_000);

  afterAll(async () => {
    await driver.quit();
  }, 30_000);

  test('opens the Examples tab', async () => {
    await driver.get('http://localhost:3000');

    const examplesButton = await driver.wait(
      until.elementLocated(By.xpath("//div[@aria-label = 'Examples']")),
      5_000
    );
    await examplesButton.click();

    const activeTab = await driver.wait(
      until.elementLocated(By.xpath("//div[@aria-label = 'Examples' and @aria-selected = 'true']")),
      10_000
    );
    expect(activeTab).toBeTruthy();
  }, 30_000);
});
```

## Mocking

### Web Workers

Web Workers aren't available in the jsdom test environment. Mock them:

```typescript
// __mocks__/worker.ts
class MockWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;

  postMessage(data: any) {
    // Simulate worker response
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data: { result: {} } }));
    }
  }

  terminate() {}
}

global.Worker = MockWorker as any;
```

### Backend API

Mock `ky` for API tests:

```typescript
jest.mock('ky', () => ({
  create: () => ({
    get: jest.fn().mockResolvedValue({
      json: () => Promise.resolve({ jobState: 'COMPLETED' })
    }),
    post: jest.fn().mockResolvedValue({
      json: () => Promise.resolve({ jobId: 'test-123' })
    }),
  })
}));
```

### Three.js

For tests that don't need rendering, mock Three.js objects:

```typescript
jest.mock('three', () => ({
  BoxGeometry: jest.fn(),
  Mesh: jest.fn(),
  Scene: jest.fn(() => ({
    add: jest.fn(),
    remove: jest.fn(),
    children: []
  })),
}));
```

## Code Quality

### ESLint

```bash
npm run lint
```

Uses Create React App's ESLint preset with additional rules:
- `simple-import-sort` — enforced import ordering
- Prettier integration for formatting

### Prettier

```bash
npx prettier --check src/
npx prettier --write src/
```

## Best Practices

- **Test behavior, not implementation** — find elements by visible text or `aria-*` attributes, not by component internals
- **Test commands thoroughly** — they are the backbone of editor state management
- **Mock at boundaries** — mock Web Workers, APIs, and Three.js rendering, not React components
- **Keep fixtures simple** — use factory functions for creating test objects
- **No snapshot tests** — they break easily and provide little value for this codebase
