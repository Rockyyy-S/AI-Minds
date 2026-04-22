import { createSimpleChatSite } from "./shared/simple-chat.mjs";

export const grokSite = createSimpleChatSite({
  id: "grok",
  label: "Grok",
  baseUrl: "https://grok.com/",
  requiresAuth: true,
  model: "Grok",
  composer: [
    "textarea",
    "[contenteditable='true']",
    "[role='textbox']"
  ],
  submit: [
    "button[type='submit']",
    "button[aria-label*='Send']",
    "button[aria-label*='发送']",
    "button[class*='send']"
  ],
  assistantMarkdown: [
    "[class*='markdown']",
    "[class*='message']",
    "[class*='response']",
    "article"
  ].join(", "),
  loginSelectors: [
    "button:has-text('Sign in')",
    "button:has-text('Log in')",
    "a:has-text('Sign in')"
  ],
  blockedText: ["正在进行安全验证", "Cloudflare", "Ray ID"],
  blockedMessage: "Grok 当前触发了 Cloudflare 安全验证，请先在 setup:grok 打开的浏览器中完成验证和登录。",
  afterOpenDelayMs: 1500
});
