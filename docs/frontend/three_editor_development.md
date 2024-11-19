# How to implement additional commands for undo/redo functionality?

### Basics

After evaluating different design patterns for undo/redo we decided to use the [command-pattern](http://en.wikipedia.org/wiki/Command_pattern) for implementing undo/redo functionality in the three.js-editor.

This means that every action is encapsulated in a command-object which contains all the relevant information to restore the previous state.

In our implementation we store the old and the new state separately (we don't store the complete state but rather the attribute and value which has changed).
It would also be possible to only store the difference between the old and the new state.

**Before implementing your own command you should look if you can't reuse one of the already existing ones.**

For numbers, strings or booleans the Set...ValueCommand-commands can be used.
Then there are separate commands for:

-   setting a color property (THREE.Color)
-   setting maps (THREE.Texture)
-   setting geometries
-   setting materials
-   setting position, rotation and scale

### Template for new commands

Every command needs a constructor. In the constructor

```javascript
function DoSomethingCommand(editor) {
	Command.call(this, editor); // Required: Call default constructor

	this.type = 'DoSomethingCommand'; // Required: has to match the object-name!
	this.name = 'Set/Do/Update Something'; // Required: description of the command, used in Sidebar.History

	// TODO: store all the relevant information needed to
	// restore the old and the new state
}
```

And as part of the prototype you need to implement four functions

-   **execute:** which is also used for redo
-   **undo:** which reverts the changes made by 'execute'
-   **toJSON:** which serializes the command so that the undo/redo-history can be preserved across a browser refresh
-   **fromJSON:** which deserializes the command

```javascript
DoSomethingCommand.prototype = {
	execute: function () {
		// TODO: apply changes to 'object' to reach the new state
	},

	undo: function () {
		// TODO: restore 'object' to old state
	},

	toJSON: function () {
		var output = Command.prototype.toJSON.call(this); // Required: Call 'toJSON'-method of prototype 'Command'

		// TODO: serialize all the necessary information as part of 'output' (JSON-format)
		// so that it can be restored in 'fromJSON'

		return output;
	},

	fromJSON: function (json) {
		Command.prototype.fromJSON.call(this, json); // Required: Call 'fromJSON'-method of prototype 'Command'

		// TODO: restore command from json
	}
};
```

### Executing a command

To execute a command we need an instance of the main editor-object. The editor-object functions as the only entry point through which all commands have to go to be added as part of the undo/redo-history.
On **editor** we then call **.execute(...)\*** with the new command-object which in turn calls **history.execute(...)** and adds the command to the undo-stack.

```javascript
editor.execute(new DoSomethingCommand());
```

### Updatable commands

Some commands are also **updatable**. By default a command is not updatable. Making a command updatable means that you
have to implement a fifth function 'update' as part of the prototype. In it only the 'new' state gets updated while the old one stays the same.

Here as an example is the update-function of **SetColorCommand**:

```javascript
update: function ( cmd ) {

	this.newValue = cmd.newValue;

},

```

#### List of updatable commands

-   SetColorCommand
-   SetGeometryCommand
-   SetMaterialColorCommand
-   SetMaterialValueCommand
-   SetPositionCommand
-   SetRotationCommand
-   SetScaleCommand
-   SetValueCommand
-   SetScriptValueCommand
 
The idea behind 'updatable commands' is that two commands of the same type which occur
within a short period of time should be merged into one.
**For example:** Dragging with your mouse over the x-position field in the sidebar
leads to hundreds of minor changes to the x-position.
The user expectation is not to undo every single change that happened while he dragged
the mouse cursor but rather to go back to the position before he started to drag his mouse.

When editing a script the changes are also merged into one undo-step.


# Writing unit tests for undo-redo commands

### Overview

Writing unit tests for undo/redo commands is easy.
The main idea to simulate a scene, execute actions and perform undo and redo.
Following steps are required.

1. Create a new unit test file
2. Include the new command and the unit test file in the editor's test suite
3. Write the test
4. Execute the test

Each of the listed steps will now be described in detail.

### 1. Create a new unit test file

Create a new file in path `test/unit/editor/TestDoSomethingCommand.js`.

### 2. Include the new command in the editor test suite

Navigate to the editor test suite `test/unit/unittests_editor.html` and open it.
Within the file, go to the `<!-- command object classes -->` and include the new command:

```html
//
<!-- command object classes -->
//...
<script src="../../editor/js/commands/AddScriptCommand.js"></script>
<script src="../../editor/js/commands/DoSomethingCommand.js"></script>
// add this line
<script src="../../editor/js/commands/MoveObjectCommand.js"></script>
//...
```

It is recommended to keep the script inclusions in alphabetical order, if possible.

Next, in the same file, go to `<!-- Undo-Redo tests -->` and include the test file for the new command:

```html
//
<!-- Undo-Redo tests -->
//...
<script src="editor/TestAddScriptCommand.js"></script>
<script src="editor/TestDoSomethingCommand.js"></script>
// add this line
<script src="editor/TestMoveObjectCommand.js"></script>
//...
```

Again, keeping the alphabetical order is recommended.

### 3. Write the test

#### Template

Open the unit test file `test/unit/editor/TestDoSomethingCommand.js` and paste following code:

```javascript
module('DoSomethingCommand');

test('Test DoSomethingCommand (Undo and Redo)', function () {
	var editor = new Editor();

	var box = aBox('Name your box');

	// other available objects from "CommonUtilities.js"
	// var sphere = aSphere( 'Name your sphere' );
	// var pointLight = aPointLight( 'Name your pointLight' );
	// var perspectiveCamera = aPerspectiveCamera( 'Name your perspectiveCamera' );

	// in most cases you'll need to add the object to work with
	editor.execute(new AddObjectCommand(editor, box));

	// your test begins here...
});
```

The predefined code is just meant to ease the development, you do not have to stick with it.
However, the test should cover at least one `editor.execute()`, one `editor.undo()` and one `editor.redo()` call.

Best practice is to call `editor.execute( new DoSomethingCommand( {custom parameters} ) )` **twice**. Since you'll have to do one undo (go one step back), it is recommended to have a custom state for comparison. Try to avoid assertions `ok()` against default values.

#### Assertions

After performing `editor.execute()` twice, you can do your first assertion to check whether the executes are done correctly.

Next, you perform `editor.undo()` and check if the last action was undone.

Finally, perform `editor.redo()` and verify if the values are as expected.

### 4. Execute the test

Open the editor's unit test suite `test/unit/unittests_editor.html` in your browser and check the results from the test framework.
