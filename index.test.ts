import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatSelectionForContext,
  getLineCount,
  getShortPath,
  shouldAttachSelection,
  shouldShowStatus,
  type IDESelection,
} from "./index.ts";

function makeSelection(overrides: Partial<IDESelection> = {}): IDESelection {
  return {
    file: "/home/user/project/src/main.ts",
    selection: "const x = 1;",
    timestamp: 1000,
    ...overrides,
  };
}

test("formatSelectionForContext: file only", () => {
  assert.equal(
    formatSelectionForContext(makeSelection()),
    "Referencing /home/user/project/src/main.ts"
  );
});

test("formatSelectionForContext: single line", () => {
  assert.equal(
    formatSelectionForContext(makeSelection({ startLine: 10, endLine: 10 })),
    "Referencing /home/user/project/src/main.ts:10"
  );
});

test("formatSelectionForContext: line range", () => {
  assert.equal(
    formatSelectionForContext(makeSelection({ startLine: 10, endLine: 15 })),
    "Referencing /home/user/project/src/main.ts:10-15"
  );
});

test("getLineCount: from start/end lines", () => {
  assert.equal(getLineCount(makeSelection({ startLine: 10, endLine: 15 })), 6);
});

test("getLineCount: from selection text", () => {
  assert.equal(getLineCount(makeSelection({ selection: "a\nb\nc" })), 3);
});

test("getLineCount: no selection info", () => {
  assert.equal(getLineCount(makeSelection({ selection: undefined })), 0);
});

test("getShortPath: short path unchanged", () => {
  assert.equal(getShortPath("src/main.ts", 40), "src/main.ts");
});

test("getShortPath: long path collapses to .../parent/file", () => {
  assert.equal(
    getShortPath("/very/long/path/to/some/project/src/main.ts", 30),
    ".../src/main.ts"
  );
});

test("getShortPath: very long path collapses to .../file", () => {
  assert.equal(
    getShortPath("/very/long/path/with/a/rather/long/parent-dir-name/main.ts", 20),
    ".../main.ts"
  );
});

test("shouldAttachSelection: null selection never attaches", () => {
  assert.equal(shouldAttachSelection(null, null), false);
  assert.equal(shouldAttachSelection(null, 1000), false);
});

test("shouldAttachSelection: open file without selected text never attaches", () => {
  // IDE plugins write the file on cursor moves too, with no selection fields
  const cursorOnly = makeSelection({ timestamp: 1000, selection: undefined });
  assert.equal(shouldAttachSelection(cursorOnly, null), false);

  const whitespaceOnly = makeSelection({ timestamp: 2000, selection: "  \n\t " });
  assert.equal(shouldAttachSelection(whitespaceOnly, null), false);
});

test("shouldAttachSelection: fresh selection attaches once", () => {
  const selection = makeSelection({ timestamp: 1000 });

  // First prompt: attach
  assert.equal(shouldAttachSelection(selection, null), true);
  const lastAttached = selection.timestamp;

  // Subsequent prompts with the same selection: skip
  assert.equal(shouldAttachSelection(selection, lastAttached), false);
  assert.equal(shouldAttachSelection(selection, lastAttached), false);
});

test("shouldAttachSelection: new selection (new timestamp) attaches again", () => {
  const first = makeSelection({ timestamp: 1000 });
  assert.equal(shouldAttachSelection(first, null), true);

  // User makes a new selection in the IDE -> timestamp bumps
  const second = makeSelection({ timestamp: 2000 });
  assert.equal(shouldAttachSelection(second, first.timestamp), true);

  // And that one is also one-shot
  assert.equal(shouldAttachSelection(second, second.timestamp), false);
});

test("shouldShowStatus: hidden with no selection at all", () => {
  assert.equal(shouldShowStatus(null, null, "manual"), false);
  assert.equal(shouldShowStatus(null, null, "auto-prompt"), false);
});

test("shouldShowStatus: manual mode always shows the current file/selection", () => {
  const cursorOnly = makeSelection({ selection: undefined });
  assert.equal(shouldShowStatus(cursorOnly, null, "manual"), true);

  const attached = makeSelection({ timestamp: 1000 });
  assert.equal(shouldShowStatus(attached, attached.timestamp, "manual"), true);
});

test("shouldShowStatus: auto-prompt mode hides when nothing will be attached", () => {
  // Cursor move without selected text -> hidden
  const cursorOnly = makeSelection({ timestamp: 1000, selection: undefined });
  assert.equal(shouldShowStatus(cursorOnly, null, "auto-prompt"), false);

  // Pending selection -> shown
  const pending = makeSelection({ timestamp: 2000 });
  assert.equal(shouldShowStatus(pending, null, "auto-prompt"), true);

  // Already attached -> hidden again
  assert.equal(shouldShowStatus(pending, pending.timestamp, "auto-prompt"), false);
});
