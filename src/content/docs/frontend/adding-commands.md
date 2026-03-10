---
title: Adding Commands
description: How to implement new editor commands with undo/redo support.
---

All editor mutations (adding figures, changing materials, moving objects) go through the **Command pattern** to enable undo/redo. This page explains how to create new commands.

## Command Pattern Overview

```
User action
    │
    ▼
new SomeCommand(editor, params)
    │
    ▼
editor.execute(command)
    │
    ├── command.execute()     ← applies the change
    ├── push to undo stack
    └── signal: historyChanged
```

When the user hits **Ctrl+Z**:
```
editor.undo()
    │
    ▼
command.undo()                ← reverses the change
    │
    ├── pop from undo stack
    ├── push to redo stack
    └── signal: historyChanged
```

## Command Base Class

Every command extends the base `Command` class:

```typescript
class Command {
  id: number;
  name: string;
  updatable: boolean;

  constructor(editor: YaptideEditor) {
    this.id = -1;
    this.name = '';
    this.updatable = false;
  }

  execute(): void {
    // Override: apply the change
  }

  undo(): void {
    // Override: reverse the change
  }

  toJSON(): object {
    // Override: serialize for history persistence
    return { type: this.constructor.name };
  }

  fromJSON(json: object): void {
    // Override: deserialize from history
  }
}
```

## Creating a New Command

### Step 1: Define the Command Class

```typescript
// ThreeEditor/js/commands/SetMaterialCommand.ts
import { Command } from './Command';

class SetMaterialCommand extends Command {
  private object: SimulationZone;
  private oldMaterialUuid: string;
  private newMaterialUuid: string;

  constructor(
    editor: YaptideEditor,
    object: SimulationZone,
    newMaterialUuid: string
  ) {
    super(editor);
    this.name = 'Set Material';
    this.object = object;
    this.oldMaterialUuid = object.materialUuid;
    this.newMaterialUuid = newMaterialUuid;
  }

  execute(): void {
    this.object.materialUuid = this.newMaterialUuid;
    this.editor.signals.objectChanged.dispatch(this.object);
  }

  undo(): void {
    this.object.materialUuid = this.oldMaterialUuid;
    this.editor.signals.objectChanged.dispatch(this.object);
  }

  toJSON(): object {
    return {
      type: 'SetMaterialCommand',
      objectUuid: this.object.uuid,
      oldMaterialUuid: this.oldMaterialUuid,
      newMaterialUuid: this.newMaterialUuid,
    };
  }

  fromJSON(json: any): void {
    this.object = this.editor.objectByUuid(json.objectUuid);
    this.oldMaterialUuid = json.oldMaterialUuid;
    this.newMaterialUuid = json.newMaterialUuid;
  }
}
```

### Step 2: Execute the Command

In the UI component that triggers the change:

```typescript
const handleMaterialChange = (zone: SimulationZone, materialUuid: string) => {
  editor.execute(
    new SetMaterialCommand(editor, zone, materialUuid)
  );
};
```

### Step 3: Dispatch Signals

Always dispatch the appropriate signal in `execute()` and `undo()` so the React UI updates:

| Signal | When to dispatch |
|---|---|
| `objectAdded` | New object created |
| `objectRemoved` | Object deleted |
| `objectChanged` | Object properties changed |
| `zoneGeometryChanged` | Zone boolean operations changed |
| `scoringQuantityChanged` | Scoring configuration changed |
| `sceneGraphChanged` | Scene hierarchy changed |

## Updatable Commands

Some commands should be **merged** when they occur rapidly in succession (e.g., dragging an object). Set `updatable = true`:

```typescript
class MoveObjectCommand extends Command {
  constructor(editor, object, newPosition, oldPosition) {
    super(editor);
    this.name = 'Move Object';
    this.updatable = true;  // ← merge rapid moves
    // ...
  }

  update(command: MoveObjectCommand): void {
    // Called instead of creating a new history entry
    this.newPosition = command.newPosition;
  }
}
```

When `editor.execute()` sees a command with `updatable = true` and the previous command has the same type and `id`, it calls `update()` instead of pushing a new entry. This prevents clogging the undo stack with every mouse move event.

### Existing Updatable Commands

| Command | Why Updatable |
|---|---|
| `SetPositionCommand` | Dragging objects generates many moves |
| `SetRotationCommand` | Continuous rotation via gizmo |
| `SetScaleCommand` | Continuous scaling via gizmo |
| `SetValueCommand` | Slider/input field rapid changes |

## Writing Tests for Commands

### Test Pattern

```typescript
// __tests__/commands/SetMaterialCommand.test.ts
describe('SetMaterialCommand', () => {
  let editor: YaptideEditor;

  beforeEach(() => {
    editor = new YaptideEditor();
    // Set up scene with figures, zones, materials
  });

  test('execute changes material', () => {
    const zone = editor.zoneManager.zones[0];
    const newMaterial = 'mat-002';

    editor.execute(new SetMaterialCommand(editor, zone, newMaterial));

    expect(zone.materialUuid).toBe(newMaterial);
  });

  test('undo restores original material', () => {
    const zone = editor.zoneManager.zones[0];
    const originalMaterial = zone.materialUuid;
    const newMaterial = 'mat-002';

    editor.execute(new SetMaterialCommand(editor, zone, newMaterial));
    editor.undo();

    expect(zone.materialUuid).toBe(originalMaterial);
  });

  test('redo re-applies the change', () => {
    const zone = editor.zoneManager.zones[0];
    const newMaterial = 'mat-002';

    editor.execute(new SetMaterialCommand(editor, zone, newMaterial));
    editor.undo();
    editor.redo();

    expect(zone.materialUuid).toBe(newMaterial);
  });
});
```

### Running Tests

```bash
npm test -- --testPathPattern=commands
```

## Checklist for New Commands

1. Extend `Command` base class
2. Store both **old** and **new** values in the constructor
3. Implement `execute()` — apply the change + dispatch signals
4. Implement `undo()` — reverse the change + dispatch signals
5. Implement `toJSON()` / `fromJSON()` for history serialization
6. If applicable, set `updatable = true` and implement `update()`
7. Write unit tests covering execute, undo, redo, and serialization
8. Use `editor.execute(new YourCommand(...))` — never mutate state directly
