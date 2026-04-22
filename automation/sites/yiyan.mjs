import {
  DEFAULT_TIMEOUT_MS,
  createSimpleChatSite,
  dismissCommonOverlays,
  ensureFeatureEnabled,
  selectPreferredOption,
  shortTimeout
} from "./shared/simple-chat.mjs";

const DEFAULT_SETTLE_INTERVAL_MS = 2000;
const DEFAULT_SETTLE_ROUNDS = 3;

async function getYiyanAnswerState(page, selector) {
  return page.evaluate((responseSelector) => {
    const clean = (value) =>
      String(value || "")
        .replace(/\u00a0/g, " ")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

    const latest = Array.from(document.querySelectorAll(responseSelector)).at(-1);
    const text = clean(latest?.innerText || latest?.textContent || "");
    const isGenerating = Array.from(
      document.querySelectorAll(".stopDealBtn__j89pyOuJ, .stopBtn__XJMJQw83")
    ).some((element) => element.getClientRects().length > 0);

    return {
      count: Array.from(document.querySelectorAll(responseSelector)).length,
      text,
      isGenerating
    };
  }, selector);
}

const baseYiyanSite = createSimpleChatSite({
  id: "yiyan",
  label: "文心一言",
  baseUrl: "https://yiyan.baidu.com/",
  requiresAuth: false,
  model: "文心 X1.1",
  composer: [
    "textarea",
    "[contenteditable='true']",
    "[role='textbox']"
  ],
  assistantMarkdown: [
    ".custom-html.md-stream",
    "[class*='md-stream']"
  ].join(", "),
  dismissText: ["关闭"],
  features: [
    { label: "思考·自动", selectors: ["button:has-text('思考·自动')", "div:has-text('思考·自动')"] }
  ],
  submit: [
    ".send__slzHSuja",
    ".btnContainer__sFTJytvZ"
  ],
  afterOpenDelayMs: 1500,
  overlayDismiss: {
    dismissSelectors: ["[class*='closeIcon']", "[class*='dialog'] [class*='close' i]"]
  }
});

export const yiyanSite = {
  ...baseYiyanSite,
  async captureAnswerState(page) {
    return getYiyanAnswerState(page, this.selectors.assistantMarkdown);
  },
  async prepareForPrompt(page, options = {}) {
    const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);

    await dismissCommonOverlays(page, {
      timeoutMs: shortTimeout(timeoutMs, 3000),
      dismissSelectors: ["[class*='closeIcon']", "[class*='dialog'] [class*='close' i]"]
    });

    const isLoggedOut = await page.locator("body").innerText().then((text) => text.includes("未登录")).catch(() => true);
    const modelState = await selectPreferredOption(
      page,
      {
        currentSelectors: [
          "[class*='newModelTabSelector']",
          "[class*='modelTabWrapper'] [class*='titleText']"
        ],
        triggerSelectors: [
          "[class*='newModelTabSelector']",
          "[class*='modelTabWrapper']"
        ],
        labels: isLoggedOut ? ["文心 X1.1", "文心 4.5 Turbo"] : ["文心 5.0", "文心 X1.1", "文心 4.5 Turbo"],
        optionSelector: "[class*='item__'],[role='menuitem']",
        required: true,
        reopenOnMismatch: true
      },
      timeoutMs
    );

    await dismissCommonOverlays(page, {
      timeoutMs: shortTimeout(timeoutMs, 2000),
      dismissSelectors: ["[class*='closeIcon']", "[class*='dialog'] [class*='close' i]"]
    });

    await ensureFeatureEnabled(
      page,
      {
        label: "思考·自动",
        selectors: ["button:has-text('思考·自动')", "div:has-text('思考·自动')"],
        required: false
      },
      shortTimeout(timeoutMs, 5000)
    ).catch(() => {});

    return {
      model: modelState.matched || modelState.selected || "文心 X1.1"
    };
  },
  async waitForAnswer(page, baselineState, options = {}) {
    const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
    const settleIntervalMs = Number(options.settleIntervalMs || DEFAULT_SETTLE_INTERVAL_MS);
    const settleRounds = Math.max(Number(options.settleRounds || DEFAULT_SETTLE_ROUNDS), 2);
    const minLength = Number(options.minLength || 1);
    const beforeText = String(baselineState?.text || "");
    const startedAt = Date.now();
    let previous = "";
    let stableRounds = 0;

    while (Date.now() - startedAt < timeoutMs) {
      const state = await getYiyanAnswerState(page, this.selectors.assistantMarkdown);
      const current = state.text;
      const hasNewAnswer = current.length >= minLength && current !== beforeText;

      if (!state.isGenerating && hasNewAnswer && current === previous) {
        stableRounds += 1;
      } else {
        stableRounds = 0;
      }

      previous = current;

      if (stableRounds >= settleRounds) {
        return `${current.trim()}\n`;
      }

      await page.waitForTimeout(settleIntervalMs);
    }

    throw new Error(`等待 ${this.label} 回答完成超时：${timeoutMs}ms`);
  }
};
