import { createSimpleChatSite } from "./shared/simple-chat.mjs";

export const perplexitySite = createSimpleChatSite({
  id: "perplexity",
  label: "Perplexity",
  baseUrl: "https://www.perplexity.ai/",
  requiresAuth: false,
  model: "Perplexity",
  composer: [
    "textarea",
    "[contenteditable='true']",
    "[role='textbox']"
  ],
  submit: [
    "button[type='submit']",
    "button[aria-label*='Submit']",
    "button[aria-label*='Send']",
    "button[class*='submit']"
  ],
  assistantMarkdown: [
    "[class*='answer']",
    "[class*='prose']",
    "[class*='markdown']",
    "article"
  ].join(", "),
  blockedText: ["正在进行安全验证", "Cloudflare", "Ray ID"],
  blockedMessage: "Perplexity 当前触发了 Cloudflare 安全验证，请先在浏览器中完成验证后重试。",
  afterOpenDelayMs: 1500
});
