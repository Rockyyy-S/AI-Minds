import { dismissCommonOverlays, shortTimeout as sharedShortTimeout } from "./shared/simple-chat.mjs";

const DEFAULT_TIMEOUT_MS = 180000;
const DEFAULT_SETTLE_INTERVAL_MS = 2000;
const DEFAULT_SETTLE_ROUNDS = 3;

const EXPERT_MODEL_TYPE = "expert";
const THINKING_LABEL = "深度思考";
const SEARCH_LABEL = "智能搜索";

const PREFERENCE_STORAGE = {
  thinking: {
    key: "thinkingEnabled",
    value: true,
    version: "2"
  },
  search: {
    key: "searchEnabled",
    value: true,
    version: "0"
  }
};

function shortTimeout(timeoutMs, fallbackMs = 10000) {
  return sharedShortTimeout(timeoutMs, fallbackMs);
}

function buildMarkdownExtractor(selector) {
  return (responseSelector) => {
    const mdRoot = Array.from(document.querySelectorAll(responseSelector)).at(-1);
    if (!mdRoot) {
      return "";
    }

    const cleanText = (text) =>
      String(text || "")
        .replace(/\u00a0/g, " ")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

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

      if (tag === "code" && node.parentElement?.tagName.toLowerCase() !== "pre") {
        return `\`${node.innerText}\``;
      }

      if (tag === "a") {
        const text = Array.from(node.childNodes).map(renderInline).join("") || node.innerText || node.href;
        const href = node.getAttribute("href") || "";
        return href ? `[${text}](${href})` : text;
      }

      if (tag === "img") {
        return node.getAttribute("alt") || "";
      }

      return Array.from(node.childNodes).map(renderInline).join("");
    };

    const renderTable = (tableEl) => {
      const rows = Array.from(tableEl.querySelectorAll("tr")).map((tr) =>
        Array.from(tr.querySelectorAll("th, td")).map((cell) => cleanText(cell.innerText))
      );

      if (!rows.length) {
        return "";
      }

      const headers =
        rows.find((row) => row.length > 0) ||
        Array.from(tableEl.querySelectorAll("thead th")).map((th) => cleanText(th.innerText));

      const bodyRows = rows.slice(headers === rows[0] ? 1 : 0);
      const escapeCell = (value) => String(value || "").replace(/\|/g, "\\|").replace(/\n/g, "<br>");
      const lines = [];

      if (headers.length) {
        lines.push(`| ${headers.map(escapeCell).join(" | ")} |`);
        lines.push(`| ${headers.map(() => "---").join(" | ")} |`);
      }

      for (const row of bodyRows) {
        if (!row.length) {
          continue;
        }
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

    const renderCodeBlock = (el) => {
      const codeEl = el.matches("pre, code") ? el : el.querySelector("pre code, pre, code");
      const rawClassName = [el.className || "", codeEl?.className || ""].join(" ");
      const langClass = rawClassName
        .split(/\s+/)
        .find((name) => name.startsWith("language-"));
      const lang =
        (langClass ? langClass.replace(/^language-/, "") : "") ||
        el.getAttribute("data-language") ||
        codeEl?.getAttribute("data-language") ||
        "";
      const code = (codeEl?.innerText || el.innerText || "").replace(/\u00a0/g, " ").replace(/\s+$/, "");
      return `\`\`\`${String(lang).trim().toLowerCase()}\n${code}\n\`\`\``;
    };

    const renderBlock = (el) => {
      if (!el) {
        return "";
      }

      const tag = el.tagName.toLowerCase();

      if (/^h[1-6]$/.test(tag)) {
        const level = Number(tag[1]);
        return `${"#".repeat(level)} ${cleanText(renderInline(el))}`;
      }

      if (tag === "p" || (tag === "div" && el.classList.contains("ds-markdown-paragraph"))) {
        return cleanText(Array.from(el.childNodes).map(renderInline).join(""));
      }

      if (tag === "pre" || (tag === "div" && el.querySelector(":scope > pre"))) {
        return renderCodeBlock(el);
      }

      if (tag === "div" && el.classList.contains("segment-code")) {
        return renderCodeBlock(el);
      }

      if (tag === "table") {
        return renderTable(el);
      }

      if (tag === "div" && el.classList.contains("markdown-table-wrapper")) {
        const table = el.querySelector("table");
        return table ? renderTable(table) : cleanText(el.innerText || "");
      }

      if (tag === "ul" || tag === "ol") {
        return renderList(el);
      }

      if (tag === "blockquote") {
        return cleanText(el.innerText || "")
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n");
      }

      if (tag === "hr") {
        return "---";
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

export const deepseekSite = {
  id: "deepseek",
  label: "DeepSeek",
  baseUrl: "https://chat.deepseek.com/",
  selectors: {
    composer: "textarea[placeholder*='DeepSeek']",
    assistantMarkdown: ".ds-message .ds-markdown",
    modelOption: "[role='radio'][data-model-type]",
    expertOption: `[role='radio'][data-model-type='${EXPERT_MODEL_TYPE}']`,
    toggleButton: "div[class*='toggle-button']"
  },
  getPreferenceEntries() {
    return Object.values(PREFERENCE_STORAGE);
  },
  async applyPreferenceStorage(page) {
    const entries = this.getPreferenceEntries();

    await page.addInitScript((items) => {
      for (const item of items) {
        window.localStorage.setItem(
          item.key,
          JSON.stringify({
            value: item.value,
            __version: item.version
          })
        );
      }
    }, entries);

    await page
      .evaluate((items) => {
        for (const item of items) {
          window.localStorage.setItem(
            item.key,
            JSON.stringify({
              value: item.value,
              __version: item.version
            })
          );
        }
      }, entries)
      .catch(() => {});
  },
  async openFreshChat(page) {
    await this.applyPreferenceStorage(page);
    await page.goto(this.baseUrl, { waitUntil: "domcontentloaded" });
  },
  async ensureReady(page, timeoutMs = DEFAULT_TIMEOUT_MS) {
    await page.waitForLoadState("domcontentloaded");
    await dismissCommonOverlays(page, { timeoutMs: shortTimeout(timeoutMs, 3000) });

    if (page.url().includes("/sign_in")) {
      throw new Error(`当前未登录 ${this.label}，请先执行 setup 命令完成登录。`);
    }

    await page.waitForSelector(this.selectors.composer, { timeout: timeoutMs });
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
  async getSelectedModelText(page) {
    return page
      .locator("[role='radio'][data-model-type][aria-checked='true']")
      .first()
      .innerText({ timeout: 3000 })
      .then((text) => text.replace(/\s+/g, " ").trim())
      .catch(() => "");
  },
  async ensureExpertMode(page, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const option = page.locator(this.selectors.expertOption).first();
    await option.waitFor({ state: "visible", timeout: shortTimeout(timeoutMs, 30000) });

    const selected = await option.getAttribute("aria-checked");
    if (selected !== "true") {
      try {
        await option.click({ timeout: shortTimeout(timeoutMs, 5000) });
      } catch {
        await option.click({ timeout: shortTimeout(timeoutMs, 5000), force: true });
      }

      await page.waitForFunction(
        (selector) => document.querySelector(selector)?.getAttribute("aria-checked") === "true",
        this.selectors.expertOption,
        { timeout: shortTimeout(timeoutMs, 30000) }
      );
    }

    const modelText = await this.getSelectedModelText(page);
    return modelText || "专家模式";
  },
  getToggle(page, label) {
    return page.locator(this.selectors.toggleButton).filter({ hasText: label }).first();
  },
  async isToggleEnabled(toggle) {
    return toggle
      .evaluate((element) => String(element.className || "").includes("toggle-button--selected"))
      .catch(() => false);
  },
  async isToggleDisabled(toggle) {
    return toggle
      .evaluate((element) => String(element.className || "").includes("toggle-button--disabled"))
      .catch(() => false);
  },
  async clickToggle(toggle, timeoutMs) {
    try {
      await toggle.click({ timeout: shortTimeout(timeoutMs, 5000) });
    } catch {
      await toggle.click({ timeout: shortTimeout(timeoutMs, 5000), force: true });
    }
  },
  async ensureToggleEnabled(page, label, storageEntry, timeoutMs = DEFAULT_TIMEOUT_MS, allowReload = true) {
    let toggle = this.getToggle(page, label);
    await toggle.waitFor({ state: "visible", timeout: shortTimeout(timeoutMs, 30000) });

    if (await this.isToggleEnabled(toggle)) {
      return true;
    }

    if (await this.isToggleDisabled(toggle)) {
      throw new Error(`${this.label} 的“${label}”当前不可用，无法自动开启。`);
    }

    await this.clickToggle(toggle, timeoutMs);
    await page.waitForTimeout(200);

    if (await this.isToggleEnabled(toggle)) {
      return true;
    }

    if (!allowReload) {
      throw new Error(`未能开启 ${this.label} 的“${label}”。`);
    }

    await this.applyPreferenceStorage(page);
    await page.reload({ waitUntil: "domcontentloaded", timeout: timeoutMs });
    await this.ensureReady(page, timeoutMs);

    toggle = this.getToggle(page, label);
    await toggle.waitFor({ state: "visible", timeout: shortTimeout(timeoutMs, 30000) });

    if (!(await this.isToggleEnabled(toggle))) {
      if (await this.isToggleDisabled(toggle)) {
        throw new Error(`${this.label} 的“${label}”当前不可用，无法自动开启。`);
      }

      await this.clickToggle(toggle, timeoutMs);
      await page.waitForTimeout(200);
    }

    if (!(await this.isToggleEnabled(toggle))) {
      throw new Error(`未能开启 ${this.label} 的“${label}”。`);
    }

    await page.evaluate(
      ({ key, version }) => {
        window.localStorage.setItem(
          key,
          JSON.stringify({
            value: true,
            __version: version
          })
        );
      },
      {
        key: storageEntry.key,
        version: storageEntry.version
      }
    );

    return true;
  },
  async prepareForPrompt(page, options = {}) {
    const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);

    await dismissCommonOverlays(page, { timeoutMs: shortTimeout(timeoutMs, 3000) });
    await this.applyPreferenceStorage(page);
    await this.ensureToggleEnabled(page, THINKING_LABEL, PREFERENCE_STORAGE.thinking, timeoutMs, true);
    await this.ensureToggleEnabled(page, SEARCH_LABEL, PREFERENCE_STORAGE.search, timeoutMs, true);

    const model = await this.ensureExpertMode(page, timeoutMs);

    await this.ensureToggleEnabled(page, THINKING_LABEL, PREFERENCE_STORAGE.thinking, timeoutMs, false);
    await this.ensureToggleEnabled(page, SEARCH_LABEL, PREFERENCE_STORAGE.search, timeoutMs, false);

    return { model };
  },
  async submitPrompt(page, prompt) {
    await dismissCommonOverlays(page, { timeoutMs: shortTimeout(DEFAULT_TIMEOUT_MS, 3000) });
    const composer = page.locator(this.selectors.composer).first();
    await composer.waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS });
    await composer.click();
    await composer.fill("");
    await composer.fill(prompt);
    await composer.press("Enter");
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
      const current = await page.evaluate((responseSelector) => {
        const latest = Array.from(document.querySelectorAll(responseSelector)).at(-1);
        return latest ? latest.innerText.trim() : "";
      }, selector);

      if (current.length >= minLength && current === previous) {
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
