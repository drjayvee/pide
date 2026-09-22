import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatSelectionForContext,
  getLineCount,
  getShortPath,
  shouldAttachSelection,
  type IDESelection,
} from "./index.ts";

function makeSelection(overrides: Partial<IDESelection> = {}): IDESelection {
  return {
    file: "/home/user/project/src/main.ts",
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
  assert.equal(getLineCount(makeSelection()), 0);
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
