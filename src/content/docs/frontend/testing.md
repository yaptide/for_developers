---
title: Frontend Testing
description: Testing strategy and patterns for the YAPTIDE frontend.
---

The frontend uses **Jest** with **React Testing Library** for unit and component tests.

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
├── ThreeEditor/
│   └── __tests__/          # Editor-specific tests (co-located)
└── setupTests.ts           # Global test setup
```

## Test Setup

`setupTests.ts` configures the test environment:

```typescript
import '@testing-library/jest-dom';

// Mock Web Workers (not available in jsdom)
// Mock Pyodide, Geant4 Wasm, etc.
```

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

## Testing React Components

Use React Testing Library for component tests:

```typescript
import { render, screen, fireEvent } from '@testing-library/react';

describe('LoginPanel', () => {
  test('shows error on invalid credentials', async () => {
    render(<LoginPanel />);

    fireEvent.change(screen.getByLabelText('Username'), {
      target: { value: 'wrong' }
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'wrong' }
    });
    fireEvent.click(screen.getByText('Log in'));

    expect(await screen.findByText(/invalid/i)).toBeInTheDocument();
  });
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

- **Test behavior, not implementation** — use `screen.getByText()` over component internals
- **Test commands thoroughly** — they are the backbone of editor state management
- **Mock at boundaries** — mock Web Workers, APIs, and Three.js rendering, not React components
- **Keep fixtures simple** — use factory functions for creating test objects
- **No snapshot tests** — they break easily and provide little value for this codebase
