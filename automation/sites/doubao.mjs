import { DEFAULT_TIMEOUT_MS, createSimpleChatSite, dismissCommonOverlays, shortTimeout } from "./shared/simple-chat.mjs";

const baseDoubaoSite = createSimpleChatSite({
  id: "doubao",
  label: "豆包",
  baseUrl: "https://www.doubao.com/chat/",
  requiresAuth: false,
  model: "思考",
  composer: [
    "textarea[placeholder*='发消息']",
    "textarea.semi-input-textarea",
    "textarea"
  ],
  submit: [
    "button[class*='bg-dbx-text-highlight']",
    "button[aria-label='发送']"
  ],
  assistantMarkdown: [
    ".flow-markdown-body",
    "[class*='flow-markdown-body']",
    "[class*='container-'][class*='flow-markdown-body']"
  ].join(", "),
  dismissText: ["关闭"],
  features: [
    { label: "快速", selectors: ["button:has-text('快速')"] }
  ],
  blockedText: ["请选择所有符合上文描述的图片", "验证码", "captcha_container", "请验证"],
  blockedSelectors: ["#captcha_container", "iframe[src*='verifycenter/captcha']", "iframe[src*='captcha']"],
  blockedMessage: "豆包当前触发了图片/验证码安全验证，需要先在浏览器中人工完成验证后再继续。",
  afterOpenDelayMs: 1500
});

export const doubaoSite = {
  ...baseDoubaoSite,
  async prepareForPrompt(page, options = {}) {
    const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);

    await dismissCommonOverlays(page, {
      timeoutMs: shortTimeout(timeoutMs, 3000)
    });

    const currentMode = page.getByRole("button", { name: /^(快速|思考|专家)/ }).first();
    await currentMode.waitFor({ state: "visible", timeout: shortTimeout(timeoutMs, 10000) });

    const currentText = await currentMode.innerText().then((text) => text.replace(/\s+/g, " ").trim()).catch(() => "");
    if (!currentText.includes("思考")) {
      await currentMode.click({ timeout: shortTimeout(timeoutMs, 5000) }).catch(async () => {
        await currentMode.click({ timeout: shortTimeout(timeoutMs, 5000), force: true });
      });

      const thinkingItem = page.getByRole("menuitem", { name: /^思考/ }).first();
      await thinkingItem.waitFor({ state: "visible", timeout: shortTimeout(timeoutMs, 5000) });
      await thinkingItem.click({ timeout: shortTimeout(timeoutMs, 5000) }).catch(async () => {
        await thinkingItem.click({ timeout: shortTimeout(timeoutMs, 5000), force: true });
      });
      await page.waitForTimeout(800);
    }

    const finalText = await currentMode.innerText().then((text) => text.replace(/\s+/g, " ").trim()).catch(() => "");
    if (!finalText.includes("思考")) {
      throw new Error("未能切换到豆包“思考”模式。");
    }

    return {
      model: "思考"
    };
  }
};
