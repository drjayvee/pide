import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  buildNumberedExcerpt,
  formatSelectionForContext,
  getLineCount,
  getShortPath,
  relativizePath,
  shouldAttachSelection,
  shouldShowStatus,
  type IDESelection,
} from "./index.ts";

function makeTempFile(contents: string, ext = ".ts"): string {
  const file = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "pide-test-")),
    `main${ext}`
  );
  fs.writeFileSync(file, contents);
  return file;
}

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
    "@/home/user/project/src/main.ts"
  );
});

test("formatSelectionForContext: single line still gets a line number", () => {
  assert.equal(
    formatSelectionForContext(makeSelection({ startLine: 10, endLine: 10 })),
    "@/home/user/project/src/main.ts:10"
  );
});

test("formatSelectionForContext: line range", () => {
  assert.equal(
    formatSelectionForContext(makeSelection({ startLine: 10, endLine: 15 })),
    "@/home/user/project/src/main.ts:10-15"
  );
});

test("formatSelectionForContext: strips cwd for files inside the checkout", () => {
  assert.equal(
    formatSelectionForContext(
      makeSelection({ startLine: 38, endLine: 42 }),
      "/home/user/project"
    ),
    "@src/main.ts:38-42"
  );
});

test("formatSelectionForContext: keeps full path outside the checkout", () => {
  assert.equal(
    formatSelectionForContext(makeSelection(), "/home/user/other"),
    "@/home/user/project/src/main.ts"
  );
});

test("formatSelectionForContext: cwd must not match a sibling prefix", () => {
  assert.equal(
    formatSelectionForContext(makeSelection(), "/home/user/proj"),
    "@/home/user/project/src/main.ts"
  );
});

test("relativizePath: nested file becomes relative", () => {
  assert.equal(
    relativizePath("/repo/app/javascript/foo.js", "/repo"),
    "app/javascript/foo.js"
  );
});

test("relativizePath: cwd itself is unchanged (no relative path)", () => {
  assert.equal(relativizePath("/repo", "/repo"), "/repo");
});

test("relativizePath: trailing slash on cwd still relativizes", () => {
  assert.equal(relativizePath("/repo/src/a.ts", "/repo/"), "src/a.ts");
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

test("buildNumberedExcerpt: numbers the selected lines with context", () => {
  const file = makeTempFile(
    ["a", "b", "c", "d", "e", "f", "g"].join("\n")
  );
  const excerpt = buildNumberedExcerpt(
    makeSelection({ file, startLine: 4, endLine: 4 })
  );
  assert.equal(
    excerpt,
    ["```ts", "2 | b", "3 | c", "4 | d", "5 | e", "6 | f", "```"].join("\n")
  );
});

test("buildNumberedExcerpt: clamps context at file boundaries", () => {
  const file = makeTempFile(["a", "b", "c"].join("\n"));
  const excerpt = buildNumberedExcerpt(
    makeSelection({ file, startLine: 1, endLine: 2 })
  );
  assert.equal(excerpt, ["```ts", "1 | a", "2 | b", "3 | c", "```"].join("\n"));
});

test("buildNumberedExcerpt: uses the file extension as fence language", () => {
  const file = makeTempFile("x = 1", ".py");
  const excerpt = buildNumberedExcerpt(
    makeSelection({ file, startLine: 1, endLine: 1 })
  );
  assert.ok(excerpt!.startsWith("```py\n"));
});

test("buildNumberedExcerpt: pads line numbers to the widest number", () => {
  const file = makeTempFile(
    Array.from({ length: 12 }, (_, i) => `line${i + 1}`).join("\n")
  );
  const excerpt = buildNumberedExcerpt(
    makeSelection({ file, startLine: 10, endLine: 10 })
  );
  assert.ok(excerpt!.includes("\n 8 | line8\n"));
  assert.ok(excerpt!.includes("\n10 | line10\n"));
});

test("buildNumberedExcerpt: null when there is no line info", () => {
  const file = makeTempFile("a\nb");
  assert.equal(buildNumberedExcerpt(makeSelection({ file })), null);
});

test("buildNumberedExcerpt: null when the file is unreadable", () => {
  assert.equal(
    buildNumberedExcerpt(
      makeSelection({
        file: "/nonexistent/dir/file.ts",
        startLine: 1,
        endLine: 1,
      })
    ),
    null
  );
});

test("buildNumberedExcerpt: null when startLine is past end of file", () => {
  const file = makeTempFile("a\nb");
  assert.equal(
    buildNumberedExcerpt(makeSelection({ file, startLine: 5, endLine: 5 })),
    null
  );
});

test("buildNumberedExcerpt: null when the selection is too large", () => {
  const file = makeTempFile(
    Array.from({ length: 60 }, (_, i) => `line${i + 1}`).join("\n")
  );
  assert.equal(
    buildNumberedExcerpt(makeSelection({ file, startLine: 1, endLine: 41 })),
    null
  );
});

test("formatSelectionForContext: appends the numbered excerpt after the ref", () => {
  const file = makeTempFile(["a", "b", "c", "d", "e"].join("\n"));
  const text = formatSelectionForContext(
    makeSelection({ file, startLine: 3, endLine: 3 })
  );
  const [ref, ...rest] = text.split("\n");
  assert.equal(ref, `@${file}:3`);
  assert.equal(rest.join("\n"), ["```ts", "1 | a", "2 | b", "3 | c", "4 | d", "5 | e", "```"].join("\n"));
});
