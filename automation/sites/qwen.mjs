import { DEFAULT_TIMEOUT_MS, createSimpleChatSite, dismissCommonOverlays, selectPreferredOption, shortTimeout, submitPrompt } from "./shared/simple-chat.mjs";

const baseQwenSite = createSimpleChatSite({
  id: "qwen",
  label: "Qwen Studio",
  baseUrl: "https://chat.qwen.ai/",
  requiresAuth: false,
  model: "Qwen3.6-Plus / 思考",
  composer: [
    "textarea[placeholder*='帮您']",
    "textarea[placeholder*='帮你']",
    "textarea[placeholder*='help']",
    "textarea.message-input-textarea"
  ],
  assistantMarkdown: [
    ".chat-response-message .custom-qwen-markdown",
    ".chat-response-message .qwen-markdown",
    ".response-message-content .custom-qwen-markdown",
    ".response-message-content .qwen-markdown"
  ].join(", "),
  dismissText: ["保持注销状态"],
  submit: [
    "button[class*='send']",
    "button[aria-label='发送']"
  ],
  afterOpenDelayMs: 1500
});

export const qwenSite = {
  ...baseQwenSite,
  async prepareForPrompt(page, options = {}) {
    const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);

    await dismissCommonOverlays(page, {
      timeoutMs: shortTimeout(timeoutMs, 3000),
      dismissText: ["保持注销状态"]
    });

    const modelState = await selectPreferredOption(
      page,
      {
        currentSelectors: [
          "[class*='model-selector-text']",
          ".header-left [class*='model']"
        ],
        triggerSelectors: [
          "[class*='model-selector-text']",
          ".header-left [class*='model']"
        ],
        labels: ["Qwen3.6-Plus", "Qwen3.6-Max-Preview", "Qwen3.5-Plus"],
        optionSelector: "[class*='model-item'],[role='menuitem'],[role='option'],button,div",
        required: true,
        reopenOnMismatch: true
      },
      timeoutMs
    );

    const thinkingState = await selectPreferredOption(
      page,
      {
        currentSelectors: [
          ".qwen-thinking-selector",
          ".qwen-select-thinking"
        ],
        triggerSelectors: [
          ".qwen-thinking-selector .ant-select-selector",
          ".qwen-thinking-selector",
          ".qwen-select-thinking"
        ],
        labels: ["思考", "Thinking", "自动"],
        optionSelector: ".ant-select-item-option,[role='option'],button,div",
        required: true
      },
      timeoutMs
    );

    return {
      model: `${modelState.matched || modelState.selected || "Qwen3.6-Plus"} / ${
        thinkingState.matched || thinkingState.selected || "思考"
      }`
    };
  },
  async submitPrompt(page, prompt) {
    await submitPrompt(page, this.selectors.composer, prompt, {
      submitSelector: this.selectors.submit
    });

    const guestButton = page.locator("button").filter({ hasText: "保持注销状态" }).first();
    const dismissedLogin = await guestButton
      .waitFor({ state: "visible", timeout: 30000 })
      .then(() => true)
      .catch(() => false);
    if (dismissedLogin) {
      await guestButton.click({ timeout: shortTimeout(DEFAULT_TIMEOUT_MS, 5000) }).catch(async () => {
        await guestButton.click({ timeout: shortTimeout(DEFAULT_TIMEOUT_MS, 5000), force: true });
      });
      await page.waitForTimeout(500);
      await submitPrompt(page, this.selectors.composer, prompt, {
        submitSelector: this.selectors.submit
      });

      const reopened = await guestButton
        .waitFor({ state: "visible", timeout: 3000 })
        .then(() => true)
        .catch(() => false);
      if (reopened) {
        throw new Error("Qwen Studio 当前发送消息会再次弹出登录引导，请先完成登录后再运行。");
      }
    }
  }
};
