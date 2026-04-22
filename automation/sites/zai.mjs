import {
  createSimpleChatSite,
  dismissCommonOverlays,
  selectPreferredOption,
  shortTimeout
} from "./shared/simple-chat.mjs";

const SEARCH_BUTTON_SELECTOR = "button.flex.items-center.text-sm";
const THINK_BUTTON_SELECTOR = "button[data-autothink]";
const MODEL_SELECTOR = ".modelSelectorButton, button[aria-label*='模型']";
const CURRENT_MODEL_SELECTOR = ".modelSelectorButton";
const DEFAULT_TIMEOUT_MS = 180000;
const DEFAULT_SETTLE_INTERVAL_MS = 2000;
const DEFAULT_SETTLE_ROUNDS = 3;
let preferTurboModel = false;

function getPreferredModelLabels() {
  return preferTurboModel
    ? ["GLM-5-Turbo", "GLM-5.1", "GLM-5V-Turbo"]
    : ["GLM-5.1", "GLM-5-Turbo", "GLM-5V-Turbo"];
}

async function switchPeakDialogToTurbo(page, timeoutMs = 3000) {
  const switchButton = page.locator("button").filter({ hasText: /切换到\s*GLM-5-Turbo/i }).first();
  const visible = await switchButton.isVisible({ timeout: shortTimeout(timeoutMs, 3000) }).catch(() => false);

  if (!visible) {
    return false;
  }

  try {
    await switchButton.click({ timeout: shortTimeout(timeoutMs, 5000) });
  } catch {
    await switchButton.click({ timeout: shortTimeout(timeoutMs, 5000), force: true });
  }

  preferTurboModel = true;
  await page.waitForTimeout(1200);
  return true;
}

async function getZaiFinalAnswerState(page) {
  return page.evaluate(() => {
    const cleanText = (value) =>
      String(value || "")
        .replace(/\u00a0/g, " ")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

    const assistants = Array.from(document.querySelectorAll(".chat-assistant"));
    const latest = assistants.at(-1);
    const rawText = latest?.innerText || "";
    const hasBusyError = /当前模型使用人数较多|请稍后再试或切换到其他模型|服务器繁忙|服务繁忙/.test(rawText);
    const isGenerating = Array.from(document.querySelectorAll("button,[role='button'],[aria-label]")).some(
      (element) => {
        const text = [
          element.getAttribute("aria-label"),
          element.textContent,
          element.getAttribute("title")
        ]
          .filter(Boolean)
          .join(" ");
        return /停止|Stop/i.test(text) && element.getClientRects().length > 0;
      }
    );

    if (!latest) {
      return {
        count: assistants.length,
        text: "",
        hasBusyError,
        isGenerating
      };
    }

    const clone = latest.cloneNode(true);
    clone
      .querySelectorAll(
        [
          "script",
          "style",
          "svg",
          "button",
          "[class*='thinking-chain']",
          "[class*='thinking']",
          "[class*='spinner']",
          "[class*='artifact']",
          "[class*='timeline']",
          "[class*='preview']",
          "[class*='border-red']",
          "[class*='bg-red']",
          "[data-artifact]",
          "[data-testid*='artifact']"
        ].join(",")
      )
      .forEach((element) => element.remove());

    const responseRoot = clone.querySelector("#response-content-container") || clone;
    let text = cleanText(responseRoot.innerText || responseRoot.textContent);
    text = text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !/^(思考过程|正在思考|跳过|搜索\s*\d*\s*个关键词|参考)$/.test(line))
      .filter((line) => !/^\d+\s*timeline\b/i.test(line))
      .filter((line) => !/^(title|nodes|edges|data)\b/i.test(line))
      .join("\n\n")
      .trim();

    return {
      count: assistants.length,
      text,
      hasBusyError,
      isGenerating
    };
  });
}

export const zaiSite = {
  ...createSimpleChatSite({
    id: "zai",
    label: "Z.ai",
    baseUrl: "https://chat.z.ai/",
    requiresAuth: true,
    model: "GLM-5.1 / 高级搜索 / 深度思考",
    composer: [
      "textarea[placeholder*='帮您']",
      "textarea[placeholder*='帮你']",
      "textarea"
    ],
    assistantMarkdown: ".chat-assistant",
    blockedText: [
      "当前模型使用人数较多",
      "请稍后再试或切换到其他模型",
      "服务器繁忙",
      "服务繁忙"
    ],
    blockedMessage: "Z.ai 当前模型繁忙或服务不可用，请稍后重试或切换其他模型。",
    loginSelectors: [
      "button:has-text('登录')",
      "button:has-text('注册')",
      "a:has-text('登录')"
    ],
    loginText: ["登录后使用完整功能", "点击开始验证"],
    loginMessage: "当前未登录 Z.ai。Z.ai 普通聊天可免登录，但高级搜索会跳转登录页；请先执行 setup:zai 并完成登录/验证。",
    afterOpenDelayMs: 1500
  }),
  async captureAnswerState(page) {
    return getZaiFinalAnswerState(page);
  },
  async ensureBestModel(page, timeoutMs) {
    const modelState = await selectPreferredOption(
      page,
      {
        currentSelectors: [CURRENT_MODEL_SELECTOR],
        triggerSelectors: [MODEL_SELECTOR],
        labels: getPreferredModelLabels(),
        optionSelector: "[aria-label='model-item'],[role='menuitem'],button,div",
        required: true,
        reopenOnMismatch: true
      },
      timeoutMs
    );

    return modelState.matched || modelState.selected || "GLM-5.1";
  },
  async ensureAdvancedSearch(page, timeoutMs) {
    const searchButton = page.locator(SEARCH_BUTTON_SELECTOR).first();
    await searchButton.waitFor({ state: "visible", timeout: shortTimeout(timeoutMs, 15000) });

    await searchButton.hover({ timeout: shortTimeout(timeoutMs, 5000) });
    await page.waitForTimeout(500);

    if (page.url().includes("/auth")) {
      throw new Error("Z.ai 高级搜索需要登录。请先执行 setup:zai 完成登录/验证后再运行。");
    }

    const advancedSwitch = page
      .locator("[role='tooltip']")
      .filter({ hasText: "高级搜索" })
      .locator("button[role='switch']")
      .first();

    await advancedSwitch.waitFor({ state: "visible", timeout: shortTimeout(timeoutMs, 5000) });

    if ((await advancedSwitch.getAttribute("aria-checked").catch(() => "false")) !== "true") {
      await advancedSwitch.click({ timeout: shortTimeout(timeoutMs, 5000) });
      await page.waitForTimeout(300);
    }

    if ((await advancedSwitch.getAttribute("aria-checked").catch(() => "false")) !== "true") {
      throw new Error("未能开启 Z.ai 高级搜索开关。");
    }

    await page.waitForTimeout(300);
  },
  async ensureAutoThink(page, timeoutMs) {
    const thinkButton = page.locator(THINK_BUTTON_SELECTOR).first();
    if (!(await thinkButton.isVisible({ timeout: shortTimeout(timeoutMs, 3000) }).catch(() => false))) {
      return;
    }

    const autoThink = await thinkButton.getAttribute("data-autothink").catch(() => null);
    if (autoThink !== "true") {
      await thinkButton.click({ timeout: shortTimeout(timeoutMs, 5000) });
      await page.waitForTimeout(300);
    }
  },
  async prepareForPrompt(page, options = {}) {
    const timeoutMs = Number(options.timeoutMs || 180000);
    await dismissCommonOverlays(page, { timeoutMs: shortTimeout(timeoutMs, 3000) });
    const model = await this.ensureBestModel(page, timeoutMs);
    await this.ensureAdvancedSearch(page, timeoutMs);
    await this.ensureAutoThink(page, timeoutMs);
    return { model: `${model} / 高级搜索 / 深度思考` };
  },
  async waitForAnswer(page, baselineState, options = {}) {
    const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
    const settleIntervalMs = Number(options.settleIntervalMs || DEFAULT_SETTLE_INTERVAL_MS);
    const settleRounds = Math.max(Number(options.settleRounds || DEFAULT_SETTLE_ROUNDS), 3);
    const minLength = Number(options.minLength || 1);
    const beforeText = String(baselineState?.text || "");
    const startedAt = Date.now();
    let previous = "";
    let stableRounds = 0;

    while (Date.now() - startedAt < timeoutMs) {
      if (await switchPeakDialogToTurbo(page, 3000)) {
        previous = "";
        stableRounds = 0;
        continue;
      }

      const state = await getZaiFinalAnswerState(page);

      if (state.hasBusyError) {
        if (await switchPeakDialogToTurbo(page, 3000)) {
          previous = "";
          stableRounds = 0;
          continue;
        }
        preferTurboModel = true;
        throw new Error("Z.ai 当前模型繁忙或服务不可用，请稍后重试或切换其他模型。");
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
