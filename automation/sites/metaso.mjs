import {
  DEFAULT_TIMEOUT_MS,
  createSimpleChatSite,
  dismissCommonOverlays,
  shortTimeout,
  waitForAnswer
} from "./shared/simple-chat.mjs";

const DEEP_RESEARCH_TIMEOUT_MS = 600000;

const baseMetasoSite = createSimpleChatSite({
  id: "metaso",
  label: "秘塔AI搜索",
  baseUrl: "https://metaso.cn/",
  requiresAuth: false,
  model: "全网 + 深度研究",
  composer: [
    "textarea[placeholder*='Enter键发送']",
    "textarea[placeholder*='请输入']",
    "textarea"
  ],
  assistantMarkdown: [
    ".markdown-body",
    "[class*='markdown-body']"
  ].join(", "),
  dismissText: ["关闭"],
  submit: [
    "button[class*='send']",
    "button[aria-label='发送']"
  ],
  afterOpenDelayMs: 1500
});

async function ensureMetasoFullWeb(page, timeoutMs) {
  const activeRange = page.locator("[class*='active-range-name']").first();
  const currentRange = await activeRange.innerText({ timeout: shortTimeout(timeoutMs, 3000) }).catch(() => "");
  if (currentRange.includes("全网")) {
    return "全网";
  }

  const rangeButton = page.locator("button").filter({ hasText: /^全网|文库|学术|图片|视频|播客$/ }).first();
  await rangeButton.click({ timeout: shortTimeout(timeoutMs, 5000) }).catch(async () => {
    await rangeButton.click({ timeout: shortTimeout(timeoutMs, 5000), force: true });
  });
  await page.waitForTimeout(300);

  const fullWebItem = page.locator("[role='button'],button,div").filter({ hasText: /^全网$/ }).last();
  await fullWebItem.click({ timeout: shortTimeout(timeoutMs, 5000) }).catch(async () => {
    await fullWebItem.click({ timeout: shortTimeout(timeoutMs, 5000), force: true });
  });
  await page.waitForTimeout(500);
  return "全网";
}

async function ensureMetasoDeepResearch(page, timeoutMs) {
  const modeButton = page.locator("button[class*='meta-model-tab_tab']").filter({ hasText: "深度研究" }).first();
  await modeButton.waitFor({ state: "visible", timeout: shortTimeout(timeoutMs, 10000) });

  const isActive = await modeButton
    .evaluate((element) => String(element.className || "").includes("meta-model-tab_active"))
    .catch(() => false);

  if (!isActive) {
    await modeButton.click({ timeout: shortTimeout(timeoutMs, 5000) }).catch(async () => {
      await modeButton.click({ timeout: shortTimeout(timeoutMs, 5000), force: true });
    });
    await page.waitForTimeout(800);
  }

  const selected = await modeButton
    .evaluate((element) => String(element.className || "").includes("meta-model-tab_active"))
    .catch(() => false);
  if (!selected) {
    throw new Error("未能切换到秘塔 AI 搜索“深度研究”模式。");
  }

  return "深度研究";
}

export const metasoSite = {
  ...baseMetasoSite,
  async prepareForPrompt(page, options = {}) {
    const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
    await dismissCommonOverlays(page, { timeoutMs: shortTimeout(timeoutMs, 3000) });

    const range = await ensureMetasoFullWeb(page, timeoutMs);
    const mode = await ensureMetasoDeepResearch(page, timeoutMs);

    return {
      model: `${range} + ${mode}`
    };
  },
  async waitForAnswer(page, baselineState, options = {}) {
    return waitForAnswer(page, this.selectors.assistantMarkdown, baselineState, {
      ...options,
      timeoutMs: Math.max(Number(options.timeoutMs || DEFAULT_TIMEOUT_MS), DEEP_RESEARCH_TIMEOUT_MS)
    });
  }
};
