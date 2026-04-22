export const DEFAULT_TIMEOUT_MS = 180000;
export const DEFAULT_SETTLE_INTERVAL_MS = 2000;
export const DEFAULT_SETTLE_ROUNDS = 3;

export function shortTimeout(timeoutMs, fallbackMs = 10000) {
  const parsed = Number(timeoutMs || fallbackMs);
  return Math.min(parsed, fallbackMs);
}

function toArray(value) {
  return Array.isArray(value) ? value : [value].filter(Boolean);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

const COMMON_DISMISS_TEXT = [
  "关闭",
  "取消",
  "知道了",
  "我知道了",
  "稍后再说",
  "下次再说",
  "暂不",
  "跳过",
  "保持注销状态",
  "Close",
  "Dismiss",
  "Skip",
  "Not now",
  "No thanks",
  "Maybe later"
];

const COMMON_DISMISS_SELECTORS = [
  "button[aria-label='关闭']",
  "button[aria-label*='关闭']",
  "[role='button'][aria-label*='关闭']",
  "button[aria-label*='Close' i]",
  "[role='button'][aria-label*='Close' i]",
  "button[title*='关闭']",
  "button[title*='Close' i]",
  ".ant-modal-close",
  ".semi-modal-close",
  ".t-dialog__close",
  ".n-base-close",
  ".n-modal-close",
  ".n-dialog__close",
  "[class*='modal'] [class*='close' i]",
  "[class*='popup'] [class*='close' i]",
  "[class*='popover'] [class*='close' i]",
  "[class*='dialog'] [class*='close' i]",
  "[data-testid*='close' i]"
];

async function hasVisibleSelector(page, selectors, timeoutMs = 1500) {
  for (const selector of toArray(selectors)) {
    const locator = page.locator(selector).first();
    if (await locator.isVisible({ timeout: shortTimeout(timeoutMs, 1500) }).catch(() => false)) {
      return true;
    }
  }
  return false;
}

async function pageTextIncludes(page, patterns) {
  const patternList = toArray(patterns).filter(Boolean);
  if (!patternList.length) {
    return false;
  }

  const bodyText = await page.locator("body").innerText().catch(() => "");
  const title = await page.title().catch(() => "");
  const url = page.url();
  const haystack = `${title}\n${url}\n${bodyText}`;
  return patternList.some((pattern) => haystack.includes(pattern));
}

async function throwIfBlocked(page, blockedText, blockedMessage, blockedSelectors) {
  if (blockedSelectors && (await hasVisibleSelector(page, blockedSelectors, 800))) {
    throw new Error(blockedMessage || "当前页面触发了访问限制或安全验证。");
  }

  if (blockedText && (await pageTextIncludes(page, blockedText))) {
    throw new Error(blockedMessage || "当前页面触发了访问限制或安全验证。");
  }
}

async function waitForBlockedText(page, blockedText, blockedMessage, blockedSelectors, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await throwIfBlocked(page, blockedText, blockedMessage, blockedSelectors);
    await page.waitForTimeout(500);
  }
}

export function buildMarkdownExtractor() {
  return (responseSelector) => {
    const root = Array.from(document.querySelectorAll(responseSelector)).at(-1);
    if (!root) {
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
      const headers = rows[0] || [];
      const lines = [];
      const escapeCell = (value) => String(value || "").replace(/\|/g, "\\|").replace(/\n/g, "<br>");

      if (!headers.length) {
        return "";
      }

      lines.push(`| ${headers.map(escapeCell).join(" | ")} |`);
      lines.push(`| ${headers.map(() => "---").join(" | ")} |`);

      for (const row of rows.slice(1)) {
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
      const langClass = rawClassName.split(/\s+/).find((name) => name.startsWith("language-"));
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
        return `${"#".repeat(Number(tag[1]))} ${cleanText(renderInline(el))}`;
      }

      if (tag === "p" || tag === "section" || tag === "div") {
        if (el.querySelector(":scope > pre")) {
          return renderCodeBlock(el);
        }
        return cleanText(Array.from(el.childNodes).map(renderInline).join("") || el.innerText);
      }

      if (tag === "pre") {
        return renderCodeBlock(el);
      }

      if (tag === "table") {
        return renderTable(el);
      }

      if (tag === "ul" || tag === "ol") {
        return renderList(el);
      }

      if (tag === "blockquote") {
        return cleanText(el.innerText)
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n");
      }

      return cleanText(el.innerText || "");
    };

    const blockNodes = root.children.length ? Array.from(root.children) : [root];
    return blockNodes
      .map(renderBlock)
      .map(cleanText)
      .filter(Boolean)
      .join("\n\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  };
}

export async function firstVisibleLocator(page, selectors, timeoutMs = DEFAULT_TIMEOUT_MS, options = {}) {
  const selectorList = toArray(selectors);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (options.blockedText && (await pageTextIncludes(page, options.blockedText))) {
      throw new Error(options.blockedMessage || "当前页面触发了访问限制或安全验证。");
    }

    for (const selector of selectorList) {
      const locator = page.locator(selector).first();
      if (await locator.isVisible().catch(() => false)) {
        return locator;
      }
    }
    await page.waitForTimeout(300);
  }

  throw new Error(`未找到可见元素：${selectorList.join(" | ")}`);
}

export async function clickText(page, label, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const exactPattern = new RegExp(`^\\s*${escapeRegExp(label)}\\s*$`);
  const candidates = [
    page.getByRole("button", { name: exactPattern }).first(),
    page.locator("button,[role='button'],label,a,span,div").filter({ hasText: exactPattern }).first(),
    page.locator(`text=${label}`).first()
  ];

  for (const candidate of candidates) {
    if (!(await candidate.isVisible({ timeout: shortTimeout(timeoutMs, 1500) }).catch(() => false))) {
      continue;
    }

    try {
      await candidate.click({ timeout: shortTimeout(timeoutMs, 3000) });
    } catch {
      await candidate.click({ timeout: shortTimeout(timeoutMs, 3000), force: true });
    }
    return true;
  }

  return false;
}

async function clickVisibleLocator(locator, timeoutMs) {
  try {
    await locator.click({ timeout: shortTimeout(timeoutMs, 3000) });
  } catch {
    await locator.click({ timeout: shortTimeout(timeoutMs, 3000), force: true });
  }
}

async function clickFirstVisibleSelector(page, selector, timeoutMs) {
  const locator = page.locator(selector);
  const count = Math.min(await locator.count().catch(() => 0), 8);

  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index);
    if (!(await candidate.isVisible({ timeout: shortTimeout(timeoutMs, 700) }).catch(() => false))) {
      continue;
    }

    await clickVisibleLocator(candidate, timeoutMs);
    return true;
  }

  return false;
}

export async function dismissCommonOverlays(page, options = {}) {
  const timeoutMs = shortTimeout(options.timeoutMs, 3000);
  const labels = [...COMMON_DISMISS_TEXT, ...toArray(options.dismissText)];
  const selectors = [...COMMON_DISMISS_SELECTORS, ...toArray(options.dismissSelectors)];
  let dismissed = false;

  await page.keyboard.press("Escape").catch(() => {});

  for (let round = 0; round < 2; round += 1) {
    for (const selector of selectors) {
      const clicked = await clickFirstVisibleSelector(page, selector, timeoutMs).catch(() => false);
      if (clicked) {
        dismissed = true;
        await page.waitForTimeout(250);
      }
    }

    for (const label of labels) {
      const clicked = await clickText(page, label, timeoutMs).catch(() => false);
      if (clicked) {
        dismissed = true;
        await page.waitForTimeout(250);
      }
    }
  }

  return { dismissed };
}

export async function visibleText(locator, timeoutMs = 1500) {
  return locator
    .innerText({ timeout: shortTimeout(timeoutMs, 1500) })
    .then(normalizeText)
    .catch(() => "");
}

export async function firstVisibleText(page, selectors, timeoutMs = 1500) {
  for (const selector of toArray(selectors)) {
    const locator = page.locator(selector).first();
    if (await locator.isVisible({ timeout: shortTimeout(timeoutMs, 1000) }).catch(() => false)) {
      return visibleText(locator, timeoutMs);
    }
  }
  return "";
}

export async function clickTextOption(page, label, options = {}) {
  const timeoutMs = shortTimeout(options.timeoutMs, 5000);
  const selector = options.selector || "button,[role='button'],[role='menuitem'],[role='option'],li,a,label,div,span";
  const locator = page.locator(selector).filter({
    hasText: new RegExp(escapeRegExp(label), "i")
  });
  const count = Math.min(await locator.count().catch(() => 0), Number(options.maxCandidates || 80));
  let best = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index);
    if (!(await candidate.isVisible({ timeout: shortTimeout(timeoutMs, 600) }).catch(() => false))) {
      continue;
    }

    const text = await visibleText(candidate, 800);
    if (!text || text.length > Number(options.maxTextLength || 360)) {
      continue;
    }

    const lowerText = text.toLowerCase();
    const lowerLabel = String(label).toLowerCase();
    let score;

    if (lowerText === lowerLabel) {
      score = 0;
    } else if (lowerText.startsWith(lowerLabel)) {
      score = 1;
    } else if (lowerText.includes(lowerLabel)) {
      score = 2;
    } else {
      continue;
    }

    score += text.length / 1000;
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  if (!best) {
    return false;
  }

  await clickVisibleLocator(best, timeoutMs);
  return true;
}

export async function selectPreferredOption(page, config = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const labels = toArray(config.labels || config.optionLabels || config.preferredLabels);
  if (!labels.length) {
    return { selected: "", changed: false, skipped: true };
  }

  const currentBefore = config.currentSelectors
    ? await firstVisibleText(page, config.currentSelectors, shortTimeout(timeoutMs, 2000))
    : "";

  const currentLabels = toArray(config.acceptCurrentLabels || labels[0]);
  for (const label of currentLabels) {
    if (currentBefore.includes(label)) {
      return { selected: currentBefore, matched: label, changed: false };
    }
  }

  if (config.triggerSelectors) {
    const trigger = await firstVisibleLocator(page, config.triggerSelectors, shortTimeout(timeoutMs, 10000));
    await clickVisibleLocator(trigger, timeoutMs);
    await page.waitForTimeout(Number(config.openSettleMs || 500));
  }

  for (const label of labels) {
    const clicked = await clickTextOption(page, label, {
      selector: config.optionSelector,
      timeoutMs: shortTimeout(timeoutMs, Number(config.optionTimeoutMs || 5000)),
      maxCandidates: config.maxCandidates,
      maxTextLength: config.maxTextLength
    }).catch(() => false);

    if (!clicked) {
      continue;
    }

    await page.waitForTimeout(Number(config.settleMs || 800));

    if (!config.currentSelectors) {
      return { selected: label, matched: label, changed: true };
    }

    const currentAfter = await firstVisibleText(page, config.currentSelectors, shortTimeout(timeoutMs, 3000));
    if (currentAfter.includes(label)) {
      return { selected: currentAfter, matched: label, changed: true };
    }

    if (config.reopenOnMismatch && config.triggerSelectors) {
      const trigger = await firstVisibleLocator(page, config.triggerSelectors, shortTimeout(timeoutMs, 5000)).catch(
        () => null
      );
      if (trigger) {
        await clickVisibleLocator(trigger, timeoutMs).catch(() => {});
        await page.waitForTimeout(Number(config.openSettleMs || 500));
      }
    }
  }

  if (config.required) {
    throw new Error(`未能选择选项：${labels.join("、")}`);
  }

  return {
    selected: currentBefore,
    changed: false,
    skipped: true
  };
}

function featureStateFromClassName(className) {
  const normalized = String(className || "").toLowerCase();

  if (/(selected|active|checked|enabled|current|primary|highlight|on)/.test(normalized)) {
    return true;
  }

  if (/(disabled|inactive|off)/.test(normalized)) {
    return false;
  }

  return undefined;
}

async function getFeatureState(locator) {
  return locator
    .evaluate((element) => {
      const ariaPressed = element.getAttribute("aria-pressed");
      const ariaChecked = element.getAttribute("aria-checked");
      const dataState = element.getAttribute("data-state");
      const dataSelected = element.getAttribute("data-selected");
      const className = String(element.className || "");
      const normalizedClassName = className.toLowerCase();

      if (ariaPressed === "true" || ariaChecked === "true" || dataSelected === "true") {
        return true;
      }

      if (ariaPressed === "false" || ariaChecked === "false" || dataSelected === "false") {
        return false;
      }

      if (dataState === "checked" || dataState === "on" || dataState === "active") {
        return true;
      }

      if (dataState === "unchecked" || dataState === "off" || dataState === "inactive") {
        return false;
      }

      if (/(selected|active|checked|enabled|current|primary|highlight|on)/.test(normalizedClassName)) {
        return true;
      }

      if (/(disabled|inactive|off)/.test(normalizedClassName)) {
        return false;
      }

      const parent = element.parentElement;
      const parentClassName = String(parent?.className || "").toLowerCase();
      if (/(selected|active|checked|enabled|current|primary|highlight|on)/.test(parentClassName)) {
        return true;
      }

      if (/(disabled|inactive|off)/.test(parentClassName)) {
        return false;
      }

      return null;
    })
    .then((state) => (state === null ? undefined : state))
    .catch(() => undefined);
}

function normalizeFeature(feature) {
  if (typeof feature === "string") {
    return { label: feature };
  }

  return feature || {};
}

async function findFeatureLocator(page, feature, timeoutMs) {
  const exactPattern = new RegExp(`^\\s*${escapeRegExp(feature.label)}\\s*$`);
  const locators = [
    ...toArray(feature.selectors).map((selector) => page.locator(selector).first()),
    page.getByRole("button", { name: exactPattern }).first(),
    page
      .locator("button,[role='button'],label,a,span,div")
      .filter({ hasText: exactPattern })
      .first(),
    page.locator(`text=${feature.label}`).first()
  ];

  for (const locator of locators) {
    if (await locator.isVisible({ timeout: shortTimeout(timeoutMs, 1200) }).catch(() => false)) {
      return locator;
    }
  }

  return null;
}

export async function ensureFeatureEnabled(page, rawFeature, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const feature = normalizeFeature(rawFeature);
  if (!feature.label && !feature.selectors) {
    return { enabled: false, skipped: true };
  }

  const label = feature.label || toArray(feature.selectors).join(" | ");
  const locator = await findFeatureLocator(page, feature, timeoutMs);

  if (!locator) {
    if (feature.required) {
      throw new Error(`未找到功能开关：${label}`);
    }
    return { enabled: false, skipped: true };
  }

  const currentState = await getFeatureState(locator);
  if (currentState === true) {
    return { enabled: true, changed: false };
  }

  try {
    await locator.click({ timeout: shortTimeout(timeoutMs, 3000) });
  } catch {
    await locator.click({ timeout: shortTimeout(timeoutMs, 3000), force: true });
  }

  await page.waitForTimeout(Number(feature.settleMs || 300));

  const nextState = await getFeatureState(locator);
  if (nextState === false && feature.required) {
    throw new Error(`未能开启功能：${label}`);
  }

  return { enabled: nextState !== false, changed: true };
}

export async function captureAnswerState(page, responseSelector) {
  return page.evaluate((selector) => {
    const items = Array.from(document.querySelectorAll(selector));
    const latest = items.at(-1);
    return {
      count: items.length,
      text: latest ? latest.innerText.trim() : ""
    };
  }, responseSelector);
}

export async function submitPrompt(page, composerSelectors, prompt, options = {}) {
  const composer = await firstVisibleLocator(page, composerSelectors, Number(options.timeoutMs || DEFAULT_TIMEOUT_MS));
  const tagName = await composer.evaluate((element) => element.tagName.toLowerCase()).catch(() => "");

  await composer.click();

  if (tagName === "textarea" || tagName === "input") {
    await composer.fill("");
    await composer.fill(prompt);
  } else {
    await page.keyboard.press("Control+A").catch(() => {});
    await page.keyboard.press("Backspace").catch(() => {});
    await page.keyboard.insertText(prompt);
  }

  if (options.submitSelector) {
    const submitButton = await firstVisibleLocator(page, options.submitSelector, shortTimeout(options.timeoutMs, 5000));
    await submitButton.click({ timeout: shortTimeout(options.timeoutMs, 5000) });
    return;
  }

  await composer.press("Enter").catch(async () => {
    await page.keyboard.press("Enter");
  });
}

export async function waitForAnswer(page, responseSelector, baselineState, options = {}) {
  const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const settleIntervalMs = Number(options.settleIntervalMs || DEFAULT_SETTLE_INTERVAL_MS);
  const settleRounds = Number(options.settleRounds || DEFAULT_SETTLE_ROUNDS);
  const minLength = Number(options.minLength || 1);
  const normalizedBaseline =
    typeof baselineState === "number"
      ? { count: baselineState, text: "" }
      : {
          count: Number(baselineState?.count || 0),
          text: String(baselineState?.text || "")
        };

  const firstAnswerPromise = page.waitForFunction(
      ({ selector, beforeCount, beforeText, minimumLength }) => {
        const items = Array.from(document.querySelectorAll(selector));
        const latest = items.at(-1);
        const text = latest ? latest.innerText.trim() : "";
        return items.length > beforeCount || (text.length >= minimumLength && text !== beforeText);
      },
      {
        selector: responseSelector,
        beforeCount: normalizedBaseline.count,
        beforeText: normalizedBaseline.text,
        minimumLength: minLength
      },
      { timeout: timeoutMs }
    );

  if (options.blockedText || options.blockedSelectors) {
    await Promise.race([
      firstAnswerPromise,
      waitForBlockedText(page, options.blockedText, options.blockedMessage, options.blockedSelectors, timeoutMs)
    ]);
  } else {
    await firstAnswerPromise;
  }

  let previous = "";
  let stableRounds = 0;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    await throwIfBlocked(page, options.blockedText, options.blockedMessage, options.blockedSelectors);

    const current = await page.evaluate((selector) => {
      const latest = Array.from(document.querySelectorAll(selector)).at(-1);
      return latest ? latest.innerText.trim() : "";
    }, responseSelector);

    if (current.length >= minLength && current === previous) {
      stableRounds += 1;
    } else {
      stableRounds = 0;
    }

    previous = current;

    if (stableRounds >= settleRounds) {
      const markdown = await page.evaluate(buildMarkdownExtractor(), responseSelector);
      if (markdown.trim()) {
        return markdown.trim() + "\n";
      }
    }

    await page.waitForTimeout(settleIntervalMs);
  }

  throw new Error(`等待回答完成超时：${timeoutMs}ms`);
}

export function createSimpleChatSite(config) {
  return {
    id: config.id,
    label: config.label,
    baseUrl: config.baseUrl,
    newChatUrl: config.newChatUrl || config.baseUrl,
    requiresAuth: config.requiresAuth ?? true,
    selectors: {
      composer: config.composer,
      assistantMarkdown: config.assistantMarkdown,
      submit: config.submit
    },
    async openFreshChat(page) {
      await page.goto(this.newChatUrl, { waitUntil: "domcontentloaded" });
      if (config.afterOpenDelayMs) {
        await page.waitForTimeout(config.afterOpenDelayMs);
      }
      await dismissCommonOverlays(page, config.overlayDismiss || {});
    },
    async ensureReady(page, timeoutMs = DEFAULT_TIMEOUT_MS) {
      await dismissCommonOverlays(page, { ...(config.overlayDismiss || {}), timeoutMs: shortTimeout(timeoutMs, 3000) });

      if (config.blockedText && (await pageTextIncludes(page, config.blockedText))) {
        throw new Error(config.blockedMessage || `${this.label} 当前触发了访问限制或安全验证。`);
      }

      await firstVisibleLocator(page, this.selectors.composer, timeoutMs, {
        blockedText: config.blockedText,
        blockedMessage: config.blockedMessage
      });

      if (config.blockedText && (await pageTextIncludes(page, config.blockedText))) {
        throw new Error(config.blockedMessage || `${this.label} 当前触发了访问限制或安全验证。`);
      }

      const loginVisible =
        (config.loginSelectors && (await hasVisibleSelector(page, config.loginSelectors, timeoutMs))) ||
        (config.loginText && (await pageTextIncludes(page, config.loginText)));

      if (this.requiresAuth && loginVisible) {
        throw new Error(config.loginMessage || `当前未登录 ${this.label}，请先执行 setup 命令完成登录。`);
      }
    },
    async captureAnswerState(page) {
      return captureAnswerState(page, this.selectors.assistantMarkdown);
    },
    async prepareForPrompt(page, options = {}) {
      const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);

      await dismissCommonOverlays(page, { ...(config.overlayDismiss || {}), timeoutMs: shortTimeout(timeoutMs, 3000) });

      for (const label of config.dismissText || []) {
        await clickText(page, label, shortTimeout(timeoutMs, 3000)).catch(() => {});
      }

      const features = config.features || (config.featureText || []).map((label) => ({ label }));
      for (const feature of features) {
        await ensureFeatureEnabled(page, feature, shortTimeout(timeoutMs, 5000)).catch((error) => {
          if (feature.required) {
            throw error;
          }
        });
      }

      return config.model ? { model: config.model } : {};
    },
    async submitPrompt(page, prompt) {
      await dismissCommonOverlays(page, config.overlayDismiss || {});
      await submitPrompt(page, this.selectors.composer, prompt, {
        submitSelector: this.selectors.submit
      });
    },
    async waitForAnswer(page, baselineState, options = {}) {
      return waitForAnswer(page, this.selectors.assistantMarkdown, baselineState, {
        ...options,
        blockedText: config.blockedText,
        blockedMessage: config.blockedMessage,
        blockedSelectors: config.blockedSelectors
      });
    }
  };
}
