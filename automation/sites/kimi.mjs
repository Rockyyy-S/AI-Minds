import { dismissCommonOverlays } from "./shared/simple-chat.mjs";

const DEFAULT_TIMEOUT_MS = 180000;
const DEFAULT_SETTLE_INTERVAL_MS = 2000;
const DEFAULT_SETTLE_ROUNDS = 3;
const THINKING_MODEL_KEYWORD = "思考";

function shortTimeout(timeoutMs, fallbackMs = 10000) {
  const parsed = Number(timeoutMs || fallbackMs);
  return Math.min(parsed, fallbackMs);
}

function buildMarkdownExtractor(selector) {
  return (responseSelector) => {
    const mdRoot = Array.from(document.querySelectorAll(responseSelector)).at(-1);
    if (!mdRoot) {
      return "";
    }

    const renderInline = (node) => {
      if (!node) {
        return "";
      }

      if (node.nodeType === Node.TEXT_NODE) {
        return node.nodeValue || "";
      }

      if (node.nodeType !== Node.ELEMENT_NODE) {
        return "";
      }

      const tag = node.tagName.toLowerCase();

      if (tag === "br") {
        return "\n";
      }

      if (tag === "strong" || tag === "b") {
        return `**${Array.from(node.childNodes).map(renderInline).join("")}**`;
      }

      if (tag === "em" || tag === "i") {
        return `*${Array.from(node.childNodes).map(renderInline).join("")}*`;
      }

      if (tag === "code") {
        return `\`${node.innerText}\``;
      }

      if (tag === "a") {
        const text = Array.from(node.childNodes).map(renderInline).join("") || node.innerText || node.href;
        const href = node.getAttribute("href") || "";
        return href ? `[${text}](${href})` : text;
      }

      return Array.from(node.childNodes).map(renderInline).join("");
    };

    const cleanText = (text) =>
      text
        .replace(/\u00a0/g, " ")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

    const renderTable = (tableEl) => {
      const headers = Array.from(tableEl.querySelectorAll("thead th")).map((th) => th.innerText.trim());
      const rows = Array.from(tableEl.querySelectorAll("tbody tr")).map((tr) =>
        Array.from(tr.querySelectorAll("td")).map((td) => td.innerText.trim())
      );
      const escapeCell = (value) => value.replace(/\|/g, "\\|").replace(/\n/g, "<br>");
      const lines = [];

      if (headers.length) {
        lines.push(`| ${headers.map(escapeCell).join(" | ")} |`);
        lines.push(`| ${headers.map(() => "---").join(" | ")} |`);
      }

      for (const row of rows) {
        lines.push(`| ${row.map(escapeCell).join(" | ")} |`);
      }

      return lines.join("\n");
    };

    const renderList = (listEl) =>
      Array.from(listEl.querySelectorAll(":scope > li"))
        .map((li, index) => {
          const marker = listEl.tagName.toLowerCase() === "ol" ? `${index + 1}.` : "-";
          const content = cleanText(Array.from(li.childNodes).map(renderInline).join(""));
          return `${marker} ${content}`;
        })
        .join("\n");

    const renderBlock = (el) => {
      if (!el) {
        return "";
      }

      const tag = el.tagName.toLowerCase();

      if (/^h[1-6]$/.test(tag)) {
        const level = Number(tag[1]);
        return `${"#".repeat(level)} ${cleanText(renderInline(el))}`;
      }

      if (tag === "div" && el.classList.contains("paragraph")) {
        return cleanText(Array.from(el.childNodes).map(renderInline).join(""));
      }

      if (tag === "div" && el.classList.contains("segment-code")) {
        const lang = el.querySelector(".segment-code-lang")?.innerText.trim().toLowerCase() || "";
        const code = el.querySelector("pre, code")?.innerText.replace(/\u00a0/g, " ").replace(/\s+$/, "") || "";
        return `\`\`\`${lang}\n${code}\n\`\`\``;
      }

      if (tag === "div" && el.classList.contains("markdown-table")) {
        return renderTable(el);
      }

      if (tag === "ul" || tag === "ol") {
        return renderList(el);
      }

      return cleanText(el.innerText || "");
    };

    const parts = Array.from(mdRoot.children)
      .map(renderBlock)
      .map(cleanText)
      .filter(Boolean);

    return parts.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
  };
}

export const kimiSite = {
  id: "kimi",
  label: "Kimi",
  baseUrl: "https://www.kimi.com/",
  newChatUrl: "https://www.kimi.com/?chat_enter_method=new_chat",
  selectors: {
    composer: "div.chat-input-editor[role='textbox']",
    assistantMarkdown: ".chat-content-item-assistant .markdown",
    sidebarMask: ".sidebar-placeholder .mask",
    currentModel: ".current-model",
    modelItem: ".models-container .model-item",
    modelItemName: ".model-name .name"
  },
  async openFreshChat(page) {
    await page.goto(this.newChatUrl, { waitUntil: "domcontentloaded" });
    await dismissCommonOverlays(page, { timeoutMs: 3000 });
  },
  async ensureReady(page, timeoutMs = DEFAULT_TIMEOUT_MS) {
    await page.waitForSelector(this.selectors.composer, { timeout: timeoutMs });
    await dismissCommonOverlays(page, { timeoutMs: shortTimeout(timeoutMs, 3000) });
  },
  async captureAnswerState(page) {
    return page.evaluate((responseSelector) => {
      const items = Array.from(document.querySelectorAll(responseSelector));
      const latest = items.at(-1);
      return {
        count: items.length,
        text: latest ? latest.innerText.trim() : ""
      };
    }, this.selectors.assistantMarkdown);
  },
  async dismissSidebarMask(page) {
    await dismissCommonOverlays(page, { timeoutMs: 2000 });

    const mask = page.locator(this.selectors.sidebarMask).first();
    const isVisible = await mask.isVisible().catch(() => false);

    if (!isVisible) {
      return;
    }

    await mask.click({ timeout: 5000 }).catch(() => {});
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(300);
  },
  isThinkingModel(modelText) {
    return String(modelText || "").includes(THINKING_MODEL_KEYWORD);
  },
  async getCurrentModelText(page) {
    return page
      .locator(this.selectors.currentModel)
      .first()
      .innerText({ timeout: 5000 })
      .then((text) => text.replace(/\s+/g, " ").trim())
      .catch(() => "");
  },
  async clickModelSelector(page, timeoutMs) {
    const currentModel = page.locator(this.selectors.currentModel).first();
    await currentModel.waitFor({ state: "visible", timeout: shortTimeout(timeoutMs) });

    try {
      await currentModel.click({ timeout: shortTimeout(timeoutMs, 5000) });
    } catch {
      await currentModel.click({ timeout: shortTimeout(timeoutMs, 5000), force: true });
    }
  },
  async findThinkingModelItem(page, timeoutMs) {
    const items = page.locator(this.selectors.modelItem);
    await items.first().waitFor({ state: "visible", timeout: shortTimeout(timeoutMs) });

    const count = await items.count();
    for (let index = 0; index < count; index += 1) {
      const item = items.nth(index);
      const name = await item
        .locator(this.selectors.modelItemName)
        .first()
        .innerText({ timeout: 1000 })
        .then((text) => text.replace(/\s+/g, " ").trim())
        .catch(() => "");

      if (this.isThinkingModel(name)) {
        return item;
      }
    }

    const availableModels = await items
      .evaluateAll((elements) =>
        elements
          .map((element) => element.querySelector(".model-name .name")?.textContent?.replace(/\s+/g, " ").trim())
          .filter(Boolean)
      )
      .catch(() => []);

    throw new Error(
      `未找到 ${this.label} 思考模型选项。当前可选模型：${availableModels.join("、") || "未知"}`
    );
  },
  async ensureThinkingModel(page, timeoutMs = DEFAULT_TIMEOUT_MS) {
    await this.dismissSidebarMask(page);

    const currentText = await this.getCurrentModelText(page);
    if (this.isThinkingModel(currentText)) {
      return currentText;
    }

    try {
      await this.clickModelSelector(page, timeoutMs);
      const thinkingItem = await this.findThinkingModelItem(page, shortTimeout(timeoutMs, 15000));

      try {
        await thinkingItem.click({ timeout: shortTimeout(timeoutMs) });
      } catch {
        await thinkingItem.click({ timeout: shortTimeout(timeoutMs), force: true });
      }

      await page.waitForFunction(
        ({ selector, keyword }) => {
          const text = document.querySelector(selector)?.textContent || "";
          return text.includes(keyword);
        },
        { selector: this.selectors.currentModel, keyword: THINKING_MODEL_KEYWORD },
        { timeout: shortTimeout(timeoutMs, 30000) }
      );

      const selectedText = await this.getCurrentModelText(page);
      if (this.isThinkingModel(selectedText)) {
        return selectedText;
      }
    } catch {}

    const fallbackText = await this.getCurrentModelText(page);
    if (/K2\.6|K2\.5|Kimi/i.test(fallbackText)) {
      return `${fallbackText} / 当前可用最佳模型`;
    }

    throw new Error(`未能切换到 ${this.label} 思考模型，当前模型：${fallbackText || "未知"}`);
  },
  async prepareForPrompt(page, options = {}) {
    const model = await this.ensureThinkingModel(page, options.timeoutMs || DEFAULT_TIMEOUT_MS);
    return { model };
  },
  async submitPrompt(page, prompt) {
    const composer = page.locator(this.selectors.composer);
    await dismissCommonOverlays(page, { timeoutMs: 3000 });
    await this.dismissSidebarMask(page);
    await composer.focus();
    await page.keyboard.press("Control+A").catch(() => {});
    await page.keyboard.press("Backspace").catch(() => {});
    await page.keyboard.insertText(prompt);
    await page.keyboard.press("Enter");
  },
  async waitForAnswer(page, baselineState, options = {}) {
    const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
    const settleIntervalMs = Number(options.settleIntervalMs || DEFAULT_SETTLE_INTERVAL_MS);
    const settleRounds = Number(options.settleRounds || DEFAULT_SETTLE_ROUNDS);
    const minLength = Number(options.minLength || 1);
    const selector = this.selectors.assistantMarkdown;
    const normalizedBaseline =
      typeof baselineState === "number"
        ? { count: baselineState, text: "" }
        : {
            count: Number(baselineState?.count || 0),
            text: String(baselineState?.text || "")
          };

    await page.waitForFunction(
      ({ responseSelector, beforeCount, beforeText, minimumLength }) => {
        const items = Array.from(document.querySelectorAll(responseSelector));
        const latest = items.at(-1);
        const text = latest ? latest.innerText.trim() : "";
        const countChanged = items.length > beforeCount;
        const textChanged = text.length >= minimumLength && text !== beforeText;
        return countChanged || textChanged;
      },
      {
        responseSelector: selector,
        beforeCount: normalizedBaseline.count,
        beforeText: normalizedBaseline.text,
        minimumLength: minLength
      },
      { timeout: timeoutMs }
    );

    let previous = "";
    let stableRounds = 0;
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const { current, isGenerating } = await page.evaluate((responseSelector) => {
        const latest = Array.from(document.querySelectorAll(responseSelector)).at(-1);
        const stopVisible = Array.from(document.querySelectorAll("[class*='send-button'], [class*='stop']")).some(
          (element) => String(element.className || "").includes("stop") && element.getClientRects().length > 0
        );
        return {
          current: latest ? latest.innerText.trim() : "",
          isGenerating: stopVisible
        };
      }, selector);

      if (!isGenerating && current.length >= minLength && current === previous) {
        stableRounds += 1;
      } else {
        stableRounds = 0;
      }

      previous = current;

      if (stableRounds >= settleRounds) {
        const markdown = await page.evaluate(buildMarkdownExtractor(selector), selector);
        if (markdown.trim()) {
          return markdown.trim() + "\n";
        }
      }

      await page.waitForTimeout(settleIntervalMs);
    }

    throw new Error(`等待 ${this.label} 回答完成超时：${timeoutMs}ms`);
  }
};
