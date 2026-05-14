export function buildUnifiedDiff(beforeText, afterText) {
  return createDiffHunks(annotateInlineChanges(diffLineOperations(beforeText, afterText)), 3);
}

function diffLineOperations(beforeText, afterText) {
  const before = String(beforeText || "").split("\n");
  const after = String(afterText || "").split("\n");
  const table = Array.from({ length: before.length + 1 }, () => Array(after.length + 1).fill(0));

  for (let oldIndex = before.length - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = after.length - 1; newIndex >= 0; newIndex -= 1) {
      table[oldIndex][newIndex] =
        before[oldIndex] === after[newIndex]
          ? table[oldIndex + 1][newIndex + 1] + 1
          : Math.max(table[oldIndex + 1][newIndex], table[oldIndex][newIndex + 1]);
    }
  }

  const ops = [];
  let oldIndex = 0;
  let newIndex = 0;

  while (oldIndex < before.length || newIndex < after.length) {
    if (oldIndex < before.length && newIndex < after.length && before[oldIndex] === after[newIndex]) {
      ops.push({
        type: "context",
        text: before[oldIndex],
        oldLine: oldIndex + 1,
        newLine: newIndex + 1
      });
      oldIndex += 1;
      newIndex += 1;
    } else if (newIndex < after.length && (oldIndex >= before.length || table[oldIndex][newIndex + 1] > table[oldIndex + 1][newIndex])) {
      ops.push({
        type: "add",
        text: after[newIndex],
        oldLine: null,
        newLine: newIndex + 1
      });
      newIndex += 1;
    } else {
      ops.push({
        type: "remove",
        text: before[oldIndex],
        oldLine: oldIndex + 1,
        newLine: null
      });
      oldIndex += 1;
    }
  }

  return ops;
}

function annotateInlineChanges(ops) {
  const annotated = ops.map((op) => ({ ...op }));
  let index = 0;

  while (index < annotated.length) {
    if (annotated[index]?.type !== "remove") {
      index += 1;
      continue;
    }

    const removeStart = index;
    while (annotated[index]?.type === "remove") index += 1;
    const addStart = index;
    while (annotated[index]?.type === "add") index += 1;

    const removed = annotated.slice(removeStart, addStart);
    const added = annotated.slice(addStart, index);
    const pairs = Math.min(removed.length, added.length);

    for (let offset = 0; offset < pairs; offset += 1) {
      const [oldFragments, newFragments] = diffInlineFragments(removed[offset].text, added[offset].text);
      removed[offset].fragments = oldFragments;
      added[offset].fragments = newFragments;
    }
  }

  return annotated;
}

function diffInlineFragments(beforeText, afterText) {
  const before = String(beforeText || "");
  const after = String(afterText || "");
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix += 1;

  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const makeFragments = (text) => {
    const changedEnd = suffix ? text.length - suffix : text.length;
    return [
      { text: text.slice(0, prefix), changed: false },
      { text: text.slice(prefix, changedEnd), changed: true },
      { text: suffix ? text.slice(text.length - suffix) : "", changed: false }
    ].filter((fragment) => fragment.text.length > 0);
  };

  return [makeFragments(before), makeFragments(after)];
}

function createDiffHunks(ops, contextSize) {
  const changedIndexes = ops
    .map((op, index) => (op.type === "add" || op.type === "remove" ? index : -1))
    .filter((index) => index >= 0);

  if (!changedIndexes.length) return [makeHunkHeader(ops, 0, ops.length - 1), ...ops];

  const ranges = [];
  changedIndexes.forEach((index) => {
    const start = Math.max(0, index - contextSize);
    const end = Math.min(ops.length - 1, index + contextSize);
    const last = ranges[ranges.length - 1];
    if (last && start <= last.end + 1) {
      last.end = Math.max(last.end, end);
    } else {
      ranges.push({ start, end });
    }
  });

  const rows = [];
  ranges.forEach((range) => {
    rows.push(makeHunkHeader(ops, range.start, range.end));
    rows.push(...ops.slice(range.start, range.end + 1));
  });

  return rows;
}

function makeHunkHeader(ops, start, end) {
  const slice = ops.slice(start, end + 1);
  const oldLines = slice.filter((op) => op.oldLine).map((op) => op.oldLine);
  const newLines = slice.filter((op) => op.newLine).map((op) => op.newLine);
  const oldStart = oldLines[0] || 0;
  const newStart = newLines[0] || 0;
  const oldCount = oldLines.length || 0;
  const newCount = newLines.length || 0;

  return {
    type: "hunk",
    text: `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`
  };
}
