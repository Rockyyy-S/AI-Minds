import { createSimpleChatSite } from "./shared/simple-chat.mjs";

export const manusSite = createSimpleChatSite({
  id: "manus",
  label: "Manus",
  baseUrl: "https://manus.im/",
  requiresAuth: true,
  model: "Manus Agent",
  composer: [
    ".tiptap.ProseMirror[contenteditable='true']",
    ".ProseMirror[contenteditable='true']",
    "[contenteditable='true']",
    "[role='textbox']",
    "textarea"
  ],
  submit: [
    ".flex.gap-2.ml-auto button",
    "button[type='submit']",
    "button[class*='send']",
    "button[class*='Button-black']",
    "button[aria-label*='Send']",
    "button[aria-label*='发送']"
  ],
  assistantMarkdown: [
    "[class*='markdown']",
    "[class*='message']",
    "[class*='response']",
    "article"
  ].join(", "),
  features: [
    {
      label: "Wide Research",
      selectors: ["a:has-text('Wide Research')", "button:has-text('Wide Research')"]
    }
  ],
  loginSelectors: [
    "button:has-text('登录')",
    "button:has-text('Log in')",
    "button:has-text('Sign in')"
  ],
  loginText: ["登录", "注册", "Log in", "Sign in"],
  loginMessage: "当前未登录 Manus。Manus 首页可以免登录输入，但提交任务会跳转登录页；请先执行 setup:manus 并完成登录。",
  afterOpenDelayMs: 1500
});
