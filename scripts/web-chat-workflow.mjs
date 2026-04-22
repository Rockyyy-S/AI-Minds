import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { chromium } from "playwright";
import * as XLSX from "xlsx";

import { chatgptSite } from "../automation/sites/chatgpt.mjs";
import { deepseekSite } from "../automation/sites/deepseek.mjs";
import { doubaoSite } from "../automation/sites/doubao.mjs";
import { geminiSite } from "../automation/sites/gemini.mjs";
import { grokSite } from "../automation/sites/grok.mjs";
import { kimiSite } from "../automation/sites/kimi.mjs";
import { manusSite } from "../automation/sites/manus.mjs";
import { metasoSite } from "../automation/sites/metaso.mjs";
import { perplexitySite } from "../automation/sites/perplexity.mjs";
import { qwenSite } from "../automation/sites/qwen.mjs";
import { yuanbaoSite } from "../automation/sites/yuanbao.mjs";
import { yiyanSite } from "../automation/sites/yiyan.mjs";
import { zaiSite } from "../automation/sites/zai.mjs";

const siteRegistry = {
  kimi: kimiSite,
  deepseek: deepseekSite,
  zai: zaiSite,
  qwen: qwenSite,
  doubao: doubaoSite,
  metaso: metasoSite,
  yiyan: yiyanSite,
  yuanbao: yuanbaoSite,
  manus: manusSite,
  grok: grokSite,
  chatgpt: chatgptSite,
  gemini: geminiSite,
  perplexity: perplexitySite
};

const DEFAULT_TIMEOUT_MS = 180000;
const DEFAULT_SETTLE_INTERVAL_MS = 2000;
const DEFAULT_SETTLE_ROUNDS = 3;
const DEFAULT_RETRIES = 1;
const DEFAULT_CONFIG_FILE = "workflow.config.json";

function printUsage() {
  console.log(
    `
可用命令:
  node scripts/web-chat-workflow.mjs setup --site kimi
  node scripts/web-chat-workflow.mjs setup --site deepseek
  node scripts/web-chat-workflow.mjs setup --site zai
  node scripts/web-chat-workflow.mjs setup --site chatgpt
  node scripts/web-chat-workflow.mjs setup --site qwen --force-setup
  node scripts/web-chat-workflow.mjs setup --config workflow.config.json
  node scripts/web-chat-workflow.mjs run --site kimi --prompt "问题" --output output/kimi.md
  node scripts/web-chat-workflow.mjs run --site deepseek --prompt "问题" --output output/deepseek.md
  node scripts/web-chat-workflow.mjs run --site zai --prompt "问题" --output output/zai.md
  node scripts/web-chat-workflow.mjs run --site chatgpt --prompt "问题" --output output/chatgpt.md
  node scripts/web-chat-workflow.mjs run --site kimi,deepseek --prompt "问题" --output output/{site}.md
  node scripts/web-chat-workflow.mjs run --config workflow.config.json --prompt "问题" --output output/{site}.md
  node scripts/web-chat-workflow.mjs run --site kimi --prompt-file prompts/初步方案提示词.md --output output/answer.md
  node scripts/web-chat-workflow.mjs run --site deepseek --prompt-file prompts/初步方案提示词.md --output output/answer.md
  node scripts/web-chat-workflow.mjs batch --site kimi --tasks tasks/kimi-tasks.example.json
  node scripts/web-chat-workflow.mjs batch --site deepseek --tasks tasks/deepseek-tasks.example.json
  node scripts/web-chat-workflow.mjs batch --config workflow.config.json --tasks tasks/multi-site-tasks.example.json
  node scripts/web-chat-workflow.mjs batch --site kimi --tasks tasks/kimi-tasks.example.csv
  node scripts/web-chat-workflow.mjs batch --site kimi --tasks tasks/kimi-tasks.example.xlsx
  node scripts/web-chat-workflow.mjs validate --tasks tasks/kimi-tasks.example.xlsx

常用参数:
  --site kimi|deepseek|zai|qwen|doubao|metaso|yiyan|yuanbao|manus|grok|chatgpt|gemini|perplexity，也支持 kimi,deepseek
  --config workflow.config.json  未传 --site 时会自动尝试读取当前目录下的 workflow.config.json
  --prompt "直接传入提示词"
  --prompt-file prompts/example.md
  --output output/result.md
  --output output/{site}/result.md
  --tasks tasks/kimi-tasks.example.json
  --auth-file .auth/kimi.json
  --force-setup  对免登录站点也强制打开浏览器并保存登录态
  --channel chrome
  --headless
  --timeout-ms 180000
  --settle-interval-ms 2000
  --settle-rounds 3
  --retries 1
  --timestamp-output

批量任务支持字段:
  name / title / taskname / 名称 / 任务名
  prompt / question / message / text / 提示词 / 问题 / 提问内容
  promptFile / prompt_file / prompt_path / 提示词文件 / 提示词路径
  output / outfile / outputpath / 输出 / 输出文件 / 输出路径
  retries / retry / 重试次数 / 重试
  timestamp / timestampOutput / timestamp_output / 时间戳 / 加时间戳
`.trim()
  );
}

function parseArgs(argv) {
  const [command = "help", ...rest] = argv;
  const options = {};

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];

    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const next = rest[index + 1];

    if (!next || next.startsWith("--")) {
      options[key] = true;
      continue;
    }

    options[key] = next;
    index += 1;
  }

  return { command, options };
}

function getSite(siteId) {
  const site = siteRegistry[siteId];
  if (!site) {
    throw new Error(`未找到站点适配：${siteId}`);
  }
  return site;
}

function resolvePath(targetPath) {
  return path.resolve(process.cwd(), targetPath);
}

function normalizeSiteId(value) {
  return String(value || "").trim().toLowerCase();
}

function parseSiteIdList(value, fieldLabel = "站点") {
  const ids = String(value || "")
    .split(",")
    .map(normalizeSiteId)
    .filter(Boolean);

  if (!ids.length) {
    throw new Error(`${fieldLabel} 不能为空`);
  }

  return [...new Set(ids)];
}

function hasExplicitAuthPath(options, sitePlan = {}) {
  return Boolean(options["auth-file"] || sitePlan.authFile);
}

function isAuthRequired(options, site, sitePlan = {}) {
  return site.requiresAuth !== false || hasExplicitAuthPath(options, sitePlan);
}

function getAuthPath(options, site, sitePlan = {}, { forSetup = false } = {}) {
  if (site.requiresAuth === false && !hasExplicitAuthPath(options, sitePlan) && forSetup && !options["force-setup"]) {
    return null;
  }

  return resolvePath(options["auth-file"] || sitePlan.authFile || path.join(".auth", `${site.id}.json`));
}

async function ensureDirectoryForFile(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function padNumber(value) {
  return String(value).padStart(2, "0");
}

function formatTimestamp(date = new Date()) {
  return [
    String(date.getFullYear()),
    padNumber(date.getMonth() + 1),
    padNumber(date.getDate())
  ].join("") + "-" + [padNumber(date.getHours()), padNumber(date.getMinutes()), padNumber(date.getSeconds())].join("");
}

function sanitizeLabel(value) {
  return String(value || "task")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "task";
}

function parseOptionalBoolean(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  const normalized = String(value).trim().toLowerCase();

  if (["1", "true", "yes", "y", "on", "是", "开", "开启"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "n", "off", "否", "关", "关闭"].includes(normalized)) {
    return false;
  }

  return undefined;
}

function parseOptionalInteger(value, fieldLabel) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${fieldLabel} 必须是大于等于 0 的整数，当前值为：${value}`);
  }

  return parsed;
}

function pickFirstDefined(source, keys) {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== "") {
      return source[key];
    }
  }
  return undefined;
}

function normalizeTask(rawTask, index) {
  if (!rawTask || typeof rawTask !== "object") {
    throw new Error(`第 ${index + 1} 个任务格式无效`);
  }

  const task = {
    name: pickFirstDefined(rawTask, ["name", "title", "taskname", "任务名", "名称"]),
    prompt: pickFirstDefined(rawTask, ["prompt", "question", "message", "text", "提示词", "问题", "提问内容"]),
    promptFile: pickFirstDefined(rawTask, [
      "promptFile",
      "promptfile",
      "prompt_file",
      "promptpath",
      "prompt_path",
      "提示词文件",
      "提示词路径"
    ]),
    output: pickFirstDefined(rawTask, ["output", "outfile", "outputpath", "输出", "输出文件", "输出路径"]),
    timestamp: parseOptionalBoolean(
      pickFirstDefined(rawTask, ["timestamp", "timestampoutput", "timestamp_output", "时间戳", "加时间戳"])
    ),
    retries: parseOptionalInteger(
      pickFirstDefined(rawTask, ["retries", "retry", "重试次数", "重试"]),
      `第 ${index + 1} 个任务的重试次数`
    )
  };

  if (!task.prompt && !task.promptFile) {
    throw new Error(`第 ${index + 1} 个任务缺少 prompt 或 promptFile`);
  }

  if (!task.output) {
    throw new Error(`第 ${index + 1} 个任务缺少 output`);
  }

  return task;
}

function normalizeHeaderName(header) {
  return String(header || "")
    .replace(/^\ufeff/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function parseCsvRows(content) {
  const rows = [];
  let currentRow = [];
  let currentCell = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (inQuotes) {
      if (char === "\"") {
        if (next === "\"") {
          currentCell += "\"";
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        currentCell += char;
      }
      continue;
    }

    if (char === "\"") {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if (char === "\n") {
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = "";
      continue;
    }

    if (char !== "\r") {
      currentCell += char;
    }
  }

  if (currentCell !== "" || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows.filter((row) => row.some((cell) => String(cell || "").trim() !== ""));
}

function rowsToTaskObjects(rows) {
  if (rows.length < 2) {
    throw new Error("任务表至少需要 1 行表头和 1 行数据");
  }

  const headers = rows[0];
  return rows.slice(1).map((row) => {
    const record = {};

    headers.forEach((header, index) => {
      const original = String(header || "").trim();
      const normalized = normalizeHeaderName(header);
      const value = row[index] !== undefined ? String(row[index]).trim() : "";

      if (original) {
        record[original] = value;
      }

      if (normalized) {
        record[normalized] = value;
      }
    });

    return record;
  });
}

async function loadJsonTasks(tasksPath) {
  const content = await fs.readFile(tasksPath, "utf8");
  const parsed = JSON.parse(content);
  const tasks = Array.isArray(parsed) ? parsed : parsed.tasks;

  if (!Array.isArray(tasks) || tasks.length === 0) {
    throw new Error("tasks 文件中没有可执行任务");
  }

  return tasks;
}

async function loadCsvTasks(tasksPath) {
  const content = await fs.readFile(tasksPath, "utf8");
  const rows = parseCsvRows(content);
  return rowsToTaskObjects(rows);
}

async function loadExcelTasks(tasksPath) {
  const buffer = await fs.readFile(tasksPath);
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    throw new Error("Excel 文件中没有可读取的工作表");
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: ""
  });

  return rowsToTaskObjects(rows);
}

async function loadBatchTasks(tasksPath) {
  const resolvedPath = resolvePath(tasksPath);
  const extension = path.extname(resolvedPath).toLowerCase();
  let rawTasks;

  switch (extension) {
    case ".json":
      rawTasks = await loadJsonTasks(resolvedPath);
      break;
    case ".csv":
      rawTasks = await loadCsvTasks(resolvedPath);
      break;
    case ".xlsx":
    case ".xls":
      rawTasks = await loadExcelTasks(resolvedPath);
      break;
    default:
      throw new Error(`暂不支持的 tasks 文件类型：${extension || "无扩展名"}`);
  }

  if (!Array.isArray(rawTasks) || rawTasks.length === 0) {
    throw new Error("tasks 文件中没有可执行任务");
  }

  return rawTasks.map(normalizeTask);
}

function normalizeConfigSite(rawSite, index) {
  if (typeof rawSite === "string") {
    const id = normalizeSiteId(rawSite);
    if (!id) {
      throw new Error(`配置文件中第 ${index + 1} 个站点 id 不能为空`);
    }

    return {
      id,
      enabled: true
    };
  }

  if (!rawSite || typeof rawSite !== "object") {
    throw new Error(`配置文件中第 ${index + 1} 个站点格式无效`);
  }

  const id = normalizeSiteId(rawSite.id || rawSite.site);
  if (!id) {
    throw new Error(`配置文件中第 ${index + 1} 个站点缺少 id`);
  }

  return {
    id,
    enabled: parseOptionalBoolean(rawSite.enabled) ?? true,
    authFile: pickFirstDefined(rawSite, ["authFile", "auth_file", "authPath", "auth_path"])
  };
}

async function loadWorkflowConfig(options, { allowDefault = true } = {}) {
  let configPath = options.config ? resolvePath(options.config) : null;

  if (!configPath && allowDefault) {
    const defaultPath = resolvePath(DEFAULT_CONFIG_FILE);
    if (await fileExists(defaultPath)) {
      configPath = defaultPath;
    }
  }

  if (!configPath) {
    return null;
  }

  const content = await fs.readFile(configPath, "utf8");
  const parsed = JSON.parse(content);

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`配置文件格式无效：${configPath}`);
  }

  if (!Array.isArray(parsed.sites) || parsed.sites.length === 0) {
    throw new Error(`配置文件中的 sites 不能为空：${configPath}`);
  }

  const sites = parsed.sites.map(normalizeConfigSite);
  const enabledSites = sites.filter((site) => site.enabled);

  if (!enabledSites.length) {
    throw new Error(`配置文件中没有启用的站点：${configPath}`);
  }

  return {
    path: configPath,
    sites,
    enabledSites
  };
}

async function resolveSitePlans(options, { allowEmpty = false } = {}) {
  const explicitSiteIds = options.site ? parseSiteIdList(options.site, "--site") : [];
  const workflowConfig = await loadWorkflowConfig(options, {
    allowDefault: explicitSiteIds.length === 0 || Boolean(options.config)
  });

  const configSiteMap = new Map((workflowConfig?.sites || []).map((site) => [site.id, site]));
  const targetSiteIds = explicitSiteIds.length
    ? explicitSiteIds
    : workflowConfig
      ? workflowConfig.enabledSites.map((site) => site.id)
      : [];

  if (targetSiteIds.length > 1 && options["auth-file"]) {
    throw new Error("多站点执行时不支持共用 --auth-file，请改为在配置文件里为各站点分别配置 authFile。");
  }

  if (!targetSiteIds.length) {
    if (allowEmpty) {
      return { workflowConfig, sitePlans: [] };
    }

    throw new Error(
      `请通过 --site 指定站点，或在 ${DEFAULT_CONFIG_FILE} 中配置 sites，例如 kimi、deepseek。`
    );
  }

  const sitePlans = targetSiteIds.map((siteId) => {
    const site = getSite(siteId);
    const configSite = configSiteMap.get(siteId);
    return {
      id: site.id,
      site,
      authFile: configSite?.authFile ? String(configSite.authFile).trim() : undefined
    };
  });

  return { workflowConfig, sitePlans };
}

function resolveRunTimestamp(options) {
  return options["timestamp-value"] || formatTimestamp();
}

function applySiteOutputPath(outputPath, siteContext = {}) {
  const siteId = siteContext.siteId;
  if (!siteId) {
    return outputPath;
  }

  if (outputPath.includes("{site}")) {
    return outputPath.replaceAll("{site}", siteId);
  }

  if (!siteContext.isMultiSite) {
    return outputPath;
  }

  const parsed = path.parse(outputPath);
  return path.join(parsed.dir, `${parsed.name}-${siteId}${parsed.ext}`);
}

function resolveOutputPath(task, options, runTimestamp, siteContext = {}) {
  let outputPath = applySiteOutputPath(String(task.output), siteContext);
  const timestampEnabled = parseOptionalBoolean(task.timestamp) ?? parseOptionalBoolean(options["timestamp-output"]) ?? false;

  if (outputPath.includes("{timestamp}")) {
    return outputPath.replaceAll("{timestamp}", runTimestamp);
  }

  if (!timestampEnabled) {
    return outputPath;
  }

  const parsed = path.parse(outputPath);
  return path.join(parsed.dir, `${parsed.name}-${runTimestamp}${parsed.ext}`);
}

async function readPrompt(task) {
  if (task.prompt) {
    return String(task.prompt).trim();
  }

  if (task.promptFile) {
    const promptPath = resolvePath(task.promptFile);
    const content = await fs.readFile(promptPath, "utf8");
    return content.trim();
  }

  throw new Error("任务缺少 prompt 或 promptFile");
}

async function writeMarkdown(outputPath, markdown) {
  const finalPath = resolvePath(outputPath);
  await ensureDirectoryForFile(finalPath);
  await fs.writeFile(finalPath, markdown, "utf8");
  return finalPath;
}

async function captureFailureArtifacts(page, label, metadata = {}) {
  const baseName = `${Date.now()}-${sanitizeLabel(label)}`;
  const basePath = resolvePath(path.join("output", "playwright", baseName));
  await ensureDirectoryForFile(basePath);

  const artifacts = {
    screenshot: null,
    html: null,
    meta: null
  };

  try {
    if (!page.isClosed()) {
      const screenshotPath = `${basePath}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
      artifacts.screenshot = screenshotPath;
    }
  } catch {}

  try {
    if (!page.isClosed()) {
      const htmlPath = `${basePath}.html`;
      const html = await page.content();
      await fs.writeFile(htmlPath, html, "utf8");
      artifacts.html = htmlPath;
    }
  } catch {}

  try {
    const metaPath = `${basePath}.json`;
    const meta = {
      capturedAt: new Date().toISOString(),
      url: !page.isClosed() ? page.url() : null,
      title: !page.isClosed() ? await page.title().catch(() => null) : null,
      ...metadata
    };
    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), "utf8");
    artifacts.meta = metaPath;
  } catch {}

  return artifacts;
}

function formatArtifactsMessage(artifacts) {
  const lines = [];

  if (artifacts.screenshot) {
    lines.push(`截图：${artifacts.screenshot}`);
  }

  if (artifacts.html) {
    lines.push(`HTML：${artifacts.html}`);
  }

  if (artifacts.meta) {
    lines.push(`元数据：${artifacts.meta}`);
  }

  return lines.join(" | ");
}

function getRetryCount(task, options) {
  const taskValue = parseOptionalInteger(task.retries, "任务重试次数");
  const optionValue = parseOptionalInteger(options.retries, "命令行重试次数");
  return taskValue ?? optionValue ?? DEFAULT_RETRIES;
}

async function createBrowser(options) {
  const channel = options.channel || "chrome";
  const headless = Boolean(options.headless);

  try {
    return await chromium.launch({
      channel,
      headless
    });
  } catch (error) {
    throw new Error(
      `浏览器启动失败，请确认本机已安装 ${channel}，或改用 --channel msedge。原始错误: ${error.message}`
    );
  }
}

async function createContext(browser, authPath) {
  const hasAuth = authPath ? await fileExists(authPath) : false;
  return browser.newContext({
    locale: "zh-CN",
    storageState: hasAuth ? authPath : undefined
  });
}

async function promptForEnter(message) {
  const rl = readline.createInterface({ input, output });
  await rl.question(`${message}\n按 Enter 继续...`);
  rl.close();
}

async function runSingleTask({ page, site, task, options, runTimestamp, siteContext }) {
  const promptText = await readPrompt(task);
  const outputPath = resolveOutputPath(task, options, runTimestamp, siteContext);
  await site.openFreshChat(page);
  await site.ensureReady(page, Number(options["timeout-ms"] || DEFAULT_TIMEOUT_MS));

  if (site.prepareForPrompt) {
    const preparedState = await site.prepareForPrompt(page, {
      timeoutMs: Number(options["timeout-ms"] || DEFAULT_TIMEOUT_MS)
    });

    if (preparedState?.model) {
      console.log(`[${site.label}] 使用模型：${preparedState.model}`);
    }
  }

  const baselineState = site.captureAnswerState
    ? await site.captureAnswerState(page)
    : { count: await page.locator(site.selectors.assistantMarkdown).count(), text: "" };

  console.log(`\n[${site.label}] 开始提问 -> ${outputPath}`);
  await site.submitPrompt(page, promptText);

  const markdown = await site.waitForAnswer(page, baselineState, {
    timeoutMs: options["timeout-ms"] || DEFAULT_TIMEOUT_MS,
    settleIntervalMs: options["settle-interval-ms"] || DEFAULT_SETTLE_INTERVAL_MS,
    settleRounds: options["settle-rounds"] || DEFAULT_SETTLE_ROUNDS
  });

  const savedPath = await writeMarkdown(outputPath, markdown);
  console.log(`[${site.label}] 已写入 ${savedPath}`);
  return savedPath;
}

async function executeTaskWithRetry({ context, site, task, options, runTimestamp, taskIndex, siteContext }) {
  const retries = getRetryCount(task, options);
  const totalAttempts = retries + 1;
  let lastError;

  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    const page = await context.newPage();

    try {
      if (totalAttempts > 1) {
        console.log(`[${site.label}] 尝试 ${attempt}/${totalAttempts}`);
      }

      return await runSingleTask({ page, site, task, options, runTimestamp, siteContext });
    } catch (error) {
      lastError = error;
      const artifacts = await captureFailureArtifacts(page, `${site.id}-task-${taskIndex + 1}-attempt-${attempt}`, {
        taskIndex: taskIndex + 1,
        taskName: task.name || null,
        attempt,
        totalAttempts,
        output: task.output,
        siteId: site.id
      });
      const artifactMessage = formatArtifactsMessage(artifacts);

      if (artifactMessage) {
        console.error(`[${site.label}] 失败调试文件已保存：${artifactMessage}`);
      }

      if (attempt < totalAttempts) {
        console.error(`[${site.label}] 第 ${attempt} 次执行失败，准备重试...`);
      }
    } finally {
      if (!page.isClosed()) {
        await page.close().catch(() => {});
      }
    }
  }

  throw lastError;
}

async function runSetup(sitePlan, options) {
  const { site } = sitePlan;
  const authPath = getAuthPath(options, site, sitePlan, { forSetup: true });

  if (!authPath) {
    console.log(`\n[${site.label}] 当前站点支持免登录运行，跳过 setup。`);
    console.log(`如果仍想保存登录态，请追加 --force-setup，例如：npm run setup:${site.id} -- --force-setup`);
    return;
  }

  const browser = await createBrowser({ ...options, headless: false });
  const context = await createContext(browser, authPath);
  const page = await context.newPage();

  try {
    await page.goto(site.baseUrl, { waitUntil: "domcontentloaded" });
    console.log(`\n请在打开的浏览器中完成 ${site.label} 登录。`);
    console.log(`登录完成后，页面上应能看到提问输入框。`);
    await promptForEnter("确认浏览器里已经处于可提问状态后");
    await site.ensureReady(page, Number(options["timeout-ms"] || DEFAULT_TIMEOUT_MS));

    await ensureDirectoryForFile(authPath);
    await context.storageState({ path: authPath });
    console.log(`\n登录态已保存到 ${authPath}`);
  } finally {
    await browser.close();
  }
}

async function runWorkflow(sitePlan, options, siteContext) {
  const { site } = sitePlan;
  const authPath = getAuthPath(options, site, sitePlan);

  if (authPath && !(await fileExists(authPath)) && isAuthRequired(options, site, sitePlan)) {
    throw new Error(`未找到登录态文件：${authPath}\n请先执行 setup 命令。`);
  }

  const browser = await createBrowser(options);
  const context = await createContext(browser, authPath);
  const runTimestamp = resolveRunTimestamp(options);

  try {
    const task = normalizeTask(
      {
        prompt: options.prompt,
        promptFile: options["prompt-file"],
        output: options.output,
        retries: options.retries,
        timestamp: options["timestamp-output"]
      },
      0
    );

    await executeTaskWithRetry({
      context,
      site,
      task,
      options,
      runTimestamp,
      taskIndex: 0,
      siteContext
    });
  } finally {
    await browser.close();
  }
}

async function runBatchWorkflow(sitePlan, options, siteContext) {
  const { site } = sitePlan;
  const authPath = getAuthPath(options, site, sitePlan);

  if (authPath && !(await fileExists(authPath)) && isAuthRequired(options, site, sitePlan)) {
    throw new Error(`未找到登录态文件：${authPath}\n请先执行 setup 命令。`);
  }

  if (!options.tasks) {
    throw new Error("batch 命令需要提供 --tasks");
  }

  const tasks = await loadBatchTasks(options.tasks);
  const browser = await createBrowser(options);
  const context = await createContext(browser, authPath);
  const runTimestamp = resolveRunTimestamp(options);

  try {
    for (let index = 0; index < tasks.length; index += 1) {
      const task = tasks[index];
      const label = task.name ? `${index + 1}/${tasks.length} ${task.name}` : `${index + 1}/${tasks.length}`;
      console.log(`\n===== 任务 ${label} =====`);
      await executeTaskWithRetry({
        context,
        site,
        task,
        options,
        runTimestamp,
        taskIndex: index,
        siteContext
      });
    }
  } finally {
    await browser.close();
  }
}

async function runValidate(options) {
  if (!options.tasks) {
    throw new Error("validate 命令需要提供 --tasks");
  }

  const tasks = await loadBatchTasks(options.tasks);
  const runTimestamp = resolveRunTimestamp(options);
  const { workflowConfig, sitePlans } = await resolveSitePlans(options, { allowEmpty: true });

  console.log(`任务文件校验通过：${resolvePath(options.tasks)}`);
  console.log(`任务数量：${tasks.length}`);

  if (workflowConfig) {
    console.log(`站点配置：${workflowConfig.path}`);
  }

  if (!sitePlans.length) {
    tasks.forEach((task, index) => {
      const outputPath = resolveOutputPath(task, options, runTimestamp);
      const source = task.prompt ? "prompt" : `promptFile:${task.promptFile}`;
      const name = task.name ? ` ${task.name}` : "";
      console.log(`${index + 1}.${name} -> ${outputPath} (${source})`);
    });
    return;
  }

  for (const sitePlan of sitePlans) {
    console.log(`\n[${sitePlan.site.label}]`);
    tasks.forEach((task, index) => {
      const outputPath = resolveOutputPath(task, options, runTimestamp, {
        siteId: sitePlan.site.id,
        isMultiSite: sitePlans.length > 1
      });
      const source = task.prompt ? "prompt" : `promptFile:${task.promptFile}`;
      const name = task.name ? ` ${task.name}` : "";
      console.log(`${index + 1}.${name} -> ${outputPath} (${source})`);
    });
  }
}

function formatSiteLabels(sitePlans) {
  return sitePlans.map((sitePlan) => sitePlan.site.label).join("、");
}

async function runCommandForSites(command, sitePlans, options) {
  const failures = [];

  for (let index = 0; index < sitePlans.length; index += 1) {
    const sitePlan = sitePlans[index];
    const siteContext = {
      siteId: sitePlan.site.id,
      isMultiSite: sitePlans.length > 1
    };

    if (sitePlans.length > 1) {
      console.log(`\n========== 站点 ${index + 1}/${sitePlans.length}：${sitePlan.site.label} ==========`);
    }

    try {
      switch (command) {
        case "setup":
          await runSetup(sitePlan, options);
          break;
        case "run":
          await runWorkflow(sitePlan, options, siteContext);
          break;
        case "batch":
          await runBatchWorkflow(sitePlan, options, siteContext);
          break;
        default:
          throw new Error(`未知命令：${command}`);
      }
    } catch (error) {
      failures.push({
        siteLabel: sitePlan.site.label,
        message: error.message
      });
      console.error(`[${sitePlan.site.label}] 执行失败：${error.message}`);
    }
  }

  if (failures.length) {
    throw new Error(
      `以下站点执行失败：${failures.map((item) => `${item.siteLabel}（${item.message}）`).join("；")}`
    );
  }
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));

  if (command === "help" || options.help) {
    printUsage();
    return;
  }

  if (command === "validate") {
    await runValidate(options);
    return;
  }

  const { workflowConfig, sitePlans } = await resolveSitePlans(options);

  if (workflowConfig && !options.site) {
    console.log(`使用站点配置：${workflowConfig.path}`);
  }

  console.log(`目标站点：${formatSiteLabels(sitePlans)}`);
  await runCommandForSites(command, sitePlans, options);
}

main().catch((error) => {
  console.error(`\n执行失败：${error.message}`);
  process.exitCode = 1;
});
