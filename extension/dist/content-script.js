(() => {
  // extension/src/js/config.js
  var ROOT_SELECTOR = "[data-coderoot-root]";
  var SUPPORTED_TAB = "introduction";
  var ROUTE_CHECK_MS = 700;
  var INSERT_RETRY_MS = 120;
  var CONTENT_DIR = "content";
  var GITHUB_OWNER = "kommiter";
  var GITHUB_REPO = "coderoot";
  var GITHUB_DEFAULT_BRANCH = "main";
  var CODEROOT_API_BASE = "";
  var REMOTE_CONTENT_URL_BASE = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_DEFAULT_BRANCH}/content/`;
  var GITHUB_CONTENT_URL_BASE = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/blob/${GITHUB_DEFAULT_BRANCH}/`;
  var DEFAULT_CONCEPT_LANGUAGE = "C++14";
  var CONCEPT_LANGUAGE_PATTERNS = [
    { key: "javascript", label: "JavaScript", pattern: /\bjavascript\b/i },
    { key: "python3", label: "Python3", pattern: /\bpython\s*3\b/i },
    { key: "cpp14", label: "C++14", pattern: /\bc\+\+\s*14\b/i },
    { key: "csharp", label: "C#", pattern: /\bc#\b/i },
    { key: "java", label: "Java", pattern: /\bjava\b/i },
    { key: "c", label: "C", pattern: /^c$/i }
  ];

  // extension/src/js/utils/diff.js
  function buildUnifiedDiff(beforeText, afterText) {
    return createDiffHunks(annotateInlineChanges(diffLineOperations(beforeText, afterText)), 3);
  }
  function diffLineOperations(beforeText, afterText) {
    const before = String(beforeText || "").split("\n");
    const after = String(afterText || "").split("\n");
    const table = Array.from({ length: before.length + 1 }, () => Array(after.length + 1).fill(0));
    for (let oldIndex2 = before.length - 1; oldIndex2 >= 0; oldIndex2 -= 1) {
      for (let newIndex2 = after.length - 1; newIndex2 >= 0; newIndex2 -= 1) {
        table[oldIndex2][newIndex2] = before[oldIndex2] === after[newIndex2] ? table[oldIndex2 + 1][newIndex2 + 1] + 1 : Math.max(table[oldIndex2 + 1][newIndex2], table[oldIndex2][newIndex2 + 1]);
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
    while (suffix < before.length - prefix && suffix < after.length - prefix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) {
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
    const changedIndexes = ops.map((op, index) => op.type === "add" || op.type === "remove" ? index : -1).filter((index) => index >= 0);
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

  // extension/src/js/utils/text.js
  function normalizeText(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }
  function escapeRegExp(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  function escapeHtml(text) {
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function escapeXml(text) {
    return escapeHtml(text);
  }

  // extension/src/js/xml/coderoot-xml.js
  function parseProblemXml(xmlText, route, xmlPath) {
    const doc = new DOMParser().parseFromString(xmlText, "application/xml");
    const parseError = doc.querySelector("parsererror");
    if (parseError) {
      throw createXmlParseError(xmlText, route, xmlPath, parseError);
    }
    const root = doc.documentElement;
    if (!root || root.tagName !== "coderoot") {
      throw new Error(`${xmlPath} must use <coderoot> as its root element.`);
    }
    const content = firstElement(root, "content");
    if (!content) {
      throw new Error(`${xmlPath} must include a <content> element.`);
    }
    const titleNode = firstElement(root, "meta > title") || firstElement(root, "title");
    const badgeNode = firstElement(root, "meta > badge");
    const metaRanges = findMetaFieldRanges(xmlText);
    const contentChildren = Array.from(content.children);
    const ranges = findContentBlockRanges(xmlText);
    const blocks = contentChildren.map((node, index) => {
      const block = parseBlockNode(node);
      if (!block) return null;
      block.sourceKey = `content-${index}`;
      block.sourceIndex = index;
      block.sourceRange = ranges[index] || null;
      return block;
    }).filter(Boolean);
    if (!blocks.length) {
      throw new Error(`${xmlPath} does not contain renderable content.`);
    }
    const language = root.getAttribute("lang") || route.language;
    return {
      language,
      title: textOf(titleNode) || "Coderoot Deep Dive",
      titleRange: metaRanges.title || null,
      badge: normalizeBadgeText(textOf(badgeNode), language, route),
      badgeRange: metaRanges.badge || null,
      sourcePath: xmlPath,
      blocks
    };
  }
  function createXmlParseError(xmlText, route, xmlPath, parseError) {
    const rawMessage = normalizeXmlParserMessage(parseError.textContent || "");
    const location = extractXmlErrorLocation(rawMessage);
    const fallbackLine = Math.min(Math.max(1, location.line || 1), Math.max(1, String(xmlText || "").split("\n").length));
    const line = fallbackLine;
    const column = location.column || null;
    const where = route.language === "en" ? `line ${line}${column ? `, column ${column}` : ""}` : `${line}\uBC88\uC9F8 \uC904${column ? `, ${column}\uBC88\uC9F8 \uCE78` : ""}`;
    const message = route.language === "en" ? `XML syntax error at ${where}: ${rawMessage || `Check ${xmlPath}.`}` : `XML \uBB38\uBC95 \uC624\uB958: ${where}. ${rawMessage || `${xmlPath}\uB97C \uD655\uC778\uD558\uC138\uC694.`}`;
    const error = new Error(message);
    error.line = line;
    error.column = column;
    return error;
  }
  function normalizeXmlParserMessage(message) {
    const text = normalizeText(message).replace(/^This page contains the following errors:\s*/i, "").replace(/\s*Below is a rendering of the page up to the first error\.\s*$/i, "");
    return text || "";
  }
  function extractXmlErrorLocation(message) {
    const explicit = /line\s+(\d+)\s+(?:at\s+)?column\s+(\d+)/i.exec(message);
    if (explicit) return { line: Number(explicit[1]), column: Number(explicit[2]) };
    const compact = /(?:line|줄)\D*(\d+)\D+(?:column|칸|열)\D*(\d+)/i.exec(message);
    if (compact) return { line: Number(compact[1]), column: Number(compact[2]) };
    const pair = /(\d+)\s*:\s*(\d+)/.exec(message);
    if (pair) return { line: Number(pair[1]), column: Number(pair[2]) };
    return { line: 1, column: null };
  }
  function defaultBadgeText(language, route) {
    return language === "en" ? `${route.conceptLanguage} deep dive` : `${route.conceptLanguage} \uC2EC\uD654 \uB178\uD2B8`;
  }
  function normalizeBadgeText(text, language, route) {
    const trimmed = normalizeText(text);
    if (!trimmed) return defaultBadgeText(language, route);
    const oldSupportOnlyText = /^(C\+\+\s*14\s*)?(내용만 지원합니다|content only)$/i;
    if (oldSupportOnlyText.test(trimmed)) return defaultBadgeText(language, route);
    return trimmed;
  }
  function firstElement(root, selector) {
    return root.querySelector(selector);
  }
  function textOf(node) {
    return normalizeText(node?.textContent || "");
  }
  function parseBlockNode(node) {
    const tag = node.tagName.toLowerCase();
    if (tag === "h2" || tag === "h3" || tag === "h4") {
      return {
        type: "heading",
        level: Number(tag.slice(1)),
        text: textOf(node)
      };
    }
    if (tag === "ul" || tag === "ol") {
      return {
        type: "list",
        ordered: tag === "ol",
        items: Array.from(node.children).filter((child) => child.tagName.toLowerCase() === "li").map((item) => parseInlineNodes(item))
      };
    }
    if (tag === "code-block" || tag === "pre") {
      return {
        type: "code",
        language: node.getAttribute("language") || node.getAttribute("lang") || "",
        code: trimCodeBlock(node.textContent || "")
      };
    }
    if (tag === "callout" || tag === "note") {
      return {
        type: "callout",
        tone: node.getAttribute("tone") || "default",
        children: parseInlineNodes(node)
      };
    }
    if (tag === "p") {
      return {
        type: "paragraph",
        children: parseInlineNodes(node)
      };
    }
    return {
      type: "paragraph",
      children: parseInlineNodes(node)
    };
  }
  function parseInlineNodes(node) {
    return Array.from(node.childNodes).map((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        return child.textContent || "";
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return "";
      const tag = child.tagName.toLowerCase();
      if (tag === "code") return { type: "code", text: child.textContent || "" };
      if (tag === "strong" || tag === "b") return { type: "strong", children: parseInlineNodes(child) };
      if (tag === "em" || tag === "i") return { type: "em", children: parseInlineNodes(child) };
      if (tag === "br") return { type: "br" };
      if (tag === "link" || tag === "a") {
        return {
          type: "link",
          href: child.getAttribute("href") || "",
          children: parseInlineNodes(child)
        };
      }
      return child.textContent || "";
    }).filter((child) => child !== "");
  }
  function trimCodeBlock(code) {
    return String(code).replace(/^\n/, "").replace(/\n\s*$/, "\n");
  }
  function findMetaFieldRanges(xmlText) {
    const source = String(xmlText || "");
    const metaOpen = /<meta\b[^>]*>/i.exec(source);
    if (!metaOpen) return {};
    const metaStart = metaOpen.index;
    const metaEnd = findElementEnd(source, metaStart, "meta", source.length);
    return {
      badge: findChildElementRange(source, metaOpen.index + metaOpen[0].length, metaEnd, "badge", "meta-badge"),
      title: findChildElementRange(source, metaOpen.index + metaOpen[0].length, metaEnd, "title", "meta-title")
    };
  }
  function findChildElementRange(source, start, limit, tagName, sourceKey) {
    const pattern = new RegExp(`<${escapeRegExp(tagName)}\\b`, "i");
    const match = pattern.exec(source.slice(start, limit));
    if (!match) return null;
    const openIndex = start + match.index;
    const elementEnd = findElementEnd(source, openIndex, tagName, limit);
    return {
      endLine: lineNumberAt(source, elementEnd),
      sourceKey,
      startLine: lineNumberAt(source, openIndex),
      tagName
    };
  }
  function findContentBlockRanges(xmlText) {
    const source = String(xmlText || "");
    const contentOpen = /<content\b[^>]*>/i.exec(source);
    if (!contentOpen) return [];
    const bodyStart = contentOpen.index + contentOpen[0].length;
    const bodyEnd = source.indexOf("</content>", bodyStart);
    const limit = bodyEnd === -1 ? source.length : bodyEnd;
    const ranges = [];
    let cursor = bodyStart;
    while (cursor < limit) {
      const openIndex = source.indexOf("<", cursor);
      if (openIndex === -1 || openIndex >= limit) break;
      if (source.startsWith("</", openIndex)) break;
      if (source.startsWith("<!--", openIndex)) {
        cursor = skipUntil(source, openIndex, "-->", limit);
        continue;
      }
      if (source.startsWith("<![CDATA[", openIndex)) {
        cursor = skipUntil(source, openIndex, "]]>", limit);
        continue;
      }
      if (source.startsWith("<?", openIndex) || source.startsWith("<!", openIndex)) {
        cursor = findTagEnd(source, openIndex, limit);
        continue;
      }
      const match = /^<([\w:-]+)\b/i.exec(source.slice(openIndex));
      if (!match) {
        cursor = openIndex + 1;
        continue;
      }
      const tagName = match[1].toLowerCase();
      const elementEnd = findElementEnd(source, openIndex, tagName, limit);
      ranges.push({
        endLine: lineNumberAt(source, elementEnd),
        sourceIndex: ranges.length,
        startLine: lineNumberAt(source, openIndex),
        tagName
      });
      cursor = Math.max(elementEnd, openIndex + 1);
    }
    return ranges;
  }
  function findElementEnd(source, openIndex, tagName, limit) {
    const firstOpenEnd = findTagEnd(source, openIndex, limit);
    if (source.slice(openIndex, firstOpenEnd).replace(/\s+$/g, "").endsWith("/>")) return firstOpenEnd;
    let depth = 1;
    let cursor = firstOpenEnd;
    while (cursor < limit) {
      const nextOpen = source.indexOf("<", cursor);
      if (nextOpen === -1 || nextOpen >= limit) return firstOpenEnd;
      if (source.startsWith("<!--", nextOpen)) {
        cursor = skipUntil(source, nextOpen, "-->", limit);
        continue;
      }
      if (source.startsWith("<![CDATA[", nextOpen)) {
        cursor = skipUntil(source, nextOpen, "]]>", limit);
        continue;
      }
      const closing = new RegExp(`^<\\/${escapeRegExp(tagName)}\\s*>`, "i").exec(source.slice(nextOpen));
      if (closing) {
        depth -= 1;
        const closeEnd = nextOpen + closing[0].length;
        if (depth === 0) return closeEnd;
        cursor = closeEnd;
        continue;
      }
      const opening = new RegExp(`^<${escapeRegExp(tagName)}\\b`, "i").exec(source.slice(nextOpen));
      if (opening) {
        const openEnd = findTagEnd(source, nextOpen, limit);
        if (!source.slice(nextOpen, openEnd).replace(/\s+$/g, "").endsWith("/>")) depth += 1;
        cursor = openEnd;
        continue;
      }
      cursor = nextOpen + 1;
    }
    return firstOpenEnd;
  }
  function findTagEnd(source, openIndex, limit = source.length) {
    let quote = "";
    for (let index = openIndex; index < limit; index += 1) {
      const char = source[index];
      if (quote) {
        if (char === quote) quote = "";
        continue;
      }
      if (char === '"' || char === "'") {
        quote = char;
        continue;
      }
      if (char === ">") return index + 1;
    }
    return Math.min(openIndex + 1, limit);
  }
  function skipUntil(source, start, token, limit) {
    const end = source.indexOf(token, start + token.length);
    return end === -1 ? limit : Math.min(end + token.length, limit);
  }
  function lineNumberAt(source, index) {
    return source.slice(0, Math.max(0, index)).split("\n").length;
  }
  function isLineInSourceRange(line, range) {
    return Boolean(range && line >= range.startLine && line <= range.endLine);
  }
  function formatCoderootXml(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, "application/xml");
    if (doc.querySelector("parsererror") || doc.documentElement?.tagName !== "coderoot") return xmlText;
    return `<?xml version="1.0" encoding="UTF-8"?>
${formatXmlElement(doc.documentElement, 0)}
`;
  }
  function isXmlFormattedForSave(xmlText, formattedXml) {
    return normalizeXmlForLint(xmlText) === normalizeXmlForLint(formattedXml);
  }
  function normalizeXmlForLint(xmlText) {
    return String(xmlText || "").replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").trimEnd();
  }
  function formatXmlElement(element, depth) {
    const indent = "  ".repeat(depth);
    const tagName = element.tagName;
    const attrs = Array.from(element.attributes).map((attr) => ` ${attr.name}="${escapeXmlAttribute(attr.value)}"`).join("");
    if (isInlineXmlElement(element)) {
      return `${indent}<${tagName}${attrs}>${serializeInlineXmlChildren(element)}</${tagName}>`;
    }
    if (tagName.toLowerCase() === "code-block") {
      const code = Array.from(element.childNodes).map((child) => child.textContent || "").join("");
      const normalized = trimCodeBlock(code);
      return `${indent}<${tagName}${attrs}><![CDATA[${normalized}${normalized.endsWith("\n") ? "" : "\n"}]]></${tagName}>`;
    }
    const children = Array.from(element.childNodes).map((child) => formatXmlNode(child, depth + 1)).filter(Boolean);
    if (!children.length) return `${indent}<${tagName}${attrs}></${tagName}>`;
    return `${indent}<${tagName}${attrs}>
${children.join("\n")}
${indent}</${tagName}>`;
  }
  function formatXmlNode(node, depth) {
    if (node.nodeType === Node.ELEMENT_NODE) return formatXmlElement(node, depth);
    if (node.nodeType === Node.CDATA_SECTION_NODE) return `${"  ".repeat(depth)}<![CDATA[${node.textContent || ""}]]>`;
    if (node.nodeType === Node.COMMENT_NODE) return `${"  ".repeat(depth)}<!--${node.textContent || ""}-->`;
    if (!(node.textContent || "").trim()) return "";
    const text = normalizeInlineXmlText(node.textContent || "");
    return text ? `${"  ".repeat(depth)}${escapeXml(text)}` : "";
  }
  function isInlineXmlElement(element) {
    const tagName = element.tagName.toLowerCase();
    if (tagName === "code-block") return false;
    if (tagName === "content" || tagName === "coderoot" || tagName === "meta" || tagName === "ul" || tagName === "ol") return false;
    return !Array.from(element.children).some((child) => !["code", "strong", "b", "em", "i", "br", "link", "a"].includes(child.tagName.toLowerCase()));
  }
  function serializeInlineXmlChildren(element) {
    return Array.from(element.childNodes).map(serializeInlineXmlNode).join("").trim();
  }
  function serializeInlineXmlNode(node) {
    if (node.nodeType === Node.TEXT_NODE) return escapeXml(normalizeInlineXmlText(node.textContent || ""));
    if (node.nodeType === Node.CDATA_SECTION_NODE) return `<![CDATA[${node.textContent || ""}]]>`;
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const tagName = node.tagName;
    const attrs = Array.from(node.attributes).map((attr) => ` ${attr.name}="${escapeXmlAttribute(attr.value)}"`).join("");
    if (tagName.toLowerCase() === "br") return `<${tagName}${attrs}/>`;
    return `<${tagName}${attrs}>${serializeInlineXmlChildren(node)}</${tagName}>`;
  }
  function normalizeInlineXmlText(text) {
    return String(text).replace(/\s+/g, " ");
  }
  function escapeXmlAttribute(text) {
    return escapeXml(text).replace(/'/g, "&apos;");
  }
  function highlightXml(xmlText, activeLine = 1, scopeBlock = null, editorError = null) {
    const state = { inCdata: false, inComment: false };
    return String(xmlText).split("\n").map((lineText, index) => {
      const line = index + 1;
      const classNames = ["coderoot-editor-line"];
      if (isLineInSourceRange(line, scopeBlock?.sourceRange)) classNames.push("coderoot-editor-line-scope");
      if (line === editorError?.line) classNames.push("coderoot-editor-line-error");
      if (line === activeLine) classNames.push("coderoot-editor-line-active");
      const className = classNames.join(" ");
      const title = line === editorError?.line ? ` title="${escapeHtml(editorError.message)}"` : "";
      return `<span class="${className}"${title}>${highlightXmlLine(lineText, state)}</span>`;
    }).join("");
  }
  function highlightXmlLine(lineText, state) {
    let output = "";
    let index = 0;
    const line = String(lineText);
    while (index < line.length) {
      if (state.inCdata) {
        const end = line.indexOf("]]>", index);
        const nextIndex = end === -1 ? line.length : end + 3;
        output += `<span class="coderoot-xml-cdata">${escapeHtml(line.slice(index, nextIndex))}</span>`;
        state.inCdata = end === -1;
        index = nextIndex;
        continue;
      }
      if (state.inComment) {
        const end = line.indexOf("-->", index);
        const nextIndex = end === -1 ? line.length : end + 3;
        output += `<span class="coderoot-xml-comment">${escapeHtml(line.slice(index, nextIndex))}</span>`;
        state.inComment = end === -1;
        index = nextIndex;
        continue;
      }
      const cdataStart = line.indexOf("<![CDATA[", index);
      const commentStart = line.indexOf("<!--", index);
      const nextSpecial = minPositive(cdataStart, commentStart);
      if (nextSpecial === -1) {
        output += highlightNormalXmlSegment(line.slice(index));
        break;
      }
      output += highlightNormalXmlSegment(line.slice(index, nextSpecial));
      if (nextSpecial === cdataStart) {
        state.inCdata = true;
      } else {
        state.inComment = true;
      }
      index = nextSpecial;
    }
    return output;
  }
  function minPositive(...values) {
    return values.filter((value) => value >= 0).sort((a, b) => a - b)[0] ?? -1;
  }
  function highlightNormalXmlSegment(segment) {
    return escapeHtml(segment).replace(/(&lt;\??\/?)([\w:-]+)([^<>]*?)(\??\/?&gt;)/g, (_match, open, name, attrs, close) => {
      const highlightedAttrs = attrs.replace(
        /([\w:-]+)(=)(&quot;.*?&quot;|'.*?')/g,
        '<span class="coderoot-xml-attr">$1</span>$2<span class="coderoot-xml-string">$3</span>'
      );
      return `<span class="coderoot-xml-tag">${open}${name}</span>${highlightedAttrs}<span class="coderoot-xml-tag">${close}</span>`;
    });
  }
  function createXmlTemplate(route) {
    if (route.language === "en") {
      return `<?xml version="1.0" encoding="UTF-8"?>
<coderoot version="1" lang="en">
  <meta>
    <title>Advanced Note Title</title>
    <badge>${escapeXml(defaultBadgeText("en", route))}</badge>
  </meta>
  <content>
    <p>Start with what the original lesson leaves implicit, then explain the deeper C++14 idea in plain language.</p>

    <h3>Core idea</h3>
    <p>Use <code>inline code</code> for short syntax and a code block for complete examples.</p>

    <code-block language="cpp"><![CDATA[#include <iostream>
using namespace std;

int main() {
    cout << "example\\n";
    return 0;
}
]]></code-block>

    <callout tone="summary">End with the practical rule a learner should remember.</callout>
  </content>
</coderoot>
`;
    }
    return `<?xml version="1.0" encoding="UTF-8"?>
<coderoot version="1" lang="ko">
  <meta>
    <title>\uC2EC\uD654 \uC124\uBA85 \uC81C\uBAA9</title>
    <badge>${escapeXml(defaultBadgeText("ko", route))}</badge>
  </meta>
  <content>
    <p>\uAE30\uC874 \uC124\uBA85\uC5D0\uC11C \uC0DD\uB7B5\uB41C \uBC30\uACBD\uC744 \uBA3C\uC800 \uC9DA\uACE0, C++14 \uAD00\uC810\uC758 \uC6D0\uB9AC\uB97C \uC26C\uC6B4 \uBB38\uC7A5\uC73C\uB85C \uD480\uC5B4 \uC8FC\uC138\uC694.</p>

    <h3>\uD575\uC2EC \uC544\uC774\uB514\uC5B4</h3>
    <p>\uC9E7\uC740 \uBB38\uBC95\uC740 <code>inline code</code>\uB85C \uC4F0\uACE0, \uC644\uC131\uB41C \uC608\uC2DC\uB294 code-block\uC5D0 \uB123\uC2B5\uB2C8\uB2E4.</p>

    <code-block language="cpp"><![CDATA[#include <iostream>
using namespace std;

int main() {
    cout << "example\\n";
    return 0;
}
]]></code-block>

    <callout tone="summary">\uB9C8\uC9C0\uB9C9\uC5D0\uB294 \uD559\uC2B5\uC790\uAC00 \uAE30\uC5B5\uD574\uC57C \uD560 \uC2E4\uC804 \uAE30\uC900\uC744 \uC815\uB9AC\uD569\uB2C8\uB2E4.</callout>
  </content>
</coderoot>
`;
  }

  // extension/src/js/coderoot.js
  (() => {
    const disableWatchers = document.documentElement?.dataset?.coderootDisableWatch === "true";
    const contentCache = /* @__PURE__ */ new Map();
    let applyTimer = 0;
    let lastRouteKey = "";
    let activeOriginalEditorPanel = null;
    let activeInsertedDivider = null;
    let activeEditorCancel = null;
    let activeEditRouteKey = "";
    let originalFaviconLinks = null;
    function getCurrentUrl() {
      const testUrl = document.documentElement?.dataset?.coderootTestUrl;
      return testUrl || globalThis.location?.href || "";
    }
    function isCodetreeHost(url) {
      const isTest = Boolean(document.documentElement?.dataset?.coderootTestUrl);
      return isTest || url.hostname === "codetree.ai" || url.hostname === "www.codetree.ai";
    }
    function parseRoute() {
      let url;
      try {
        url = new URL(getCurrentUrl(), globalThis.location?.origin || "https://www.codetree.ai");
      } catch {
        return null;
      }
      if (!isCodetreeHost(url)) return null;
      const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
      let language = "ko";
      let offset = 0;
      if (parts[0] === "ko" || parts[0] === "en") {
        language = parts[0];
        offset = 1;
      }
      const isCuratedCard = parts[offset] === "trails" && parts[offset + 1] === "complete" && parts[offset + 2] === "curated-cards";
      if (!isCuratedCard) return null;
      const slug = parts[offset + 3];
      const tab = parts[offset + 4];
      if (!slug || tab !== SUPPORTED_TAB) return null;
      return withConceptLanguage({
        language,
        slug,
        tab,
        kind: getRouteKind(slug),
        canonicalBasePath: `/${language}/trails/complete/curated-cards/${slug}/${tab}`
      }, DEFAULT_CONCEPT_LANGUAGE);
    }
    function getRouteKind(slug) {
      if (slug.startsWith("intro-")) return "intro";
      if (slug.startsWith("challenge-")) return "challenge";
      if (slug.startsWith("test-")) return "test";
      return "unknown";
    }
    function routeKey(route) {
      return route ? route.canonicalPath : "";
    }
    function scheduleApply(delay = INSERT_RETRY_MS) {
      clearTimeout(applyTimer);
      applyTimer = window.setTimeout(applyCoderoot, delay);
    }
    function removeStaleRoots(activeKey) {
      document.querySelectorAll(ROOT_SELECTOR).forEach((root) => {
        if (root.dataset.coderootKey === activeKey) return;
        const article = root.closest("article");
        root.remove();
        clearArticleState(article);
      });
    }
    function clearArticleState(article) {
      if (!article) return;
      delete article.dataset.coderootExpanded;
      delete article.dataset.coderootEditing;
      article.style.removeProperty("--coderoot-gradient-top");
      article.classList.remove("coderoot-article");
      const card = article.closest(".coderoot-card-expanded");
      card?.classList.remove("coderoot-card-expanded");
    }
    async function applyCoderoot() {
      const baseRoute = parseRoute();
      if (!baseRoute) {
        if (activeEditRouteKey) cancelActiveEditSession();
        removeStaleRoots("");
        lastRouteKey = "";
        return;
      }
      const targets = findContentTargets(baseRoute);
      if (!targets) {
        scheduleApply(INSERT_RETRY_MS * 2);
        return;
      }
      const route = withDetectedConceptLanguage(baseRoute, targets.contentRoot);
      const key = routeKey(route);
      if (activeEditRouteKey && activeEditRouteKey !== key) cancelActiveEditSession();
      removeStaleRoots(key);
      lastRouteKey = key;
      removeDuplicateRoots(key, targets.article);
      const existing = targets.article.querySelector(ROOT_SELECTOR);
      if (existing?.dataset.coderootKey === key) {
        placeRootAtFooter(existing, targets);
        return;
      }
      existing?.remove();
      clearArticleState(targets.article);
      if (route.kind === "unknown") return;
      let root;
      if (route.kind === "intro") {
        const result = await loadProblemContent(route);
        const currentBaseRoute = parseRoute();
        const currentTargets = currentBaseRoute ? findContentTargets(currentBaseRoute) : null;
        const currentRoute = currentBaseRoute && currentTargets ? withDetectedConceptLanguage(currentBaseRoute, currentTargets.contentRoot) : currentBaseRoute;
        if (routeKey(currentRoute) !== key) return;
        const latestTargets = currentTargets || findContentTargets(route) || targets;
        const current = latestTargets.article.querySelector(ROOT_SELECTOR);
        current?.remove();
        root = result.status === "ready" ? buildReadyRoot(route, result.problem, latestTargets.article) : buildMissingRoot(route, result, latestTargets.article);
        placeRootAtFooter(root, latestTargets);
        return;
      } else {
        root = buildUnsupportedRoot(route);
      }
      placeRootAtFooter(root, targets);
    }
    function withDetectedConceptLanguage(route, contentRoot) {
      return withConceptLanguage(route, detectConceptLanguage(contentRoot));
    }
    function withConceptLanguage(route, conceptLanguage) {
      const normalized = normalizeConceptLanguage(conceptLanguage);
      return {
        ...route,
        conceptLanguage: normalized.label,
        conceptLanguageKey: normalized.key,
        contentConceptKey: getContentConceptKey(normalized.key),
        canonicalPath: `${route.canonicalBasePath}?concept=${normalized.key}`
      };
    }
    function detectConceptLanguage(contentRoot) {
      const override = document.documentElement?.dataset?.coderootConceptLanguage;
      if (override) return override;
      const scopes = [contentRoot, document].filter(Boolean);
      for (const scope of scopes) {
        const buttons = Array.from(scope.querySelectorAll('button[role="combobox"], button[data-slot="select-trigger"]'));
        for (const button of buttons) {
          const label = extractConceptLanguage(button.textContent);
          if (label) return label;
        }
      }
      return DEFAULT_CONCEPT_LANGUAGE;
    }
    function extractConceptLanguage(text) {
      const normalizedText = normalizeText(text);
      return CONCEPT_LANGUAGE_PATTERNS.find((item) => item.pattern.test(normalizedText))?.label || "";
    }
    function normalizeConceptLanguage(language) {
      const text = normalizeText(language) || DEFAULT_CONCEPT_LANGUAGE;
      const matched = CONCEPT_LANGUAGE_PATTERNS.find((item) => item.pattern.test(text));
      return matched || { key: text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown", label: text };
    }
    function getContentConceptKey(conceptLanguageKey) {
      if (conceptLanguageKey === "cpp14") return "cpp";
      if (conceptLanguageKey === "python3") return "py";
      return conceptLanguageKey || "unknown";
    }
    function removeDuplicateRoots(activeKey, targetArticle) {
      document.querySelectorAll(ROOT_SELECTOR).forEach((root) => {
        if (root.dataset.coderootKey !== activeKey) return;
        if (targetArticle?.contains(root)) return;
        const article = root.closest("article");
        root.remove();
        clearArticleState(article);
      });
    }
    function placeRootAtFooter(root, targets) {
      if (!root || !targets?.insertionParent || !targets.footerStart) return;
      if (root.parentElement === targets.insertionParent && root.nextElementSibling === targets.footerStart) return;
      targets.insertionParent.insertBefore(root, targets.footerStart);
    }
    function findContentTargets(route) {
      const articles = Array.from(document.querySelectorAll("article"));
      for (const article of articles) {
        const contentRoot = findContentRoot(article);
        if (!contentRoot) continue;
        const footer = findFooterTarget(contentRoot, route.language);
        if (!footer) continue;
        return {
          article,
          contentRoot,
          insertionParent: footer.parent,
          footerStart: footer.before
        };
      }
      return null;
    }
    function findContentRoot(article) {
      const directChildren = Array.from(article.children);
      const preferred = directChildren.find((child) => {
        const className = String(child.className || "");
        return child.tagName === "DIV" && className.includes("flex") && className.includes("flex-col") && className.includes("p-32");
      });
      if (preferred) return preferred;
      return directChildren.find((child) => {
        const className = String(child.className || "");
        return child.tagName === "DIV" && className.includes("flex") && className.includes("flex-col");
      });
    }
    function findFooterTarget(contentRoot, language) {
      const feedbackPhrases = language === "en" ? ["Was this content helpful?", "Did this content help"] : ["\uC774 \uCF58\uD150\uCE20\uAC00 \uB3C4\uC6C0\uC774 \uB418\uC5C8\uB098\uC694?", "\uCF58\uD150\uCE20\uAC00 \uB3C4\uC6C0\uC774 \uB418\uC5C8\uB098\uC694?"];
      const descendants = Array.from(contentRoot.querySelectorAll("div, p, section"));
      const feedbackText = descendants.filter((node) => {
        const text = normalizeText(node.textContent);
        return feedbackPhrases.some((phrase) => text.includes(phrase));
      }).sort((a, b) => normalizeText(a.textContent).length - normalizeText(b.textContent).length)[0];
      const feedback = feedbackText ? findFeedbackContainer(feedbackText, contentRoot) : null;
      if (feedback?.parentElement) {
        return { parent: feedback.parentElement, before: feedback };
      }
      const copyright = descendants.find((node) => {
        const text = normalizeText(node.textContent);
        return text.includes("Copyright") || text.includes("Branch & Bound");
      });
      if (!copyright?.parentElement) return null;
      const siblings = Array.from(copyright.parentElement.children);
      const copyrightIndex = siblings.indexOf(copyright);
      const previous = siblings[copyrightIndex - 1];
      if (previous?.tagName === "DIV") {
        return { parent: copyright.parentElement, before: previous };
      }
      return { parent: copyright.parentElement, before: copyright };
    }
    function findFeedbackContainer(start, boundary) {
      let node = start;
      while (node && node !== boundary) {
        const className = String(node.className || "");
        if (node.tagName === "DIV" && className.includes("justify-center") && className.includes("flex-wrap")) {
          return node;
        }
        node = node.parentElement;
      }
      node = start;
      while (node?.parentElement && node.parentElement !== boundary) {
        node = node.parentElement;
      }
      return node === boundary ? start : node;
    }
    function getUiLanguage() {
      const route = parseRoute();
      if (route?.language === "en") return "en";
      const pageLanguage = String(document.documentElement?.lang || "").toLowerCase();
      return pageLanguage.startsWith("en") ? "en" : "ko";
    }
    async function loadProblemContent(route) {
      const cacheKey = route.canonicalPath;
      if (contentCache.has(cacheKey)) return contentCache.get(cacheKey);
      const resultPromise = (async () => {
        const xmlPath = await getContentPath(route);
        try {
          const xmlText = await fetchTextAsset(xmlPath);
          return {
            status: "ready",
            problem: {
              ...parseProblemXml(xmlText, route, xmlPath),
              xmlText
            },
            xmlPath
          };
        } catch (error) {
          return {
            status: "missing",
            xmlPath,
            reason: error?.message || "Content file was not found."
          };
        }
      })();
      contentCache.set(cacheKey, resultPromise);
      return resultPromise;
    }
    async function getContentPath(route) {
      return `${CONTENT_DIR}/${route.slug}/${route.contentConceptKey || getContentConceptKey(route.conceptLanguageKey)}.${route.language}.xml`;
    }
    async function fetchTextAsset(path) {
      const url = getAssetUrl(path);
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Unable to load ${path}: ${response.status}`);
      }
      return response.text();
    }
    function getAssetUrl(path) {
      const testBase = document.documentElement?.dataset?.coderootContentBase;
      if (testBase) {
        const base = testBase.endsWith("/") ? testBase : `${testBase}/`;
        return new URL(`${base}${path.replace(/^content\//, "")}`, document.baseURI).href;
      }
      if (path.startsWith(`${CONTENT_DIR}/`)) {
        return new URL(path.replace(/^content\//, ""), REMOTE_CONTENT_URL_BASE).href;
      }
      if (globalThis.chrome?.runtime?.getURL) {
        return chrome.runtime.getURL(getRuntimeAssetPath(path));
      }
      return new URL(`/${path}`, globalThis.location?.origin || "https://www.codetree.ai").href;
    }
    function getRuntimeAssetPath(path) {
      const iconPath = globalThis.chrome?.runtime?.getManifest?.()?.icons?.["16"] || "";
      if (!iconPath.startsWith("extension/")) return path;
      if (path.startsWith("extension/")) return path;
      return `extension/${path}`;
    }
    function hasExtensionRuntime() {
      return Boolean(globalThis.chrome?.runtime?.id && globalThis.chrome?.runtime?.sendMessage);
    }
    function sendRuntimeMessage(message) {
      return new Promise((resolve, reject) => {
        if (!hasExtensionRuntime()) {
          reject(new Error("Coderoot extension runtime is not available."));
          return;
        }
        chrome.runtime.sendMessage(message, (response) => {
          const runtimeError = chrome.runtime.lastError;
          if (runtimeError) {
            reject(new Error(runtimeError.message));
            return;
          }
          if (!response?.ok) {
            const error = new Error(response?.error?.message || "Coderoot background request failed.");
            error.status = response?.error?.status || 0;
            error.data = response?.error?.data || null;
            reject(error);
            return;
          }
          resolve(response.data);
        });
      });
    }
    async function githubApi(endpoint, options = {}) {
      return sendRuntimeMessage({
        auth: options.auth !== false,
        body: options.body ?? null,
        endpoint,
        method: options.method || "GET",
        type: "coderoot.github.api"
      });
    }
    function getCoderootApiBase(language = "ko") {
      const base = String(CODEROOT_API_BASE || "").trim().replace(/\/+$/, "");
      if (!base) {
        throw new Error(
          language === "en" ? "Coderoot API is not configured yet. Set CODEROOT_API_BASE after deploying the GitHub App backend." : "Coderoot API\uAC00 \uC544\uC9C1 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. GitHub App \uBC31\uC5D4\uB4DC\uB97C \uBC30\uD3EC\uD55C \uB4A4 CODEROOT_API_BASE\uB97C \uC124\uC815\uD574 \uC8FC\uC138\uC694."
        );
      }
      return base;
    }
    function getCoderootApiOrigin() {
      try {
        return new URL(getCoderootApiBase("en")).origin;
      } catch {
        return "";
      }
    }
    async function coderootApi(path, { body = null, language = "ko", method = "GET", token = "" } = {}) {
      const base = getCoderootApiBase(language);
      const headers = {
        Accept: "application/json"
      };
      if (body !== null && body !== void 0) {
        headers["Content-Type"] = "application/json";
      }
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const response = await fetch(`${base}${path}`, {
        body: body === null || body === void 0 ? void 0 : JSON.stringify(body),
        headers,
        method
      });
      const text = await response.text();
      const data = text ? parseMaybeJson(text) : null;
      if (!response.ok) {
        const message = typeof data === "object" && data?.message ? data.message : text || (language === "en" ? "Coderoot API request failed." : "Coderoot API \uC694\uCCAD\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.");
        const error = new Error(message);
        error.status = response.status;
        error.data = data;
        throw error;
      }
      return data || {};
    }
    function parseMaybeJson(text) {
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    }
    async function getCoderootSessionStatus(language) {
      if (!hasExtensionRuntime()) return { hasSession: false, login: "", token: "" };
      const stored = await sendRuntimeMessage({ type: "coderoot.session.get" });
      if (!stored?.hasSession || !stored.token) return { hasSession: false, login: "", token: "" };
      try {
        const session = await coderootApi("/api/auth/session", {
          language,
          method: "GET",
          token: stored.token
        });
        return {
          hasSession: true,
          login: session.login || stored.login || "",
          token: stored.token
        };
      } catch (error) {
        if ([401, 403].includes(Number(error.status))) {
          await clearCoderootSession();
        }
        return { hasSession: false, login: "", token: "" };
      }
    }
    async function setCoderootSession({ login, token }) {
      return sendRuntimeMessage({ login, token, type: "coderoot.session.set" });
    }
    async function clearCoderootSession() {
      if (!hasExtensionRuntime()) return { hasSession: false };
      return sendRuntimeMessage({ type: "coderoot.session.clear" });
    }
    async function ensureCoderootSession(language) {
      const status = await getCoderootSessionStatus(language);
      if (status.hasSession) return status.token;
      const session = await openGitHubAppDialog(language);
      if (!session?.token) return "";
      await setCoderootSession(session);
      return session.token;
    }
    function openGitHubAppDialog(language) {
      return new Promise((resolve) => {
        document.querySelectorAll(".coderoot-token-overlay").forEach((overlay2) => overlay2.remove());
        const overlay = document.createElement("div");
        overlay.className = "coderoot-review-overlay coderoot-token-overlay";
        const dialog = document.createElement("section");
        dialog.className = "coderoot-token-dialog";
        dialog.setAttribute("role", "dialog");
        dialog.setAttribute("aria-modal", "true");
        const title = document.createElement("h2");
        title.textContent = language === "en" ? "Connect GitHub" : "GitHub \uC5F0\uACB0";
        const description = document.createElement("p");
        description.textContent = language === "en" ? "Coderoot opens GitHub in a popup, verifies your account, then asks the Coderoot API to save this XML through the installed GitHub App. No personal access token is stored in the extension." : "Coderoot\uAC00 \uD31D\uC5C5\uC73C\uB85C GitHub \uACC4\uC815\uC744 \uD655\uC778\uD55C \uB4A4, \uC124\uCE58\uB41C GitHub App \uAD8C\uD55C\uC73C\uB85C Coderoot API\uC5D0 XML \uC800\uC7A5\uC744 \uC694\uCCAD\uD569\uB2C8\uB2E4. \uD655\uC7A5 \uD504\uB85C\uADF8\uB7A8\uC5D0\uB294 personal access token\uC744 \uC800\uC7A5\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.";
        const error = document.createElement("p");
        error.className = "coderoot-token-error";
        const footer = document.createElement("div");
        footer.className = "coderoot-token-footer";
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.className = "coderoot-token-secondary";
        cancel.textContent = language === "en" ? "Cancel" : "\uCDE8\uC18C";
        const save = document.createElement("button");
        save.type = "button";
        save.className = "coderoot-token-primary";
        save.textContent = language === "en" ? "Continue with GitHub" : "GitHub\uB85C \uACC4\uC18D\uD558\uAE30";
        const cleanup = (value) => {
          window.removeEventListener("message", handleMessage, false);
          document.removeEventListener("keydown", handleKeydown, true);
          overlay.remove();
          resolve(value);
        };
        const submit = () => {
          let apiBase = "";
          try {
            apiBase = getCoderootApiBase(language);
          } catch (baseError) {
            error.textContent = baseError.message;
            return;
          }
          const authUrl = new URL("/api/auth/github/start", apiBase);
          authUrl.searchParams.set("origin", window.location.origin);
          const popup = window.open(authUrl.href, "coderoot-github-auth", "popup=yes,width=720,height=820");
          if (!popup) {
            error.textContent = language === "en" ? "Allow popups, then try again." : "\uD31D\uC5C5\uC744 \uD5C8\uC6A9\uD55C \uB4A4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.";
            return;
          }
          save.disabled = true;
          save.textContent = language === "en" ? "Waiting for GitHub..." : "GitHub \uC751\uB2F5 \uB300\uAE30 \uC911...";
        };
        const handleMessage = (event) => {
          if (event.origin !== getCoderootApiOrigin()) return;
          if (event.data?.source !== "coderoot") return;
          if (event.data?.type === "github.error") {
            error.textContent = event.data.error || (language === "en" ? "GitHub connection failed." : "GitHub \uC5F0\uACB0\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.");
            save.disabled = false;
            save.textContent = language === "en" ? "Continue with GitHub" : "GitHub\uB85C \uACC4\uC18D\uD558\uAE30";
            return;
          }
          if (event.data?.type !== "github.connected") return;
          if (!event.data.token) {
            error.textContent = language === "en" ? "GitHub connection did not return a session." : "GitHub \uC5F0\uACB0 \uC138\uC158\uC744 \uBC1B\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.";
            save.disabled = false;
            save.textContent = language === "en" ? "Continue with GitHub" : "GitHub\uB85C \uACC4\uC18D\uD558\uAE30";
            return;
          }
          cleanup({
            login: String(event.data.login || ""),
            token: String(event.data.token || "")
          });
        };
        const handleKeydown = (event) => {
          if (!document.body.contains(overlay)) {
            document.removeEventListener("keydown", handleKeydown, true);
            return;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            cleanup("");
          }
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            submit();
          }
        };
        cancel.addEventListener("click", () => cleanup(""));
        save.addEventListener("click", submit);
        overlay.addEventListener("click", (event) => {
          if (event.target === overlay) cleanup("");
        });
        window.addEventListener("message", handleMessage, false);
        document.addEventListener("keydown", handleKeydown, true);
        footer.append(cancel, save);
        dialog.append(title, description, error, footer);
        overlay.append(dialog);
        document.body.append(overlay);
        save.focus({ preventScroll: true });
      });
    }
    async function publishXmlToGitHub(options) {
      const token = await ensureCoderootSession(options.route.language);
      if (!token) {
        throw createSilentCancelError();
      }
      const result = await coderootApi("/api/github/save", {
        body: {
          mode: options.mode,
          route: {
            conceptLanguage: options.route.conceptLanguage,
            conceptLanguageKey: options.route.conceptLanguageKey,
            contentConceptKey: options.route.contentConceptKey,
            language: options.route.language,
            slug: options.route.slug
          },
          sourcePath: options.sourcePath,
          xmlText: options.xmlText
        },
        language: options.route.language,
        method: "POST",
        token
      });
      clearContentCache();
      return result;
    }
    function createSilentCancelError() {
      const error = new Error("cancelled");
      error.coderootSilent = true;
      return error;
    }
    async function loadGitHubVersions({ initialXml, mode, route, sourcePath }) {
      const fallback = getFallbackVersions({ initialXml, mode, route });
      if (!hasExtensionRuntime()) {
        return {
          entries: fallback,
          latestLabel: route.language === "en" ? "local draft" : "\uB85C\uCEEC \uC791\uC131\uBCF8"
        };
      }
      try {
        const params = new URLSearchParams({
          path: sourcePath,
          per_page: "8",
          sha: GITHUB_DEFAULT_BRANCH
        });
        const response = await githubApi(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/commits?${params.toString()}`, { auth: false });
        const commits = Array.isArray(response.data) ? response.data : [];
        const entries = [fallback[0]];
        for (const commit of commits) {
          const sha = commit.sha;
          if (!sha) continue;
          try {
            const file = await githubApi(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeGitHubPath(sourcePath)}?ref=${encodeURIComponent(sha)}`, { auth: false });
            const xml = formatCoderootXml(base64DecodeUtf8(file.data?.content || ""));
            if (!xml.trim()) continue;
            const date = commit.commit?.committer?.date || commit.commit?.author?.date || "";
            entries.push({
              label: `${sha.slice(0, 7)} \xB7 ${formatRelativeTime(date, route.language)}`,
              xml
            });
          } catch {
          }
        }
        entries.push(...fallback.slice(1));
        return {
          entries,
          latestLabel: commits[0]?.commit?.committer?.date ? formatRelativeTime(commits[0].commit.committer.date, route.language) : route.language === "en" ? "no published history" : "\uAC8C\uC2DC \uC774\uB825 \uC5C6\uC74C"
        };
      } catch {
        return {
          entries: fallback,
          latestLabel: route.language === "en" ? "history unavailable" : "\uC774\uB825 \uBD88\uB7EC\uC624\uAE30 \uC2E4\uD328"
        };
      }
    }
    function clearContentCache() {
      contentCache.clear();
    }
    function getFallbackVersions({ route, initialXml, mode }) {
      const template = formatCoderootXml(createXmlTemplate(route));
      const baseXml = formatCoderootXml(initialXml || template);
      return [
        {
          label: route.language === "en" ? "Current draft" : "\uD604\uC7AC \uC791\uC131\uBCF8",
          xml: baseXml
        },
        {
          label: route.language === "en" ? "Clean template" : "\uCD08\uAE30 \uD15C\uD50C\uB9BF",
          xml: template
        },
        {
          label: mode === "create" ? route.language === "en" ? "Empty content shell" : "\uBE48 \uCF58\uD150\uCE20 \uD2C0" : route.language === "en" ? "Empty rewrite shell" : "\uBE48 \uC7AC\uC791\uC131 \uD2C0",
          xml: formatCoderootXml(template.replace(/<content>[\s\S]*?<\/content>/, "<content>\n    <p></p>\n  </content>"))
        }
      ];
    }
    function formatRelativeTime(dateText, language) {
      const time = Date.parse(dateText || "");
      if (!time) return language === "en" ? "unknown time" : "\uC2DC\uAC04 \uC54C \uC218 \uC5C6\uC74C";
      const seconds = Math.max(1, Math.round((Date.now() - time) / 1e3));
      const units = [
        [31536e3, language === "en" ? "year" : "\uB144"],
        [2592e3, language === "en" ? "month" : "\uAC1C\uC6D4"],
        [86400, language === "en" ? "day" : "\uC77C"],
        [3600, language === "en" ? "hour" : "\uC2DC\uAC04"],
        [60, language === "en" ? "minute" : "\uBD84"]
      ];
      for (const [unitSeconds, label] of units) {
        if (seconds < unitSeconds) continue;
        const count = Math.floor(seconds / unitSeconds);
        if (language === "en") return `${count} ${label}${count === 1 ? "" : "s"} ago`;
        return `${count}${label} \uC804`;
      }
      return language === "en" ? "just now" : "\uBC29\uAE08 \uC804";
    }
    function encodeGitHubPath(path) {
      return String(path).split("/").map(encodeURIComponent).join("/");
    }
    function base64DecodeUtf8(text) {
      const binary = atob(String(text || "").replace(/\s/g, ""));
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    }
    function setEditingFavicon(editing) {
      if (!document.head) return;
      if (editing) {
        if (!originalFaviconLinks) {
          originalFaviconLinks = Array.from(document.querySelectorAll('link[rel~="icon"], link[rel="shortcut icon"]')).map((link) => ({
            href: link.getAttribute("href"),
            rel: link.getAttribute("rel"),
            sizes: link.getAttribute("sizes"),
            type: link.getAttribute("type")
          }));
        }
        document.querySelectorAll('link[rel~="icon"], link[rel="shortcut icon"]').forEach((link) => link.remove());
        const icon = document.createElement("link");
        icon.rel = "icon";
        icon.type = "image/x-icon";
        icon.href = getAssetUrl("coderoot-favicon.ico");
        icon.dataset.coderootFavicon = "true";
        document.head.append(icon);
        return;
      }
      document.querySelectorAll('link[data-coderoot-favicon="true"], link[rel~="icon"], link[rel="shortcut icon"]').forEach((link) => link.remove());
      const links = originalFaviconLinks?.length ? originalFaviconLinks : [{ rel: "icon", type: "image/x-icon", href: getAssetUrl("codetree-favicon.ico") }];
      links.forEach((item) => {
        const link = document.createElement("link");
        link.rel = item.rel || "icon";
        if (item.type) link.type = item.type;
        if (item.sizes) link.sizes = item.sizes;
        link.href = item.href || getAssetUrl("codetree-favicon.ico");
        document.head.append(link);
      });
    }
    function buildReadyRoot(route, problem, article, options = {}) {
      const root = document.createElement("section");
      root.className = "coderoot-shell";
      root.dataset.coderootRoot = "true";
      root.dataset.coderootKey = routeKey(route);
      root.dataset.coderootSlug = route.slug;
      root.dataset.coderootLanguage = problem.language;
      root.dataset.coderootConceptLanguage = route.conceptLanguage;
      root.dataset.coderootSource = problem.sourcePath;
      root.dataset.coderootExpanded = "true";
      const banner = document.createElement("div");
      banner.className = "coderoot-info";
      const icon = document.createElement("div");
      icon.className = "coderoot-info-icon";
      icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-info" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>`;
      const bannerText = document.createElement("p");
      bannerText.textContent = problem.language === "en" ? `Coderoot advanced note. This section expands the original concept from the selected ${route.conceptLanguage} perspective.` : `Coderoot \uC2EC\uD654 \uAC1C\uB150\uC785\uB2C8\uB2E4. \uD604\uC7AC \uC120\uD0DD\uB41C ${route.conceptLanguage} \uAE30\uC900\uC73C\uB85C \uAE30\uC874 \uAC1C\uB150\uC758 \uBC30\uACBD\uACFC \uC6D0\uB9AC\uB97C \uB354 \uC790\uC138\uD788 \uC124\uBA85\uD569\uB2C8\uB2E4.`;
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "coderoot-edit-button";
      edit.dataset.coderootEdit = "true";
      edit.textContent = problem.language === "en" ? "Edit" : "\uC218\uC815\uD558\uAE30";
      banner.append(icon, bannerText, edit);
      const panel = document.createElement("div");
      panel.className = "coderoot-panel";
      const meta = document.createElement("p");
      meta.className = "coderoot-meta";
      meta.textContent = problem.badge;
      decoratePreviewScope(meta, {
        sourceKey: "meta-badge",
        sourceRange: problem.badgeRange,
        sourceTag: "badge"
      });
      const title = document.createElement("h1");
      title.className = "coderoot-title";
      title.textContent = problem.title;
      decoratePreviewScope(title, {
        sourceKey: "meta-title",
        sourceRange: problem.titleRange,
        sourceTag: "title"
      });
      const content = document.createElement("div");
      content.className = "coderoot-content";
      problem.blocks.forEach((block) => content.append(renderBlock(block)));
      panel.append(meta, title, content);
      root.append(banner, panel);
      edit.addEventListener("click", () => {
        void openXmlEditor({
          route,
          article,
          root,
          sourcePath: problem.sourcePath,
          initialXml: problem.xmlText || "",
          mode: "edit",
          onPreview: (nextProblem, cancelEditing, editorApi) => {
            renderPreviewRoot({ root, article, problem: nextProblem, route, onCancel: cancelEditing, editorApi });
          },
          onCancel: () => {
            clearArticleState(article);
            const restored = buildReadyRoot(route, problem, article);
            root.replaceWith(restored);
          }
        });
      });
      article.dataset.coderootExpanded = "true";
      return root;
    }
    function buildMissingRoot(route, missing, article) {
      const root = document.createElement("section");
      root.className = "coderoot-shell coderoot-missing";
      root.dataset.coderootRoot = "true";
      root.dataset.coderootKey = routeKey(route);
      root.dataset.coderootSlug = route.slug;
      root.dataset.coderootLanguage = route.language;
      root.dataset.coderootConceptLanguage = route.conceptLanguage;
      root.dataset.coderootStatus = "missing";
      const panel = document.createElement("div");
      panel.className = "coderoot-missing-panel";
      const badge = document.createElement("p");
      badge.className = "coderoot-missing-badge";
      badge.textContent = route.language === "en" ? "Coderoot note is not ready yet" : "Coderoot \uC2EC\uD654 \uC124\uBA85 \uC900\uBE44 \uC911";
      const title = document.createElement("h1");
      title.className = "coderoot-missing-title";
      title.textContent = route.language === "en" ? "No advanced note has been written for this problem yet." : "\uC544\uC9C1 \uC774 \uBB38\uC81C\uC758 \uC2EC\uD654 \uC124\uBA85\uC774 \uC791\uC131\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.";
      const body = document.createElement("p");
      body.className = "coderoot-missing-text";
      body.textContent = route.language === "en" ? `You can draft an advanced note for ${route.conceptLanguage} and preview it on this page.` : `\uD604\uC7AC \uC120\uD0DD\uB41C ${route.conceptLanguage} \uAE30\uC900 \uC2EC\uD654 \uC124\uBA85\uC744 \uC791\uC131\uD558\uACE0 \uC774 \uD398\uC774\uC9C0\uC5D0\uC11C \uBC14\uB85C \uBBF8\uB9AC\uBCFC \uC218 \uC788\uC2B5\uB2C8\uB2E4.`;
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "coderoot-edit-button coderoot-edit-button-inline";
      edit.dataset.coderootEdit = "true";
      edit.textContent = route.language === "en" ? "Add Advanced Note" : "\uC2EC\uD654 \uC124\uBA85 \uCD94\uAC00\uD558\uAE30";
      edit.addEventListener("click", () => {
        void openXmlEditor({
          route,
          article,
          root,
          sourcePath: missing.xmlPath,
          initialXml: createXmlTemplate(route),
          mode: "create",
          onPreview: (nextProblem, cancelEditing, editorApi) => {
            renderPreviewRoot({ root, article, problem: nextProblem, route, onCancel: cancelEditing, editorApi });
          },
          onCancel: () => {
            clearArticleState(article);
            const restored = buildMissingRoot(route, missing, article);
            root.replaceWith(restored);
          }
        });
      });
      panel.append(badge, title, body, edit);
      root.append(panel);
      return root;
    }
    function buildUnsupportedRoot(route) {
      const root = document.createElement("section");
      root.className = "coderoot-shell coderoot-unsupported";
      root.dataset.coderootRoot = "true";
      root.dataset.coderootKey = routeKey(route);
      root.dataset.coderootSlug = route.slug;
      root.dataset.coderootLanguage = route.language;
      root.dataset.coderootConceptLanguage = route.conceptLanguage;
      root.dataset.coderootStatus = "unsupported";
      root.dataset.coderootKind = route.kind;
      const panel = document.createElement("div");
      panel.className = "coderoot-missing-panel coderoot-unsupported-panel";
      const badge = document.createElement("p");
      badge.className = "coderoot-missing-badge";
      badge.textContent = route.language === "en" ? "Coderoot coverage note" : "Coderoot \uC9C0\uC6D0 \uBC94\uC704 \uC548\uB0B4";
      const title = document.createElement("h1");
      title.className = "coderoot-missing-title";
      title.textContent = route.language === "en" ? "This page type is not covered by Coderoot yet." : "\uC774 \uC720\uD615\uC740 \uC544\uC9C1 Coderoot \uC2EC\uD654 \uC124\uBA85\uC744 \uC81C\uACF5\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.";
      const body = document.createElement("p");
      body.className = "coderoot-missing-text";
      body.textContent = route.language === "en" ? "Coderoot currently supports only intro-* pages where one problem maps to one basic concept. challenge-* and test-* pages can contain multiple concepts in accordions, so this extension shows this note instead of an expandable deep dive." : "Coderoot\uB294 \uD604\uC7AC \uD558\uB098\uC758 \uBB38\uC81C\uC640 \uD558\uB098\uC758 \uAE30\uBCF8 \uAC1C\uB150\uC774 1:1\uB85C \uB300\uC751\uB418\uB294 intro-* \uD398\uC774\uC9C0\uC5D0\uB9CC \uC2EC\uD654 \uC124\uBA85\uC744 \uBD99\uC785\uB2C8\uB2E4. challenge-*\uC640 test-* \uD398\uC774\uC9C0\uB294 \uC5EC\uB7EC \uAE30\uBCF8 \uAC1C\uB150\uC774 accordion\uC73C\uB85C \uBB36\uC77C \uC218 \uC788\uC5B4, \uC9C0\uAE08\uC740 \uC811\uD788\uB294 \uC2EC\uD654 \uCF58\uD150\uCE20 \uB300\uC2E0 \uC774 \uC548\uB0B4\uB9CC \uD45C\uC2DC\uD569\uB2C8\uB2E4.";
      panel.append(badge, title, body);
      root.append(panel);
      return root;
    }
    async function openXmlEditor({ route, article, root, sourcePath, initialXml, mode, onPreview, onCancel }) {
      cancelActiveEditSession();
      activeEditRouteKey = routeKey(route);
      setEditingFavicon(true);
      const language = route.language;
      const panel = await createSideEditorPanel(article);
      const shell = document.createElement("div");
      shell.className = "coderoot-side-shell";
      shell.dataset.coderootEditor = "true";
      const topbar = document.createElement("div");
      topbar.className = "coderoot-side-topbar";
      const leftTools = document.createElement("div");
      leftTools.className = "coderoot-side-left-tools";
      const close = document.createElement("button");
      close.type = "button";
      close.className = "coderoot-side-icon-button coderoot-side-close-button";
      close.setAttribute("aria-label", language === "en" ? "Collapse editor panel" : "\uC5D0\uB514\uD130 \uD328\uB110 \uC811\uAE30");
      close.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevrons-right" aria-hidden="true"><path d="m6 17 5-5-5-5"></path><path d="m13 17 5-5-5-5"></path></svg>`;
      const modePill = document.createElement("span");
      modePill.className = "coderoot-side-pill";
      modePill.textContent = "XML";
      const updated = document.createElement("span");
      updated.className = "coderoot-side-muted";
      updated.textContent = language === "en" ? "loading history..." : "\uC774\uB825 \uBD88\uB7EC\uC624\uB294 \uC911...";
      leftTools.append(close, modePill, updated);
      const github = document.createElement("a");
      github.className = "coderoot-side-link";
      github.href = `${GITHUB_CONTENT_URL_BASE}${sourcePath}`;
      github.target = "_blank";
      github.rel = "noreferrer noopener";
      github.title = language === "en" ? "Open GitHub file" : "GitHub \uD30C\uC77C \uC5F4\uAE30";
      github.setAttribute("aria-label", github.title);
      github.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-external-link" aria-hidden="true"><path d="M15 3h6v6"></path><path d="M10 14 21 3"></path><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path></svg>`;
      const versions = document.createElement("select");
      versions.className = "coderoot-side-select";
      versions.setAttribute("aria-label", language === "en" ? "Restore version" : "\uB418\uB3CC\uB9B4 \uBC84\uC804 \uC120\uD0DD");
      let versionEntries = getFallbackVersions({ route, initialXml, mode });
      const renderVersionOptions = (selectedIndex = 0) => {
        versions.replaceChildren();
        versionEntries.forEach((version, index) => {
          const option = document.createElement("option");
          option.value = String(index);
          option.textContent = version.label;
          versions.append(option);
        });
        versions.value = String(Math.min(selectedIndex, Math.max(0, versionEntries.length - 1)));
      };
      renderVersionOptions();
      const state = document.createElement("button");
      state.type = "button";
      state.className = "coderoot-side-state";
      state.dataset.state = "clean";
      state.innerHTML = `<span></span><p>${language === "en" ? "Original" : "\uC6D0\uBCF8"}</p>`;
      topbar.append(leftTools, github, versions, state);
      const editorWrap = document.createElement("div");
      editorWrap.className = "coderoot-side-editor-wrap";
      const gutter = document.createElement("pre");
      gutter.className = "coderoot-side-gutter";
      const codeArea = document.createElement("div");
      codeArea.className = "coderoot-side-code-area";
      const highlight = document.createElement("pre");
      highlight.className = "coderoot-side-highlight";
      const textarea = document.createElement("textarea");
      textarea.className = "coderoot-side-textarea";
      textarea.spellcheck = false;
      let originalXml = formatCoderootXml(initialXml || createXmlTemplate(route));
      textarea.value = originalXml;
      codeArea.append(highlight, textarea);
      editorWrap.append(gutter, codeArea);
      const status = document.createElement("p");
      status.className = "coderoot-side-status";
      const footbar = document.createElement("div");
      footbar.className = "coderoot-side-footbar";
      const back = document.createElement("button");
      back.type = "button";
      back.className = "coderoot-side-footer-button";
      back.title = language === "en" ? "Back (\u2318+Z)" : "\uB4A4\uB85C \uAC00\uAE30 (\u2318+Z)";
      back.setAttribute("aria-label", back.title);
      back.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-left" aria-hidden="true"><path d="m12 19-7-7 7-7"></path><path d="M19 12H5"></path></svg><span>${language === "en" ? "Back" : "\uB4A4\uB85C \uAC00\uAE30"}</span>`;
      const forward = document.createElement("button");
      forward.type = "button";
      forward.className = "coderoot-side-footer-button";
      forward.title = language === "en" ? "Forward (\u2318+\u21E7+Z)" : "\uC55E\uC73C\uB85C \uAC00\uAE30 (\u2318+\u21E7+Z)";
      forward.setAttribute("aria-label", forward.title);
      forward.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right" aria-hidden="true"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg><span>${language === "en" ? "Forward" : "\uC55E\uC73C\uB85C \uAC00\uAE30"}</span>`;
      const contribute = document.createElement("button");
      contribute.type = "button";
      contribute.className = "coderoot-side-submit";
      contribute.title = language === "en" ? "Save (\u2318+\u21B5)" : "\uC800\uC7A5\uD558\uAE30 (\u2318+\u21B5)";
      contribute.setAttribute("aria-label", contribute.title);
      contribute.innerHTML = `<span>${language === "en" ? "Save" : "\uC800\uC7A5\uD558\uAE30"}</span><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-cloud-upload" aria-hidden="true"><path d="M12 13v8"></path><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"></path><path d="m8 17 4-4 4 4"></path></svg>`;
      footbar.append(back, forward, contribute);
      shell.append(topbar, editorWrap, status, footbar);
      panel.replaceChildren(shell);
      const cancelEditing = (options = {}) => {
        const activeCancel = activeEditorCancel;
        activeEditorCancel = null;
        activeCancel?.();
        closeExistingSideEditor(options);
      };
      activeEditorCancel = () => {
        onCancel?.();
      };
      let currentPreviewProblem = null;
      let currentEditorError = null;
      let previewHoverScopeKey = null;
      let revealPreviewOnNextRender = false;
      let history = [originalXml];
      let historyIndex = 0;
      const syncScroll = () => {
        highlight.scrollTop = textarea.scrollTop;
        highlight.scrollLeft = textarea.scrollLeft;
        gutter.scrollTop = textarea.scrollTop;
      };
      const updateStateIndicator = (kind) => {
        state.dataset.state = kind;
        contribute.disabled = kind !== "dirty";
        const label = state.querySelector("p");
        if (!label) return;
        const labels = {
          clean: language === "en" ? "Original" : "\uC6D0\uBCF8",
          dirty: language === "en" ? "Editing" : "\uC218\uC815 \uC911",
          error: language === "en" ? "Error" : "\uC624\uB958"
        };
        label.textContent = labels[kind] || labels.clean;
      };
      const refreshHistoryButtons = () => {
        back.disabled = historyIndex <= 0;
        forward.disabled = historyIndex >= history.length - 1;
      };
      const pushHistory = () => {
        const nextValue = textarea.value;
        if (history[historyIndex] === nextValue) return;
        history = history.slice(0, historyIndex + 1).concat(nextValue);
        historyIndex = history.length - 1;
        refreshHistoryButtons();
      };
      const setEditorValue = (value, options = {}) => {
        textarea.value = value;
        if (options.record !== false) pushHistory();
        sync();
      };
      const applyHistory = (nextIndex) => {
        if (nextIndex < 0 || nextIndex >= history.length) return;
        historyIndex = nextIndex;
        textarea.value = history[historyIndex];
        refreshHistoryButtons();
        sync();
      };
      const formatEditorValue = () => {
        const formattedXml = formatCoderootXml(textarea.value);
        if (formattedXml === textarea.value) return false;
        textarea.value = formattedXml;
        pushHistory();
        sync();
        return true;
      };
      const togglePanelCollapse = () => {
        const collapsed = panel.dataset.coderootCollapsed !== "true";
        panel.dataset.coderootCollapsed = String(collapsed);
        shell.dataset.coderootCollapsed = String(collapsed);
        if (collapsed) {
          panel.style.setProperty("flex", "0 0 40px", "important");
          panel.style.setProperty("max-width", "40px", "important");
          panel.style.setProperty("min-width", "40px", "important");
          panel.style.setProperty("width", "40px", "important");
        } else {
          panel.style.setProperty("flex", "0 0 clamp(520px, 48vw, 920px)", "important");
          panel.style.setProperty("max-width", "clamp(520px, 48vw, 920px)", "important");
          panel.style.setProperty("min-width", "min(520px, calc(100vw - 24px))", "important");
          panel.style.setProperty("width", "clamp(520px, 48vw, 920px)", "important");
        }
        close.setAttribute("aria-label", collapsed ? language === "en" ? "Expand editor panel" : "\uC5D0\uB514\uD130 \uD328\uB110 \uD3BC\uCE58\uAE30" : language === "en" ? "Collapse editor panel" : "\uC5D0\uB514\uD130 \uD328\uB110 \uC811\uAE30");
        close.innerHTML = collapsed ? `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevrons-left" aria-hidden="true"><path d="m11 17-5-5 5-5"></path><path d="m18 17-5-5 5-5"></path></svg>` : `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevrons-right" aria-hidden="true"><path d="m6 17 5-5-5-5"></path><path d="m13 17 5-5-5-5"></path></svg>`;
      };
      const requestPreviewReveal = () => {
        revealPreviewOnNextRender = true;
      };
      const renderEditorSurface = (options = {}) => {
        const xmlText = textarea.value;
        const activeLine = getActiveLine(textarea);
        const activeScope = findScopeByLine(currentPreviewProblem, activeLine);
        const hoverScope = getScopeByKey(currentPreviewProblem, previewHoverScopeKey);
        const scope = hoverScope || activeScope;
        const shouldRevealPreview = options.revealPreview || revealPreviewOnNextRender;
        revealPreviewOnNextRender = false;
        highlight.innerHTML = highlightXml(xmlText, activeLine, scope, currentEditorError);
        gutter.innerHTML = createLineNumbers(xmlText, activeLine, scope, currentEditorError);
        textarea.title = currentEditorError?.message || "";
        highlightPreviewBlock(root, scope?.sourceKey);
        if (shouldRevealPreview) revealPreviewBlock(root, scope?.sourceKey);
        syncScroll();
      };
      const revealEditorLine = (line) => {
        const targetLine = Math.max(1, Number(line) || 1);
        textarea.scrollTop = Math.max(0, (targetLine - 4) * 21);
        syncScroll();
        renderEditorSurface();
      };
      const goToEditorLine = (line) => {
        const targetLine = Math.max(1, Number(line) || 1);
        const offset = offsetForLine(textarea.value, targetLine);
        textarea.focus({ preventScroll: true });
        textarea.setSelectionRange(offset, offset);
        revealEditorLine(targetLine);
      };
      const editorApi = {
        clearScopeIndex(index) {
          if (previewHoverScopeKey !== String(index)) return;
          previewHoverScopeKey = null;
          renderEditorSurface();
        },
        goToLine: goToEditorLine,
        revealLine: revealEditorLine,
        setScopeIndex(index) {
          previewHoverScopeKey = String(index);
          renderEditorSurface();
        }
      };
      const sync = () => {
        const xmlText = textarea.value;
        const problem = validateEditorXml(xmlText, route, sourcePath, status, { silent: true });
        currentPreviewProblem = problem;
        currentEditorError = problem ? null : editorErrorFromStatus(status);
        const formattedXml = problem ? formatCoderootXml(xmlText) : xmlText;
        const dirty = Boolean(problem && !isXmlFormattedForSave(formattedXml, originalXml));
        updateStateIndicator(problem ? dirty ? "dirty" : "clean" : "error");
        renderEditorSurface();
        if (problem) {
          onPreview?.(problem, cancelEditing, editorApi);
          renderEditorSurface();
        } else {
          renderInvalidPreviewRoot({ root, article, route, message: status.textContent, onCancel: cancelEditing });
        }
      };
      const refreshVersionHistory = async () => {
        versions.disabled = true;
        updated.textContent = language === "en" ? "loading history..." : "\uC774\uB825 \uBD88\uB7EC\uC624\uB294 \uC911...";
        const result = await loadGitHubVersions({ initialXml: originalXml, mode, route, sourcePath });
        versionEntries = result.entries;
        renderVersionOptions(0);
        updated.textContent = result.latestLabel;
        versions.disabled = false;
      };
      const insertIndent = () => {
        const value = textarea.value;
        const start = textarea.selectionStart || 0;
        const end = textarea.selectionEnd || start;
        const indent = "  ";
        if (start !== end && value.slice(start, end).includes("\n")) {
          const lineStart = value.lastIndexOf("\n", start - 1) + 1;
          const selected = value.slice(lineStart, end);
          const replacement = selected.split("\n").map((line) => `${indent}${line}`).join("\n");
          textarea.value = value.slice(0, lineStart) + replacement + value.slice(end);
          textarea.setSelectionRange(start + indent.length, lineStart + replacement.length);
        } else {
          textarea.value = value.slice(0, start) + indent + value.slice(end);
          textarea.setSelectionRange(start + indent.length, start + indent.length);
        }
        pushHistory();
        sync();
      };
      const removeIndent = () => {
        const value = textarea.value;
        const start = textarea.selectionStart || 0;
        const end = textarea.selectionEnd || start;
        const lineStart = value.lastIndexOf("\n", start - 1) + 1;
        const selected = value.slice(lineStart, end);
        const replacement = selected.split("\n").map((line) => line.replace(/^( {1,2}|\t)/, "")).join("\n");
        textarea.value = value.slice(0, lineStart) + replacement + value.slice(end);
        textarea.setSelectionRange(Math.max(lineStart, start - 2), lineStart + replacement.length);
        pushHistory();
        sync();
      };
      textarea.addEventListener("input", () => {
        requestPreviewReveal();
        pushHistory();
        sync();
      });
      textarea.addEventListener("scroll", syncScroll);
      textarea.addEventListener("click", () => renderEditorSurface({ revealPreview: true }));
      textarea.addEventListener("focus", () => renderEditorSurface({ revealPreview: true }));
      textarea.addEventListener("blur", () => {
        if (validateProblemXmlSilently(textarea.value, route, sourcePath)) {
          formatEditorValue();
        }
      });
      textarea.addEventListener("keyup", () => renderEditorSurface({ revealPreview: true }));
      textarea.addEventListener("mouseup", () => renderEditorSurface({ revealPreview: true }));
      textarea.addEventListener("select", () => renderEditorSurface({ revealPreview: true }));
      textarea.addEventListener("keydown", (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault();
          if (!contribute.disabled) contribute.click();
          return;
        }
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
          event.preventDefault();
          if (!contribute.disabled) contribute.click();
          return;
        }
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
          event.preventDefault();
          applyHistory(historyIndex + (event.shiftKey ? 1 : -1));
          return;
        }
        if (event.key === "Tab") {
          event.preventDefault();
          if (event.shiftKey) {
            removeIndent();
          } else {
            insertIndent();
          }
          return;
        }
        window.requestAnimationFrame(() => renderEditorSurface({ revealPreview: true }));
      });
      versions.addEventListener("change", () => {
        const version = versionEntries[Number(versions.value)];
        if (!version) return;
        setEditorValue(version.xml);
        status.dataset.state = "success";
        status.textContent = "";
      });
      close.addEventListener("click", togglePanelCollapse);
      back.addEventListener("click", () => applyHistory(historyIndex - 1));
      forward.addEventListener("click", () => applyHistory(historyIndex + 1));
      contribute.addEventListener("click", () => {
        if (contribute.disabled) return;
        formatEditorValue();
        if (textarea.value === originalXml) {
          sync();
          updateStateIndicator("clean");
          return;
        }
        const problem = validateEditorXml(textarea.value, route, sourcePath, status);
        if (!problem) return;
        currentPreviewProblem = problem;
        renderEditorSurface();
        onPreview?.(problem, cancelEditing, editorApi);
        renderEditorSurface();
        openSaveReviewModal({
          afterProblem: problem,
          afterXml: textarea.value,
          beforeProblem: validateProblemXmlSilently(originalXml, route, sourcePath),
          beforeXml: originalXml,
          language,
          onConfirm: async () => {
            const result = await publishXmlToGitHub({
              mode,
              route,
              sourcePath,
              xmlText: textarea.value
            });
            originalXml = textarea.value;
            history = [originalXml];
            historyIndex = 0;
            refreshHistoryButtons();
            sync();
            updateStateIndicator("clean");
            status.dataset.state = "success";
            status.textContent = result.prUrl && result.requiresManualReview ? language === "en" ? `Pull request created for manual review: ${result.prUrl}` : `\uC218\uB3D9 \uC2EC\uC0AC\uC6A9 Pull Request \uC0DD\uC131\uB428: ${result.prUrl}` : result.prUrl ? language === "en" ? `Saved and merged: ${result.prUrl}` : `\uC800\uC7A5 \uBC0F \uBA38\uC9C0 \uC644\uB8CC: ${result.prUrl}` : "";
            await refreshVersionHistory();
          },
          route
        });
      });
      refreshHistoryButtons();
      sync();
      textarea.setSelectionRange(0, 0);
      textarea.scrollTop = 0;
      textarea.scrollLeft = 0;
      renderEditorSurface();
      textarea.focus({ preventScroll: true });
      void refreshVersionHistory();
    }
    function cancelActiveEditSession() {
      const cancel = activeEditorCancel;
      activeEditorCancel = null;
      cancel?.();
      closeExistingSideEditor();
    }
    function closeExistingSideEditor(options = {}) {
      activeEditorCancel = null;
      activeEditRouteKey = "";
      setEditingFavicon(false);
      document.querySelectorAll(".coderoot-review-overlay").forEach((overlay) => overlay.remove());
      document.querySelectorAll('.coderoot-side-section[data-coderoot-created-panel="true"]').forEach((panel) => panel.remove());
      activeInsertedDivider?.remove();
      activeInsertedDivider = null;
      if (activeOriginalEditorPanel) {
        const state = activeOriginalEditorPanel;
        const panel = state.panel;
        panel.replaceChildren(...state.children);
        panel.className = state.className;
        if (state.style === null) {
          panel.removeAttribute("style");
        } else {
          panel.setAttribute("style", state.style);
        }
        delete panel.dataset.coderootSidePanel;
        activeOriginalEditorPanel = null;
        if (options.triggerOriginalClose) {
          window.setTimeout(() => state.closeButton?.click(), 0);
        }
      }
    }
    async function createSideEditorPanel(article) {
      const base = findBaseLayout(article);
      let original = base ? findOriginalEditorPanel(base) : null;
      if (base && (!original || isEditorPanelCollapsed(original))) {
        const opener = findOriginalEditorOpenButton(base);
        opener?.click();
        if (opener) {
          await sleep(180);
          original = findOriginalEditorPanel(base) || original;
        }
      }
      if (original) {
        activeOriginalEditorPanel = {
          panel: original,
          children: Array.from(original.childNodes),
          className: original.className,
          style: original.getAttribute("style"),
          closeButton: findOriginalEditorCloseButton(original)
        };
        original.classList.add("coderoot-side-host-panel");
        original.dataset.coderootSidePanel = "true";
        original.style.setProperty("flex", "0 0 clamp(520px, 48vw, 920px)", "important");
        original.style.setProperty("max-width", "clamp(520px, 48vw, 920px)", "important");
        original.style.setProperty("min-width", "min(520px, calc(100vw - 24px))", "important");
        original.style.setProperty("transform", "translateX(0px)", "important");
        original.style.setProperty("width", "clamp(520px, 48vw, 920px)", "important");
        delete original.dataset.coderootCollapsed;
        original.replaceChildren();
        return original;
      }
      const panel = document.createElement("section");
      panel.className = "coderoot-side-section";
      panel.dataset.coderootSidePanel = "true";
      panel.dataset.coderootCreatedPanel = "true";
      const divider = document.createElement("div");
      divider.className = "coderoot-side-divider";
      activeInsertedDivider = divider;
      if (base) {
        base.append(divider, panel);
        return panel;
      }
      const fallbackParent = article?.parentElement || document.body;
      fallbackParent.append(panel);
      return panel;
    }
    function sleep(ms) {
      return new Promise((resolve) => window.setTimeout(resolve, ms));
    }
    function isEditorPanelCollapsed(panel) {
      if (!panel) return true;
      const rect = panel.getBoundingClientRect();
      const style = window.getComputedStyle(panel);
      return style.display === "none" || style.visibility === "hidden" || rect.width < 260 || rect.right < 80 || rect.left > window.innerWidth - 80;
    }
    function findOriginalEditorOpenButton(base) {
      const candidates = Array.from(document.querySelectorAll("button")).filter((button) => !button.closest("[data-coderoot-root]") && !button.closest("[data-coderoot-editor]"));
      const textMatch = candidates.find((button) => {
        const text = normalizeText(button.textContent);
        const label = normalizeText(button.getAttribute("aria-label"));
        return text === "\uC5D0\uB514\uD130" || text === "Editor" || label.includes("\uC5D0\uB514\uD130") || label.toLowerCase().includes("editor");
      });
      if (textMatch) return textMatch;
      const baseButtons = Array.from(base.querySelectorAll("button"));
      return baseButtons.find((button) => {
        const html = String(button.innerHTML || "");
        const text = normalizeText(button.textContent);
        return text === "\uC5D0\uB514\uD130" || html.includes("chevron-left") || html.includes("chevrons-left");
      }) || null;
    }
    function findOriginalEditorCloseButton(panel) {
      const buttons = Array.from(panel.querySelectorAll("button"));
      return buttons.find((button) => {
        const text = normalizeText(button.textContent);
        const label = normalizeText(button.getAttribute("aria-label"));
        const svgText = String(button.innerHTML || "");
        return label.includes("\uB2EB") || label.toLowerCase().includes("close") || text === "\xBB" || svgText.includes("chevrons-right");
      }) || buttons[0] || null;
    }
    function findBaseLayout(article) {
      let node = article;
      while (node) {
        if (node.tagName === "SECTION" && node.id === "base") return node;
        node = node.parentElement;
      }
      const section = article?.closest("section");
      if (section?.parentElement?.tagName === "SECTION") return section.parentElement;
      return null;
    }
    function findOriginalEditorPanel(base) {
      const sections = Array.from(base.children).filter((child) => child.tagName === "SECTION");
      return sections.find((section) => {
        if (section.classList.contains("coderoot-side-section")) return false;
        const text = normalizeText(section.textContent);
        return section.querySelector(".monaco-editor") || section.querySelector("[data-mode-id]") || text.includes("\uCF54\uB4DC \uCD08\uAE30\uD654") || text.includes("Code Reset");
      }) || null;
    }
    function renderPreviewRoot({ root, article, problem, route, onCancel, editorApi }) {
      root.className = "coderoot-shell coderoot-live-preview";
      root.dataset.coderootRoot = "true";
      root.dataset.coderootKey = routeKey(route);
      root.dataset.coderootSlug = route.slug;
      root.dataset.coderootLanguage = problem.language;
      root.dataset.coderootConceptLanguage = route.conceptLanguage;
      root.dataset.coderootSource = problem.sourcePath;
      root.dataset.coderootExpanded = "true";
      root.dataset.coderootStatus = "preview";
      const banner = document.createElement("div");
      banner.className = "coderoot-info coderoot-preview-banner";
      const icon = document.createElement("div");
      icon.className = "coderoot-info-icon";
      icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-info" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>`;
      const bannerText = document.createElement("p");
      bannerText.textContent = problem.language === "en" ? "Preview mode. XML edits are reflected live, and clicking a preview block jumps to the matching tag." : "\uBBF8\uB9AC\uBCF4\uAE30 \uBAA8\uB4DC\uC785\uB2C8\uB2E4. XML \uC218\uC815 \uB0B4\uC6A9\uC774 \uC2E4\uC2DC\uAC04\uC73C\uB85C \uBC18\uC601\uB418\uBA70, \uBE14\uB85D\uC744 \uD074\uB9AD\uD558\uBA74 \uC5F0\uACB0\uB41C \uD0DC\uADF8\uB85C \uC774\uB3D9\uD569\uB2C8\uB2E4.";
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "coderoot-edit-button coderoot-preview-cancel";
      cancel.dataset.coderootCancel = "true";
      cancel.textContent = problem.language === "en" ? "Cancel Edit" : "\uC218\uC815 \uCDE8\uC18C";
      cancel.addEventListener("click", () => onCancel?.());
      banner.append(icon, bannerText, cancel);
      const panel = document.createElement("div");
      panel.className = "coderoot-panel";
      const meta = document.createElement("p");
      meta.className = "coderoot-meta";
      meta.textContent = problem.badge;
      decoratePreviewScope(meta, {
        sourceKey: "meta-badge",
        sourceRange: problem.badgeRange,
        sourceTag: "badge"
      });
      const title = document.createElement("h2");
      title.className = "coderoot-title";
      title.textContent = problem.title;
      decoratePreviewScope(title, {
        sourceKey: "meta-title",
        sourceRange: problem.titleRange,
        sourceTag: "title"
      });
      const content = document.createElement("div");
      content.className = "coderoot-content";
      problem.blocks.forEach((block) => content.append(renderBlock(block)));
      panel.append(meta, title, content);
      root.replaceChildren(banner, panel);
      wirePreviewBlockInteractions(root, problem, editorApi);
      article.classList.add("coderoot-article");
      article.dataset.coderootExpanded = "true";
      article.dataset.coderootEditing = "true";
      article.closest("div")?.classList.add("coderoot-card-expanded");
      requestAnimationFrame(() => updateGradientTop(root, article));
    }
    function renderInvalidPreviewRoot({ root, article, route, message, onCancel }) {
      root.className = "coderoot-shell coderoot-live-preview coderoot-preview-invalid";
      root.dataset.coderootRoot = "true";
      root.dataset.coderootKey = routeKey(route);
      root.dataset.coderootSlug = route.slug;
      root.dataset.coderootLanguage = route.language;
      root.dataset.coderootConceptLanguage = route.conceptLanguage;
      root.dataset.coderootStatus = "invalid-preview";
      const panel = document.createElement("div");
      panel.className = "coderoot-missing-panel";
      const badge = document.createElement("p");
      badge.className = "coderoot-missing-badge";
      badge.textContent = route.language === "en" ? "Preview paused" : "\uBBF8\uB9AC\uBCF4\uAE30 \uB300\uAE30 \uC911";
      const title = document.createElement("h2");
      title.className = "coderoot-missing-title";
      title.textContent = route.language === "en" ? "Fix the XML to render the preview." : "XML\uC744 \uC218\uC815\uD558\uBA74 \uC774\uACF3\uC5D0 \uBBF8\uB9AC\uBCF4\uAE30\uAC00 \uD45C\uC2DC\uB429\uB2C8\uB2E4.";
      const body = document.createElement("p");
      body.className = "coderoot-missing-text";
      body.textContent = message || (route.language === "en" ? "The current XML is not renderable yet." : "\uD604\uC7AC XML\uC740 \uC544\uC9C1 \uB80C\uB354\uB9C1\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "coderoot-edit-button coderoot-edit-button-inline";
      cancel.dataset.coderootCancel = "true";
      cancel.textContent = route.language === "en" ? "Cancel Edit" : "\uC218\uC815 \uCDE8\uC18C";
      cancel.addEventListener("click", () => onCancel?.());
      panel.append(badge, title, body, cancel);
      root.replaceChildren(panel);
      article.classList.add("coderoot-article");
      article.dataset.coderootExpanded = "true";
      article.dataset.coderootEditing = "true";
      article.closest("div")?.classList.add("coderoot-card-expanded");
      requestAnimationFrame(() => updateGradientTop(root, article));
    }
    function wirePreviewBlockInteractions(root, problem, editorApi) {
      if (!editorApi) return;
      root.querySelectorAll("[data-coderoot-preview-block]").forEach((element) => {
        const sourceKey = element.dataset.coderootPreviewKey || element.dataset.coderootPreviewBlock;
        const scope = getScopeByKey(problem, sourceKey);
        if (!scope?.sourceRange) return;
        element.addEventListener("mouseenter", () => {
          editorApi.setScopeIndex(sourceKey);
          editorApi.revealLine?.(scope.sourceRange.startLine);
        });
        element.addEventListener("mouseleave", () => editorApi.clearScopeIndex(sourceKey));
        element.addEventListener("click", (event) => {
          if (event.target?.closest?.("button, a")) return;
          editorApi.goToLine(scope.sourceRange.startLine);
        });
      });
    }
    function highlightPreviewBlock(root, sourceKey) {
      root.querySelectorAll("[data-coderoot-preview-block]").forEach((element) => {
        const key = element.dataset.coderootPreviewKey || element.dataset.coderootPreviewBlock;
        const active = sourceKey !== null && sourceKey !== void 0 && key === String(sourceKey);
        element.dataset.coderootScopeActive = active ? "true" : "false";
      });
    }
    function revealPreviewBlock(root, sourceKey) {
      if (sourceKey === null || sourceKey === void 0) return;
      const target = Array.from(root.querySelectorAll("[data-coderoot-preview-block]")).find((element) => {
        const key = element.dataset.coderootPreviewKey || element.dataset.coderootPreviewBlock;
        return key === String(sourceKey);
      });
      if (!target || isMostlyInViewport(target)) return;
      target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    }
    function isMostlyInViewport(element) {
      const rect = element.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
      const verticalPadding = Math.min(120, viewportHeight * 0.18);
      return rect.top >= verticalPadding && rect.bottom <= viewportHeight - verticalPadding && rect.left >= 0 && rect.right <= viewportWidth;
    }
    function getActiveLine(textarea) {
      const value = textarea.value || "";
      const selectionStart = Math.max(0, Math.min(value.length, textarea.selectionStart || 0));
      return value.slice(0, selectionStart).split("\n").length;
    }
    function createLineNumbers(xmlText, activeLine = 1, scopeBlock = null, editorError = null) {
      const count = Math.max(1, String(xmlText).split("\n").length);
      return Array.from({ length: count }, (_value, index) => {
        const line = index + 1;
        const classNames = ["coderoot-side-gutter-line"];
        if (isLineInSourceRange(line, scopeBlock?.sourceRange)) classNames.push("coderoot-side-gutter-line-scope");
        if (line === editorError?.line) classNames.push("coderoot-side-gutter-line-error");
        if (line === activeLine) classNames.push("coderoot-side-gutter-line-active");
        const className = classNames.join(" ");
        const title = line === editorError?.line ? ` title="${escapeHtml(editorError.message)}"` : "";
        return `<span class="${className}"${title}>${line}</span>`;
      }).join("");
    }
    function offsetForLine(text, line) {
      const targetLine = Math.max(1, Number(line) || 1);
      if (targetLine === 1) return 0;
      let offset = 0;
      for (let currentLine = 1; currentLine < targetLine; currentLine += 1) {
        const nextBreak = String(text).indexOf("\n", offset);
        if (nextBreak === -1) return String(text).length;
        offset = nextBreak + 1;
      }
      return offset;
    }
    function getPreviewScopes(problem) {
      if (!problem) return [];
      const scopes = [];
      if (problem.badgeRange) {
        scopes.push({
          sourceKey: "meta-badge",
          sourceRange: problem.badgeRange,
          sourceTag: "badge"
        });
      }
      if (problem.titleRange) {
        scopes.push({
          sourceKey: "meta-title",
          sourceRange: problem.titleRange,
          sourceTag: "title"
        });
      }
      return scopes.concat(problem.blocks || []);
    }
    function getScopeByKey(problem, sourceKey) {
      if (!problem || sourceKey === null || sourceKey === void 0) return null;
      const key = String(sourceKey);
      return getPreviewScopes(problem).find((scope) => String(scope.sourceKey ?? scope.sourceIndex) === key) || null;
    }
    function findScopeByLine(problem, line) {
      if (!problem) return null;
      return getPreviewScopes(problem).find((scope) => isLineInSourceRange(line, scope.sourceRange)) || null;
    }
    function validateEditorXml(xmlText, route, sourcePath, status, options = {}) {
      try {
        const problem = {
          ...parseProblemXml(xmlText, route, sourcePath),
          xmlText
        };
        status.dataset.state = "success";
        delete status.dataset.errorLine;
        delete status.dataset.errorColumn;
        status.textContent = "";
        return problem;
      } catch (error) {
        status.dataset.state = "error";
        if (error.line) {
          status.dataset.errorLine = String(error.line);
        } else {
          delete status.dataset.errorLine;
        }
        if (error.column) {
          status.dataset.errorColumn = String(error.column);
        } else {
          delete status.dataset.errorColumn;
        }
        status.textContent = error.message || (route.language === "en" ? "The XML is not valid." : "XML\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
        return null;
      }
    }
    function editorErrorFromStatus(status) {
      const line = Number(status.dataset.errorLine || 0);
      if (!line) return null;
      return {
        column: Number(status.dataset.errorColumn || 0) || null,
        line,
        message: status.textContent || ""
      };
    }
    function validateProblemXmlSilently(xmlText, route, sourcePath) {
      try {
        return {
          ...parseProblemXml(xmlText, route, sourcePath),
          xmlText
        };
      } catch {
        return null;
      }
    }
    function openSaveReviewModal({ afterProblem, afterXml, beforeProblem, beforeXml, language, onConfirm, route }) {
      document.querySelectorAll(".coderoot-review-overlay").forEach((overlay2) => overlay2.remove());
      const overlay = document.createElement("div");
      overlay.className = "coderoot-review-overlay";
      const dialog = document.createElement("section");
      dialog.className = "coderoot-review-dialog";
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      const header = document.createElement("div");
      header.className = "coderoot-review-header";
      const heading = document.createElement("div");
      heading.className = "coderoot-review-heading";
      const title = document.createElement("h2");
      title.textContent = language === "en" ? "Review before saving" : "\uC800\uC7A5 \uC804 \uBCC0\uACBD\uC0AC\uD56D \uD655\uC778";
      const subtitle = document.createElement("p");
      subtitle.textContent = language === "en" ? "Check the exact diff, then switch to the rendered preview before saving." : "\uC815\uD655\uD55C \uBCC0\uACBD\uC810\uC744 \uD655\uC778\uD55C \uB4A4 \uB80C\uB354\uB9C1\uB41C \uBBF8\uB9AC\uBCF4\uAE30\uB3C4 \uD568\uAED8 \uD655\uC778\uD558\uC138\uC694.";
      heading.append(title, subtitle);
      const close = document.createElement("button");
      close.type = "button";
      close.className = "coderoot-review-icon-button";
      close.title = language === "en" ? "Close (Esc)" : "\uB2EB\uAE30 (Esc)";
      close.setAttribute("aria-label", close.title);
      close.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>`;
      header.append(heading, close);
      const filePath = afterProblem?.sourcePath || beforeProblem?.sourcePath || getRouteContentPath(route);
      const xmlPane = document.createElement("div");
      xmlPane.className = "coderoot-review-pane";
      xmlPane.dataset.active = "true";
      const previewPane = document.createElement("div");
      previewPane.className = "coderoot-review-pane";
      previewPane.dataset.active = "false";
      const body = document.createElement("div");
      body.className = "coderoot-review-body";
      body.append(xmlPane, previewPane);
      const footer = document.createElement("div");
      footer.className = "coderoot-review-footer";
      const error = document.createElement("p");
      error.className = "coderoot-review-save-error";
      const save = document.createElement("button");
      save.type = "button";
      save.className = "coderoot-review-primary";
      save.title = language === "en" ? "Save (\u2318+\u21B5 / Ctrl+\u21B5)" : "\uC800\uC7A5\uD558\uAE30 (\u2318+\u21B5 / Ctrl+\u21B5)";
      save.setAttribute("aria-label", save.title);
      save.innerHTML = `<span>${language === "en" ? "Save" : "\uC800\uC7A5\uD558\uAE30"}</span><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 13v8"></path><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"></path><path d="m8 17 4-4 4 4"></path></svg>`;
      footer.append(error, save);
      const setActivePane = (target) => {
        const showXml = target === "xml";
        xmlPane.dataset.active = String(showXml);
        previewPane.dataset.active = String(!showXml);
      };
      xmlPane.append(renderXmlDiff(beforeXml, afterXml, filePath, language, () => setActivePane("preview")));
      previewPane.append(renderPreviewDiff(beforeProblem, afterProblem, language, route, () => setActivePane("xml")));
      const closeModal = () => {
        document.removeEventListener("keydown", handleModalKeydown, true);
        overlay.remove();
      };
      let saving = false;
      const confirmSave = async () => {
        if (saving) return;
        saving = true;
        error.textContent = "";
        save.disabled = true;
        save.querySelector("span").textContent = language === "en" ? "Saving..." : "\uC800\uC7A5 \uC911...";
        try {
          await onConfirm?.();
          closeModal();
        } catch (saveError) {
          error.textContent = saveError?.coderootSilent ? "" : saveError?.message || (language === "en" ? "Save failed." : "\uC800\uC7A5\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.");
          save.disabled = false;
          save.querySelector("span").textContent = language === "en" ? "Save" : "\uC800\uC7A5\uD558\uAE30";
          saving = false;
        }
      };
      const handleModalKeydown = (event) => {
        if (!document.body.contains(overlay)) {
          document.removeEventListener("keydown", handleModalKeydown, true);
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          closeModal();
          return;
        }
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          confirmSave();
        }
      };
      close.addEventListener("click", closeModal);
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) closeModal();
      });
      save.addEventListener("click", confirmSave);
      document.addEventListener("keydown", handleModalKeydown, true);
      dialog.append(header, body, footer);
      overlay.append(dialog);
      document.body.append(overlay);
    }
    function getRouteContentPath(route) {
      return `${CONTENT_DIR}/${route.slug}/${route.contentConceptKey || getContentConceptKey(route.conceptLanguageKey)}.${route.language}.xml`;
    }
    function createReviewModeButton(label, onClick) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "coderoot-review-mode-button";
      button.textContent = label;
      button.addEventListener("click", onClick);
      return button;
    }
    function renderXmlDiff(beforeXml, afterXml, filePath, language, onPreview) {
      const wrapper = document.createElement("div");
      wrapper.className = "coderoot-review-diff";
      const file = document.createElement("div");
      file.className = "coderoot-review-file-header";
      const fileName = document.createElement("p");
      fileName.className = "coderoot-review-file-name";
      fileName.textContent = filePath;
      file.append(fileName, createReviewModeButton(language === "en" ? "Preview" : "\uBBF8\uB9AC\uBCF4\uAE30", onPreview));
      const code = document.createElement("div");
      code.className = "coderoot-review-code";
      const lines = document.createElement("div");
      lines.className = "coderoot-review-code-lines";
      lines.append(...buildUnifiedDiff(beforeXml, afterXml).map(renderUnifiedDiffRow));
      code.append(lines);
      wrapper.append(file, code);
      return wrapper;
    }
    function renderUnifiedDiffRow(row) {
      const line = document.createElement("div");
      line.className = `coderoot-review-line coderoot-review-line-${row.type}`;
      if (row.type === "hunk") {
        const hunk = document.createElement("span");
        hunk.className = "coderoot-review-hunk";
        hunk.textContent = row.text;
        line.append(hunk);
        return line;
      }
      const oldNumber = document.createElement("span");
      oldNumber.className = "coderoot-review-line-number";
      oldNumber.textContent = row.oldLine ? String(row.oldLine) : "";
      const newNumber = document.createElement("span");
      newNumber.className = "coderoot-review-line-number";
      newNumber.textContent = row.newLine ? String(row.newLine) : "";
      const marker = document.createElement("span");
      marker.className = "coderoot-review-marker";
      marker.textContent = row.type === "add" ? "+" : row.type === "remove" ? "-" : "";
      const code = document.createElement("span");
      code.className = "coderoot-review-line-code";
      appendDiffText(code, row.fragments, row.text);
      line.append(oldNumber, newNumber, marker, code);
      return line;
    }
    function appendDiffText(parent, fragments, fallbackText) {
      const list = fragments?.length ? fragments : [{ text: fallbackText ?? "", changed: false }];
      list.forEach((fragment) => {
        if (!fragment.changed) {
          parent.append(document.createTextNode(fragment.text));
          return;
        }
        const span = document.createElement("span");
        span.className = "coderoot-review-inline-change";
        span.textContent = fragment.text;
        parent.append(span);
      });
    }
    function renderPreviewDiff(beforeProblem, afterProblem, language, route, onXml) {
      const wrapper = document.createElement("div");
      wrapper.className = "coderoot-review-preview-shell";
      const header = document.createElement("div");
      header.className = "coderoot-review-file-header coderoot-review-preview-header";
      const labels = document.createElement("div");
      labels.className = "coderoot-review-preview-heading-grid";
      const beforeLabel = document.createElement("p");
      beforeLabel.textContent = language === "en" ? "Before" : "\uC774\uC804";
      const afterLabel = document.createElement("p");
      afterLabel.textContent = language === "en" ? "After" : "\uC774\uD6C4";
      labels.append(beforeLabel, afterLabel);
      header.append(labels, createReviewModeButton(language === "en" ? "XML diff" : "XML \uBCC0\uACBD\uC810", onXml));
      const grid = document.createElement("div");
      grid.className = "coderoot-review-preview-grid";
      grid.append(
        renderPreviewSnapshot(beforeProblem, route),
        renderPreviewSnapshot(afterProblem, route)
      );
      wrapper.append(header, grid);
      return wrapper;
    }
    function renderPreviewSnapshot(problem, route) {
      const section = document.createElement("section");
      section.className = "coderoot-review-preview";
      if (!problem) {
        const empty = document.createElement("p");
        empty.className = "coderoot-review-empty";
        empty.textContent = route.language === "en" ? "No previous renderable preview." : "\uC774\uC804\uC5D0 \uB80C\uB354\uB9C1\uD560 \uC218 \uC788\uB294 \uBBF8\uB9AC\uBCF4\uAE30\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.";
        section.append(empty);
        return section;
      }
      const meta = document.createElement("p");
      meta.className = "coderoot-meta";
      meta.textContent = problem.badge;
      const title = document.createElement("h2");
      title.className = "coderoot-title";
      title.textContent = problem.title;
      const content = document.createElement("div");
      content.className = "coderoot-content";
      problem.blocks.forEach((block) => content.append(renderBlock(block)));
      section.append(meta, title, content);
      return section;
    }
    function updateGradientTop(root, article) {
      const rootBox = root.getBoundingClientRect();
      const articleBox = article.getBoundingClientRect();
      const scrollTop = article.scrollTop || 0;
      const top = Math.max(0, rootBox.top - articleBox.top + scrollTop - 2);
      article.style.setProperty("--coderoot-gradient-top", `${top}px`);
    }
    function renderBlock(block) {
      let element;
      if (block.type === "heading") {
        const level = block.level === 4 ? "h4" : "h3";
        const heading = document.createElement(level);
        heading.className = "coderoot-heading";
        heading.textContent = block.text;
        element = heading;
        return decoratePreviewBlock(element, block);
      }
      if (block.type === "list") {
        const list = document.createElement(block.ordered ? "ol" : "ul");
        list.className = "coderoot-list";
        block.items.forEach((item) => {
          const li = document.createElement("li");
          appendInline(li, item);
          list.append(li);
        });
        element = list;
        return decoratePreviewBlock(element, block);
      }
      if (block.type === "code") {
        element = renderCodeBlock(block);
        return decoratePreviewBlock(element, block);
      }
      if (block.type === "callout") {
        const callout = document.createElement("div");
        callout.className = "coderoot-callout";
        callout.dataset.tone = block.tone || "default";
        appendInline(callout, block.children);
        element = callout;
        return decoratePreviewBlock(element, block);
      }
      const paragraph = document.createElement("p");
      paragraph.className = "coderoot-paragraph";
      appendInline(paragraph, block.children);
      element = paragraph;
      return decoratePreviewBlock(element, block);
    }
    function decoratePreviewBlock(element, block) {
      return decoratePreviewScope(element, {
        sourceKey: block.sourceKey || `content-${block.sourceIndex ?? ""}`,
        sourceRange: block.sourceRange,
        sourceTag: block.sourceRange?.tagName || block.type || ""
      });
    }
    function decoratePreviewScope(element, scope) {
      element.dataset.coderootPreviewBlock = String(scope.sourceKey || "");
      element.dataset.coderootPreviewKey = String(scope.sourceKey || "");
      element.dataset.coderootSourceTag = scope.sourceTag || scope.sourceRange?.tagName || "";
      if (scope.sourceRange) {
        element.dataset.coderootSourceStart = String(scope.sourceRange.startLine);
        element.dataset.coderootSourceEnd = String(scope.sourceRange.endLine);
      }
      return element;
    }
    function appendInline(parent, children = []) {
      children.forEach((child) => {
        if (typeof child === "string") {
          parent.append(document.createTextNode(child));
          return;
        }
        if (child?.type === "code") {
          const code = document.createElement("code");
          code.textContent = child.text;
          parent.append(code);
          return;
        }
        if (child?.type === "strong") {
          const strong = document.createElement("strong");
          appendInline(strong, child.children);
          parent.append(strong);
          return;
        }
        if (child?.type === "em") {
          const em = document.createElement("em");
          appendInline(em, child.children);
          parent.append(em);
          return;
        }
        if (child?.type === "br") {
          parent.append(document.createElement("br"));
          return;
        }
        if (child?.type === "link") {
          const href = child.href || "";
          const link = document.createElement("a");
          link.rel = "noreferrer noopener";
          link.target = "_blank";
          link.href = /^(https?:)?\/\//.test(href) ? href : "#";
          appendInline(link, child.children);
          parent.append(link);
        }
      });
    }
    function renderCodeBlock(block) {
      const wrapper = document.createElement("div");
      wrapper.className = "coderoot-code-block mt-8 bg-neutral-50 dark:bg-neutral-800 rounded-8 border border-stroke-lighter dark:border-neutral-600 relative group";
      const copyWrap = document.createElement("div");
      copyWrap.className = "coderoot-copy-wrap";
      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "coderoot-copy";
      const copyLabel = getUiLanguage() === "en" ? "Copy" : "\uBCF5\uC0AC";
      copy.title = copyLabel;
      copy.setAttribute("aria-label", copyLabel);
      copy.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-copy" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>`;
      copy.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(block.code);
          copy.dataset.copied = "true";
          window.setTimeout(() => {
            delete copy.dataset.copied;
          }, 900);
        } catch {
          copy.dataset.failed = "true";
          window.setTimeout(() => {
            delete copy.dataset.failed;
          }, 900);
        }
      });
      const flex = document.createElement("div");
      flex.className = "flex";
      const pre = document.createElement("pre");
      pre.className = "py-12 px-16 pr-20 flex w-fit whitespace-pre break-keep";
      const code = document.createElement("code");
      code.className = block.language ? `language-${block.language} code-highlight` : "code-highlight";
      code.innerHTML = highlightCodeBlock(block.code, block.language);
      pre.append(code);
      flex.append(pre);
      copyWrap.append(copy);
      wrapper.append(copyWrap, flex);
      return wrapper;
    }
    function highlightCodeBlock(code, language = "") {
      const isCpp = /^(c\+\+|cpp|cc|cxx)$/i.test(language || "");
      return String(code || "").split("\n").map((line) => {
        const highlighted = isCpp ? highlightCppLine(line) : escapeHtml(line);
        return `<span class="code-line">${highlighted}
</span>`;
      }).join("");
    }
    function highlightCppLine(line) {
      const escaped = escapeHtml(line);
      const leading = escaped.match(/^\s*/)?.[0] || "";
      const trimmed = escaped.slice(leading.length);
      if (trimmed.startsWith("#include")) {
        return `${leading}<span class="token macro property"><span class="token directive-hash">#</span><span class="token directive keyword">include</span>${trimmed.slice("#include".length).replace(/(&lt;.*?&gt;|&quot;.*?&quot;)/, '<span class="token string">$1</span>')}</span>`;
      }
      const protectedParts = [];
      const protect = (className) => (match) => {
        const token = `\uE000${String.fromCharCode(57600 + protectedParts.length)}\uE001`;
        protectedParts.push(`<span class="${className}">${match}</span>`);
        return token;
      };
      return escaped.replace(/\/\/.*$/g, protect("token comment")).replace(/(&quot;(?:\\.|[^\\])*?&quot;|'(?:\\.|[^\\])*?')/g, protect("token string")).replace(/\b(int|long|double|float|char|bool|void|return|if|else|for|while|using|namespace|include|const|auto|std)\b/g, protect("token keyword")).replace(/\b(\d+(?:\.\d+)?)\b/g, protect("token number")).replace(/\b([A-Za-z_]\w*)(?=\s*\()/g, protect("token function")).replace(/(&lt;&lt;|&gt;&gt;|==|!=|&lt;=|&gt;=|\+\+|--|\+|-|\*|\/|=|&lt;|&gt;)/g, protect("token operator")).replace(/([{}()[\];,.])/g, protect("token punctuation")).replace(/\uE000([\uE100-\uEFFF])\uE001/g, (_match, marker) => protectedParts[marker.charCodeAt(0) - 57600] || "");
    }
    if (!disableWatchers) {
      const observer = new MutationObserver(() => scheduleApply());
      observer.observe(document.documentElement, { childList: true, subtree: true });
      window.addEventListener("popstate", () => scheduleApply(0));
      window.addEventListener("hashchange", () => scheduleApply(0));
      window.setInterval(() => {
        const baseRoute = parseRoute();
        const targets = baseRoute ? findContentTargets(baseRoute) : null;
        const key = routeKey(baseRoute && targets ? withDetectedConceptLanguage(baseRoute, targets.contentRoot) : baseRoute);
        if (key !== lastRouteKey) scheduleApply(0);
      }, ROUTE_CHECK_MS);
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => scheduleApply(0), { once: true });
    } else {
      scheduleApply(0);
    }
  })();
})();
