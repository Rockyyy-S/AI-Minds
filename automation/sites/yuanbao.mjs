import {
  DEFAULT_TIMEOUT_MS,
  createSimpleChatSite,
  dismissCommonOverlays,
  selectPreferredOption,
  shortTimeout
} from "./shared/simple-chat.mjs";

const DEFAULT_SETTLE_INTERVAL_MS = 2000;
const DEFAULT_SETTLE_ROUNDS = 3;

const baseYuanbaoSite = createSimpleChatSite({
  id: "yuanbao",
  label: "腾讯元宝",
  baseUrl: "https://yuanbao.tencent.com/",
  requiresAuth: true,
  model: "DeepSeek / 深度思考 / 联网搜索",
  composer: [
    "div.ql-editor[contenteditable='true']",
    "div.ql-editor",
    "[role='textbox']",
    "[contenteditable='true']"
  ],
  submit: [
    "a[class*='send-btn']",
    "button[class*='send']",
    "button[aria-label='发送']"
  ],
  assistantMarkdown: [
    ".hyc-component-reasoner__text .hyc-common-markdown",
    ".hyc-component-reasoner__text .hyc-content-md",
    ".agent-chat__conv--ai__speech_show .hyc-component-markdown"
  ].join(", "),
  loginSelectors: [
    "button.agent-dialogue__tool__login",
    "button:has-text('登录')"
  ],
  loginText: ["微信扫码登录", "手机", "QQ"],
  loginMessage: "当前未登录腾讯元宝，请先执行 setup:yuanbao 并完成登录。",
  afterOpenDelayMs: 1500,
  overlayDismiss: {
    dismissSelectors: ["button[aria-label='关闭']", "[aria-label='关闭']", "[class*='close' i]"]
  }
});

async function ensureYuanbaoToggle(page, label, selector, activePattern, timeoutMs) {
  const toggle = page.locator(selector).filter({ hasText: label }).first();
  await toggle.waitFor({ state: "visible", timeout: shortTimeout(timeoutMs, 10000) });

  const isActive = async () =>
    toggle
      .evaluate(
        (element, pattern) => new RegExp(pattern.source, pattern.flags).test(String(element.className || "")),
        {
          source: activePattern.source,
          flags: activePattern.flags
        }
      )
      .catch(() => false);

  if (await isActive()) {
    return true;
  }

  try {
    await toggle.click({ timeout: shortTimeout(timeoutMs, 5000) });
  } catch {
    await toggle.click({ timeout: shortTimeout(timeoutMs, 5000), force: true });
  }
  await page.waitForTimeout(500);

  if (!(await isActive())) {
    throw new Error(`未能开启腾讯元宝“${label}”。`);
  }

  return true;
}

async function getYuanbaoFinalAnswerState(page) {
  return page.evaluate(() => {
    const cleanText = (value) =>
      String(value || "")
        .replace(/\u00a0/g, " ")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

    const aiItems = Array.from(document.querySelectorAll(".agent-chat__list__item")).filter(
      (element) => !String(element.className || "").includes("--human")
    );
    const latest = aiItems.at(-1);
    const rawText = latest?.innerText || "";
    const hasBusyError = /当前模型使用人数较多|请稍后再试或切换到其他模型|服务器繁忙|服务繁忙/.test(rawText);
    const isGenerating =
      Array.from(document.querySelectorAll(".agent-chat__conv--ai__toolbar--loading")).some(
        (element) => element.getClientRects().length > 0
      ) ||
      Array.from(document.querySelectorAll("[class*='agent-dialogue__content--common']")).some((element) => {
        const className = String(element.className || "");
        return className === "agent-dialogue__content--common" && element.getClientRects().length > 0;
      });

    if (!latest) {
      return {
        count: aiItems.length,
        text: "",
        hasBusyError,
        isGenerating
      };
    }

    const candidates = Array.from(
      latest.querySelectorAll(
        [
          ".hyc-component-reasoner__text .hyc-common-markdown",
          ".hyc-component-reasoner__text .hyc-content-md",
          ".agent-chat__conv--ai__speech_show .hyc-component-markdown",
          ".agent-chat__conv--ai__speech_show .hyc-common-markdown"
        ].join(",")
      )
    ).filter((element) => !element.closest(".hyc-component-reasoner__think"));
    const root = candidates.at(-1);

    return {
      count: aiItems.length,
      text: cleanText(root?.innerText || root?.textContent || ""),
      hasBusyError,
      isGenerating
    };
  });
}

export const yuanbaoSite = {
  ...baseYuanbaoSite,
  async captureAnswerState(page) {
    return getYuanbaoFinalAnswerState(page);
  },
  async prepareForPrompt(page, options = {}) {
    const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);

    await dismissCommonOverlays(page, {
      timeoutMs: shortTimeout(timeoutMs, 3000),
      dismissSelectors: ["button[aria-label='关闭']", "[aria-label='关闭']", "[class*='close' i]"]
    });

    const modelState = await selectPreferredOption(
      page,
      {
        currentSelectors: [".ybc-model-select-button", ".ybc-model-select-container"],
        triggerSelectors: [".ybc-model-select-button", ".ybc-model-select-container"],
        labels: ["DeepSeek", "Hunyuan"],
        optionSelector: ".t-dropdown__item,[role='menuitem'],button,div",
        required: true,
        reopenOnMismatch: true
      },
      timeoutMs
    );

    await ensureYuanbaoToggle(
      page,
      "深度思考",
      "[class*='ThinkSelector_iconContainer']",
      /selected|active/i,
      timeoutMs
    );
    await ensureYuanbaoToggle(
      page,
      "联网搜索",
      ".yb-internet-search-btn,[class*='internet-search']",
      /active|selected/i,
      timeoutMs
    );

    return {
      model: `${modelState.matched || modelState.selected || "DeepSeek"} / 深度思考 / 联网搜索`
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
      const state = await getYuanbaoFinalAnswerState(page);

      if (state.hasBusyError) {
        throw new Error("腾讯元宝当前模型繁忙或服务不可用，请稍后重试或切换其他模型。");
      }

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
