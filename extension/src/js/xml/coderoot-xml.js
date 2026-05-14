import { escapeHtml, escapeRegExp, escapeXml, normalizeText } from "../utils/text.js";

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
    const where =
      route.language === "en"
        ? `line ${line}${column ? `, column ${column}` : ""}`
        : `${line}번째 줄${column ? `, ${column}번째 칸` : ""}`;
    const message =
      route.language === "en"
        ? `XML syntax error at ${where}: ${rawMessage || `Check ${xmlPath}.`}`
        : `XML 문법 오류: ${where}. ${rawMessage || `${xmlPath}를 확인하세요.`}`;
    const error = new Error(message);
    error.line = line;
    error.column = column;
    return error;
  }

  function normalizeXmlParserMessage(message) {
    const text = normalizeText(message)
      .replace(/^This page contains the following errors:\s*/i, "")
      .replace(/\s*Below is a rendering of the page up to the first error\.\s*$/i, "");
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
    return language === "en" ? `${route.conceptLanguage} deep dive` : `${route.conceptLanguage} 심화 노트`;
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
        items: Array.from(node.children)
          .filter((child) => child.tagName.toLowerCase() === "li")
          .map((item) => parseInlineNodes(item))
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
    return Array.from(node.childNodes)
      .map((child) => {
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
      })
      .filter((child) => child !== "");
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
    return `<?xml version="1.0" encoding="UTF-8"?>\n${formatXmlElement(doc.documentElement, 0)}\n`;
  }

  function isXmlFormattedForSave(xmlText, formattedXml) {
    return normalizeXmlForLint(xmlText) === normalizeXmlForLint(formattedXml);
  }

  function normalizeXmlForLint(xmlText) {
    return String(xmlText || "")
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+$/gm, "")
      .trimEnd();
  }

  function formatXmlElement(element, depth) {
    const indent = "  ".repeat(depth);
    const tagName = element.tagName;
    const attrs = Array.from(element.attributes)
      .map((attr) => ` ${attr.name}="${escapeXmlAttribute(attr.value)}"`)
      .join("");

    if (isInlineXmlElement(element)) {
      return `${indent}<${tagName}${attrs}>${serializeInlineXmlChildren(element)}</${tagName}>`;
    }

    if (tagName.toLowerCase() === "code-block") {
      const code = Array.from(element.childNodes).map((child) => child.textContent || "").join("");
      const normalized = trimCodeBlock(code);
      return `${indent}<${tagName}${attrs}><![CDATA[${normalized}${normalized.endsWith("\n") ? "" : "\n"}]]></${tagName}>`;
    }

    const children = Array.from(element.childNodes)
      .map((child) => formatXmlNode(child, depth + 1))
      .filter(Boolean);

    if (!children.length) return `${indent}<${tagName}${attrs}></${tagName}>`;

    return `${indent}<${tagName}${attrs}>\n${children.join("\n")}\n${indent}</${tagName}>`;
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
    const attrs = Array.from(node.attributes)
      .map((attr) => ` ${attr.name}="${escapeXmlAttribute(attr.value)}"`)
      .join("");
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
    <title>심화 설명 제목</title>
    <badge>${escapeXml(defaultBadgeText("ko", route))}</badge>
  </meta>
  <content>
    <p>기존 설명에서 생략된 배경을 먼저 짚고, C++14 관점의 원리를 쉬운 문장으로 풀어 주세요.</p>

    <h3>핵심 아이디어</h3>
    <p>짧은 문법은 <code>inline code</code>로 쓰고, 완성된 예시는 code-block에 넣습니다.</p>

    <code-block language="cpp"><![CDATA[#include <iostream>
using namespace std;

int main() {
    cout << "example\\n";
    return 0;
}
]]></code-block>

    <callout tone="summary">마지막에는 학습자가 기억해야 할 실전 기준을 정리합니다.</callout>
  </content>
</coderoot>
`;
  }

export {
  createXmlTemplate,
  formatCoderootXml,
  highlightXml,
  isLineInSourceRange,
  isXmlFormattedForSave,
  parseProblemXml
};
