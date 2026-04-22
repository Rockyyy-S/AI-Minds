import { createSimpleChatSite } from "./shared/simple-chat.mjs";

export const chatgptSite = createSimpleChatSite({
  id: "chatgpt",
  label: "ChatGPT",
  baseUrl: "https://chatgpt.com/",
  requiresAuth: false,
  model: "ChatGPT",
  composer: [
    "#prompt-textarea",
    "[data-testid='prompt-textarea']",
    "div[contenteditable='true'][id='prompt-textarea']",
    "textarea"
  ],
  submit: [
    "button[data-testid='send-button']",
    "button[aria-label*='Send']",
    "button[aria-label*='发送']",
    "button[type='submit']"
  ],
  assistantMarkdown: [
    "[data-message-author-role='assistant'] .markdown",
    "[data-message-author-role='assistant']",
    "[class*='markdown']"
  ].join(", "),
  blockedText: ["正在进行安全验证", "Cloudflare", "请稍候", "Checking your browser"],
  blockedMessage: "ChatGPT 当前可能处于安全验证页，请先在浏览器中完成验证后重试。",
  afterOpenDelayMs: 1500
});
