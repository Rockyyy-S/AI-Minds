import { DEFAULT_TIMEOUT_MS, createSimpleChatSite, dismissCommonOverlays, shortTimeout } from "./shared/simple-chat.mjs";

const baseGeminiSite = createSimpleChatSite({
  id: "gemini",
  label: "Gemini",
  baseUrl: "https://gemini.google.com/",
  requiresAuth: false,
  model: "Gemini 3 / 思考",
  composer: [
    "div[role='textbox'][aria-label*='Gemini']",
    ".ql-editor[role='textbox']",
    ".ql-editor",
    "[contenteditable='true']",
    "textarea"
  ],
  submit: [
    "button.send-button",
    "button[aria-label='发送']",
    "button[aria-label*='Send']",
    "button[type='submit']"
  ],
  assistantMarkdown: [
    "structured-content-container message-content .markdown",
    "message-content .markdown"
  ].join(", "),
  features: [
    {
      label: "快速",
      selectors: [
        "button[aria-label='打开模式选择器']",
        "button:has-text('快速')"
      ]
    },
    {
      label: "研究",
      selectors: ["button[aria-label*='研究']", "button:has-text('研究')"]
    }
  ],
  afterOpenDelayMs: 1500
});

export const geminiSite = {
  ...baseGeminiSite,
  async prepareForPrompt(page, options = {}) {
    const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);

    await dismissCommonOverlays(page, {
      timeoutMs: shortTimeout(timeoutMs, 3000)
    });

    const modeButton = page
      .locator("button[aria-label='打开模式选择器'], button[aria-label*='模式选择器']")
      .first();
    await modeButton.waitFor({ state: "visible", timeout: shortTimeout(timeoutMs, 10000) });

    const currentText = await modeButton.innerText().then((text) => text.replace(/\s+/g, " ").trim()).catch(() => "");
    if (!currentText.includes("思考")) {
      await modeButton.click({ timeout: shortTimeout(timeoutMs, 5000) }).catch(async () => {
        await modeButton.click({ timeout: shortTimeout(timeoutMs, 5000), force: true });
      });

      const thinkingItem = page.locator(".bard-mode-list-button,[role='menuitem']").filter({ hasText: "思考" }).first();
      const visible = await thinkingItem.isVisible({ timeout: shortTimeout(timeoutMs, 5000) }).catch(() => false);
      if (visible) {
        await thinkingItem.click({ timeout: shortTimeout(timeoutMs, 5000) }).catch(async () => {
          await thinkingItem.click({ timeout: shortTimeout(timeoutMs, 5000), force: true });
        });
        await page.waitForTimeout(800);
      }
    }

    const finalText = await modeButton.innerText().then((text) => text.replace(/\s+/g, " ").trim()).catch(() => "");

    return {
      model: finalText.includes("思考") ? "Gemini 3 / 思考" : `Gemini 3 / ${finalText || "快速"}`
    };
  }
};
