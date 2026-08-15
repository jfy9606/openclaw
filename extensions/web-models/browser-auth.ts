import {
  getBrowserWebAuthHeaders,
  getBrowserWebSocketUrl,
  launchBrowserWebAuthChrome,
  resolveBrowserWebAuthConfig,
  resolveBrowserWebAuthProfile,
  stopBrowserWebAuthChrome,
  type BrowserWebAuthChromeHandle,
} from "openclaw/plugin-sdk/browser-web-auth";
import type { OpenClawConfig } from "openclaw/plugin-sdk/provider-onboard";
import type { WizardProgress } from "openclaw/plugin-sdk/setup";
import {
  chromium,
  type BrowserContext,
  type Page,
  type Request,
  type Response,
} from "playwright-core";
import {
  getWebModelProvider,
  type BrowserBackedWebModelProviderId,
  type WebModelManualAuthInput,
} from "./api.js";

type BrowserAuthSession = {
  context: BrowserContext;
  cookieUrls: string[];
  page: Page;
  progress: WizardProgress;
  userAgent: string;
};

type WaitForCaptureParams<TState, TResult> = {
  page: Page;
  state: TState;
  tryCapture: (state: TState) => Promise<TResult | null>;
  timeoutMessage: string;
  onRequest?: (state: TState, request: Request) => Promise<void> | void;
  onResponse?: (state: TState, response: Response) => Promise<void> | void;
  onFrameNavigated?: (state: TState) => Promise<void> | void;
};

const FIVE_MINUTES_MS = 300_000;

const AUTO_LOGIN_TITLES: Record<BrowserBackedWebModelProviderId, string> = {
  "chatgpt-web": "ChatGPT Browser Login",
  "claude-web": "Claude Browser Login",
  "deepseek-web": "DeepSeek Browser Login",
  "doubao-web": "Doubao Browser Login",
  "gemini-web": "Gemini Browser Login",
  "glm-web": "GLM Browser Login",
  "glm-intl-web": "GLM International Browser Login",
  "grok-web": "Grok Browser Login",
  "kimi-web": "Kimi Browser Login",
  "perplexity-web": "Perplexity Browser Login",
  "qwen-web": "Qwen Browser Login",
  "qwen-cn-web": "Qwen CN Browser Login",
  "xiaomimo-web": "Xiaomi MiMo Browser Login",
};

const AUTO_LOGIN_URLS: Record<BrowserBackedWebModelProviderId, string> = {
  "chatgpt-web": "https://chatgpt.com/",
  "claude-web": "https://claude.ai/",
  "deepseek-web": "https://chat.deepseek.com/",
  "doubao-web": "https://www.doubao.com/chat/",
  "gemini-web": "https://gemini.google.com/app",
  "glm-web": "https://chatglm.cn/",
  "glm-intl-web": "https://chat.z.ai/",
  "grok-web": "https://grok.com/",
  "kimi-web": "https://www.kimi.com/",
  "perplexity-web": "https://www.perplexity.ai/",
  "qwen-web": "https://chat.qwen.ai/",
  "qwen-cn-web": "https://www.qianwen.com/",
  "xiaomimo-web": "https://aistudio.xiaomimimo.com/#/",
};

const COOKIE_URL_OVERRIDES: Partial<Record<BrowserBackedWebModelProviderId, string[]>> = {
  "chatgpt-web": ["https://chatgpt.com", "https://chat.openai.com"],
  "claude-web": ["https://claude.ai", "https://www.claude.ai"],
  "deepseek-web": ["https://chat.deepseek.com", "https://deepseek.com"],
  "doubao-web": ["https://www.doubao.com", "https://doubao.com"],
  "glm-web": ["https://chatglm.cn"],
  "glm-intl-web": ["https://chat.z.ai"],
  "perplexity-web": ["https://www.perplexity.ai", "https://perplexity.ai"],
  "qwen-web": ["https://chat.qwen.ai", "https://qwen.ai"],
  "qwen-cn-web": ["https://www.qianwen.com", "https://chat2.qianwen.com"],
  "xiaomimo-web": ["https://aistudio.xiaomimimo.com"],
};

export async function captureWebModelBrowserAuthInput(params: {
  config: OpenClawConfig;
  openUrl: (url: string) => Promise<void>;
  progress: WizardProgress;
  prompter: {
    note: (message: string, title?: string) => Promise<void>;
  };
  providerId: BrowserBackedWebModelProviderId;
}): Promise<WebModelManualAuthInput> {
  const label = getWebModelProvider(params.providerId).label;
  await params.prompter.note(
    [
      `OpenClaw will open or attach to Chrome for ${label}.`,
      "Login in the browser window and the session will be captured automatically.",
      "If automatic capture fails, rerun provider auth and choose the manual paste method.",
    ].join("\n"),
    AUTO_LOGIN_TITLES[params.providerId],
  );

  return await withBrowserAuthSession(
    {
      config: params.config,
      loginUrl: AUTO_LOGIN_URLS[params.providerId],
      openUrl: params.openUrl,
      progress: params.progress,
      providerId: params.providerId,
    },
    async (session) => {
      switch (params.providerId) {
        case "chatgpt-web":
          return await captureChatgptWebInput(session);
        case "claude-web":
          return await captureClaudeWebInput(session);
        case "deepseek-web":
          return await captureDeepseekWebInput(session);
        case "doubao-web":
          return await captureDoubaoWebInput(session);
        case "qwen-cn-web":
          return await captureQwenCnWebInput(session);
        case "gemini-web":
        case "glm-web":
        case "glm-intl-web":
        case "grok-web":
        case "kimi-web":
        case "perplexity-web":
        case "qwen-web":
        case "xiaomimo-web":
          return await captureCookieProviderInput(params.providerId, session);
      }
    },
  );
}

async function withBrowserAuthSession<TResult>(
  params: {
    config: OpenClawConfig;
    loginUrl: string;
    openUrl: (url: string) => Promise<void>;
    progress: WizardProgress;
    providerId: BrowserBackedWebModelProviderId;
  },
  handler: (session: BrowserAuthSession) => Promise<TResult>,
): Promise<TResult> {
  const browserConfig = resolveBrowserWebAuthConfig(params.config.browser, params.config);
  const profile = resolveBrowserWebAuthProfile(browserConfig, browserConfig.defaultProfile);
  if (!profile) {
    throw new Error(`Could not resolve browser profile "${browserConfig.defaultProfile}".`);
  }

  let running: BrowserWebAuthChromeHandle | { cdpPort: number } | null = null;
  let didLaunch = false;
  let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | null = null;

  try {
    if (browserConfig.attachOnly) {
      params.progress.update("Connecting to existing Chrome...");
      const wsUrl = await getBrowserWebSocketUrl(profile.cdpUrl, 5_000);
      if (!wsUrl) {
        throw new Error(
          `Failed to connect to Chrome at ${profile.cdpUrl}. Start Chrome in debug mode or disable attach-only browser auth.`,
        );
      }
      running = { cdpPort: profile.cdpPort };
    } else {
      params.progress.update("Launching browser...");
      running = await launchBrowserWebAuthChrome(browserConfig, profile);
      didLaunch = true;
    }

    const cdpUrl = browserConfig.attachOnly
      ? profile.cdpUrl
      : `http://127.0.0.1:${running.cdpPort}`;
    let wsUrl: string | null = null;
    params.progress.update("Waiting for browser debugger...");
    for (let attempt = 0; attempt < 10; attempt += 1) {
      wsUrl = await getBrowserWebSocketUrl(cdpUrl, 2_000);
      if (wsUrl) {
        break;
      }
      await delay(500);
    }

    if (!wsUrl) {
      throw new Error(`Failed to resolve Chrome WebSocket URL from ${cdpUrl} after retries.`);
    }

    params.progress.update("Connecting to browser...");
    browser = await chromium.connectOverCDP(wsUrl, {
      headers: getBrowserWebAuthHeaders(wsUrl),
      timeout: 60_000,
    });
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page = findExistingPage(context, params.loginUrl) ?? (await context.newPage());

    params.progress.update(`Opening ${params.loginUrl}...`);
    await params.openUrl(params.loginUrl).catch(() => {});
    await page.goto(params.loginUrl, {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });

    const userAgent = await page.evaluate(() => navigator.userAgent);
    params.progress.update("Waiting for login...");

    return await handler({
      context,
      cookieUrls: COOKIE_URL_OVERRIDES[params.providerId] ?? [normalizeBaseUrl(params.loginUrl)],
      page,
      progress: params.progress,
      userAgent,
    });
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
    if (didLaunch && running && "proc" in running) {
      await stopBrowserWebAuthChrome(running).catch(() => {});
    }
  }
}

async function captureChatgptWebInput(
  session: BrowserAuthSession,
): Promise<WebModelManualAuthInput> {
  type State = { accessToken?: string };
  return await waitForCapture<State, WebModelManualAuthInput>({
    page: session.page,
    state: {},
    timeoutMessage: "ChatGPT login timed out after 5 minutes.",
    onRequest: (state, request) => {
      if (!request.url().includes("chatgpt.com") && !request.url().includes("openai.com")) {
        return;
      }
      const cookie = request.headers()["cookie"];
      const matched = cookie?.match(/__Secure-next-auth\.session-token=([^;]+)/);
      if (matched?.[1]) {
        state.accessToken = matched[1];
      }
    },
    tryCapture: async (state) => {
      const cookies = await session.context.cookies(session.cookieUrls);
      if (cookies.length === 0) {
        return null;
      }
      const direct = cookies.find((cookie) => cookie.name === "__Secure-next-auth.session-token");
      const split0 = cookies.find((cookie) => cookie.name === "__Secure-next-auth.session-token.0");
      const split1 = cookies.find((cookie) => cookie.name === "__Secure-next-auth.session-token.1");
      const accessToken =
        state.accessToken ?? direct?.value ?? joinDefined([split0?.value, split1?.value]);
      if (!accessToken) {
        return null;
      }
      session.progress.update("ChatGPT login detected. Capturing credentials...");
      return {
        accessToken,
        cookie: stringifyCookies(cookies),
        userAgent: session.userAgent,
      };
    },
  });
}

async function captureClaudeWebInput(
  session: BrowserAuthSession,
): Promise<WebModelManualAuthInput> {
  type State = { sessionKey?: string };
  return await waitForCapture<State, WebModelManualAuthInput>({
    page: session.page,
    state: {},
    timeoutMessage: "Claude login timed out after 5 minutes.",
    onRequest: (state, request) => {
      if (!request.url().includes("claude.ai")) {
        return;
      }
      const cookie = request.headers()["cookie"];
      const matched = cookie?.match(/sessionKey=([^;]+)/);
      if (matched?.[1]) {
        state.sessionKey = matched[1];
      }
    },
    tryCapture: async (state) => {
      const cookies = await session.context.cookies(session.cookieUrls);
      if (cookies.length === 0) {
        return null;
      }
      const sessionKeyCookie = cookies.find(
        (cookie) =>
          cookie.name === "sessionKey" ||
          cookie.value.startsWith("sk-ant-sid01-") ||
          cookie.value.startsWith("sk-ant-sid02-"),
      );
      const sessionKey = state.sessionKey ?? sessionKeyCookie?.value;
      if (!sessionKey) {
        return null;
      }
      session.progress.update("Claude login detected. Capturing credentials...");
      return {
        sessionKeyOrCookie: stringifyCookies(cookies),
        userAgent: session.userAgent,
      };
    },
  });
}

async function captureDeepseekWebInput(
  session: BrowserAuthSession,
): Promise<WebModelManualAuthInput> {
  type State = { bearer?: string };
  return await waitForCapture<State, WebModelManualAuthInput>({
    page: session.page,
    state: {},
    timeoutMessage: "DeepSeek login timed out after 5 minutes.",
    onRequest: (state, request) => {
      if (!request.url().includes("/api/v0/")) {
        return;
      }
      const auth = request.headers()["authorization"];
      if (auth?.toLowerCase().startsWith("bearer ")) {
        state.bearer = auth.slice(7).trim();
      }
    },
    onResponse: async (state, response) => {
      if (!response.url().includes("/api/v0/users/current") || !response.ok()) {
        return;
      }
      try {
        const body = (await response.json()) as Record<string, unknown>;
        const token = ((
          (body.data as Record<string, unknown> | undefined)?.biz_data as
            | Record<string, unknown>
            | undefined
        )?.token ?? "") as string;
        if (typeof token === "string" && token.length > 0) {
          state.bearer = token;
        }
      } catch {}
    },
    tryCapture: async (state) => {
      const cookies = await session.context.cookies(session.cookieUrls);
      if (cookies.length === 0) {
        return null;
      }
      const cookieString = stringifyCookies(cookies);
      const hasSession =
        cookieString.includes("d_id=") ||
        cookieString.includes("ds_session_id=") ||
        cookieString.includes("HWSID=") ||
        cookieString.includes("uuid=");
      if (!hasSession) {
        return null;
      }
      const bearer = state.bearer ?? (await captureDeepseekBearerFromPage(session.page));
      if (!bearer) {
        return null;
      }
      session.progress.update("DeepSeek login detected. Capturing credentials...");
      return {
        cookieOrHeaders: cookieString,
        bearer,
        userAgent: session.userAgent,
      };
    },
  });
}

async function captureDoubaoWebInput(
  session: BrowserAuthSession,
): Promise<WebModelManualAuthInput> {
  return await waitForCapture<Record<string, never>, WebModelManualAuthInput>({
    page: session.page,
    state: {},
    timeoutMessage: "Doubao login timed out after 5 minutes.",
    tryCapture: async () => {
      const cookies = await session.context.cookies(session.cookieUrls);
      if (cookies.length === 0) {
        return null;
      }
      const sessionId = cookies.find((cookie) => cookie.name === "sessionid")?.value;
      if (!sessionId) {
        return null;
      }
      session.progress.update("Doubao login detected. Capturing credentials...");
      return {
        sessionid: sessionId,
        ttwid: cookies.find((cookie) => cookie.name === "ttwid")?.value,
        cookie: stringifyCookies(cookies),
        userAgent: session.userAgent,
      };
    },
  });
}

async function captureQwenCnWebInput(
  session: BrowserAuthSession,
): Promise<WebModelManualAuthInput> {
  type State = { xsrfToken?: string };
  return await waitForCapture<State, WebModelManualAuthInput>({
    page: session.page,
    state: {},
    timeoutMessage: "Qwen CN login timed out after 5 minutes.",
    onRequest: (state, request) => {
      const token = request.headers()["x-xsrf-token"];
      if (token?.trim()) {
        state.xsrfToken = token.trim();
      }
    },
    tryCapture: async (state) => {
      const cookies = await session.context.cookies(session.cookieUrls);
      if (cookies.length === 0) {
        return null;
      }
      const sessionCookie = cookies.find(
        (cookie) => cookie.name === "tongyi_sso_ticket" || cookie.name === "login_aliyunid_ticket",
      );
      if (!sessionCookie) {
        return null;
      }
      const cookieString = stringifyCookies(cookies);
      const xsrfToken =
        state.xsrfToken ??
        (await readMetaContent(session.page, "x-xsrf-token")) ??
        cookies.find((cookie) => cookie.name === "XSRF-TOKEN")?.value;
      if (!xsrfToken) {
        return null;
      }
      session.progress.update("Qwen CN login detected. Capturing credentials...");
      return {
        cookieOrHeaders: cookieString,
        xsrfToken,
        userAgent: session.userAgent,
      };
    },
  });
}

async function captureCookieProviderInput(
  providerId: Exclude<
    BrowserBackedWebModelProviderId,
    "chatgpt-web" | "claude-web" | "deepseek-web" | "doubao-web" | "qwen-cn-web"
  >,
  session: BrowserAuthSession,
): Promise<WebModelManualAuthInput> {
  return await waitForCapture<Record<string, never>, WebModelManualAuthInput>({
    page: session.page,
    state: {},
    timeoutMessage: `${getWebModelProvider(providerId).label} login timed out after 5 minutes.`,
    tryCapture: async () => {
      const cookies = await session.context.cookies(session.cookieUrls);
      if (cookies.length === 0) {
        return null;
      }
      const cookieString = stringifyCookies(cookies);
      const localStorage = await readLocalStorage(session.page);
      const pageUrl = session.page.url();
      const isLoggedIn = await detectCookieProviderLogin({
        cookieNames: cookies.map((cookie) => cookie.name.toLowerCase()),
        cookieString,
        localStorage,
        page: session.page,
        pageUrl,
        providerId,
      });
      if (!isLoggedIn) {
        return null;
      }
      session.progress.update(
        `${getWebModelProvider(providerId).label} login detected. Capturing cookies...`,
      );
      return {
        cookie: cookieString,
        userAgent: session.userAgent,
      };
    },
  });
}

async function detectCookieProviderLogin(params: {
  cookieNames: string[];
  cookieString: string;
  localStorage: Record<string, string>;
  page: Page;
  pageUrl: string;
  providerId: Exclude<
    BrowserBackedWebModelProviderId,
    "chatgpt-web" | "claude-web" | "deepseek-web" | "doubao-web" | "qwen-cn-web"
  >;
}): Promise<boolean> {
  const names = params.cookieNames;
  switch (params.providerId) {
    case "gemini-web":
      return (
        names.some((name) => name.includes("__secure-1psid") || name.includes("sid")) &&
        !params.pageUrl.includes("ServiceLogin")
      );
    case "glm-web":
      return params.cookieString.includes("chatglm_refresh_token");
    case "glm-intl-web":
      return (
        /(?:refresh_token|auth_token|access_token|session|token)/i.test(params.cookieString) ||
        (await hasChatComposer(params.page))
      );
    case "grok-web":
      return params.cookieString.includes("sso") || params.cookieString.includes("_ga");
    case "kimi-web":
      return (
        params.cookieString.includes("access_token") ||
        params.cookieString.includes("kimi-auth") ||
        typeof params.localStorage.access_token === "string"
      );
    case "perplexity-web": {
      if (
        params.cookieString.includes("__Secure-next-auth.session-token") ||
        params.cookieString.includes("next-auth.session-token") ||
        params.cookieString.includes("intercom_session") ||
        params.cookieString.includes("perplexity_")
      ) {
        return true;
      }
      const loginButtonPresent = await params.page.evaluate(
        () => document.querySelector('button[data-testid="login-button"]') !== null,
      );
      const path = safePathname(params.pageUrl);
      return path === "/" && !loginButtonPresent;
    }
    case "qwen-web":
      return names.some(
        (name) => name.includes("session") || name.includes("token") || name.includes("auth"),
      );
    case "xiaomimo-web":
      return (
        names.some(
          (name) =>
            name.includes("token") ||
            name.includes("session") ||
            name.includes("auth") ||
            name.includes("user"),
        ) || Object.keys(params.localStorage).some((key) => /token|session|auth|user/i.test(key))
      );
  }
}

async function waitForCapture<TState, TResult>(
  params: WaitForCaptureParams<TState, TResult>,
): Promise<TResult> {
  return await new Promise<TResult>((resolve, reject) => {
    let finished = false;
    const complete = (value: TResult) => {
      if (finished) {
        return;
      }
      finished = true;
      cleanup();
      resolve(value);
    };
    const fail = (error: unknown) => {
      if (finished) {
        return;
      }
      finished = true;
      cleanup();
      reject(error);
    };
    const tryFinish = async () => {
      try {
        const result = await params.tryCapture(params.state);
        if (result) {
          complete(result);
        }
      } catch (error) {
        fail(error);
      }
    };
    const requestListener = async (request: Request) => {
      try {
        await params.onRequest?.(params.state, request);
        await tryFinish();
      } catch (error) {
        fail(error);
      }
    };
    const responseListener = async (response: Response) => {
      try {
        await params.onResponse?.(params.state, response);
        await tryFinish();
      } catch (error) {
        fail(error);
      }
    };
    const frameListener = async () => {
      try {
        await params.onFrameNavigated?.(params.state);
        await tryFinish();
      } catch (error) {
        fail(error);
      }
    };
    const closeListener = () => {
      fail(new Error("Browser window closed before login was captured."));
    };
    const interval = setInterval(() => {
      void tryFinish();
    }, 2_000);
    const timeout = setTimeout(() => {
      fail(new Error(params.timeoutMessage));
    }, FIVE_MINUTES_MS);
    const cleanup = () => {
      clearInterval(interval);
      clearTimeout(timeout);
      params.page.off("request", requestListener);
      params.page.off("response", responseListener);
      params.page.off("framenavigated", frameListener);
      params.page.off("close", closeListener);
    };

    params.page.on("request", requestListener);
    params.page.on("response", responseListener);
    params.page.on("framenavigated", frameListener);
    params.page.on("close", closeListener);
    void tryFinish();
  });
}

async function captureDeepseekBearerFromPage(page: Page): Promise<string | undefined> {
  try {
    const response = await page.request.get("https://chat.deepseek.com/api/v0/users/current");
    if (!response.ok()) {
      return undefined;
    }
    const data = (await response.json()) as Record<string, unknown>;
    const token = ((
      (data.data as Record<string, unknown> | undefined)?.biz_data as
        | Record<string, unknown>
        | undefined
    )?.token ?? "") as string;
    return typeof token === "string" && token.trim() ? token.trim() : undefined;
  } catch {
    return undefined;
  }
}

async function readMetaContent(page: Page, name: string): Promise<string | undefined> {
  try {
    const value = await page.evaluate((metaName) => {
      const meta = document.querySelector(`meta[name="${metaName}"]`);
      return meta?.getAttribute("content") ?? "";
    }, name);
    return value.trim() || undefined;
  } catch {
    return undefined;
  }
}

async function readLocalStorage(page: Page): Promise<Record<string, string>> {
  try {
    return await page.evaluate(() => {
      const values: Record<string, string> = {};
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (!key) {
          continue;
        }
        const value = localStorage.getItem(key);
        if (typeof value === "string") {
          values[key] = value;
        }
      }
      return values;
    });
  } catch {
    return {};
  }
}

async function hasChatComposer(page: Page): Promise<boolean> {
  try {
    return await page.evaluate(
      () =>
        document.querySelector(
          'textarea, [contenteditable="true"], .chat-input, .message-input',
        ) !== null,
    );
  } catch {
    return false;
  }
}

function findExistingPage(context: BrowserContext, loginUrl: string): Page | undefined {
  const host = new URL(loginUrl).hostname;
  return context.pages().find((page) => page.url().includes(host));
}

function normalizeBaseUrl(value: string): string {
  const url = new URL(value);
  return `${url.protocol}//${url.host}`;
}

function safePathname(value: string): string {
  try {
    return new URL(value).pathname;
  } catch {
    return "";
  }
}

function stringifyCookies(
  cookies: Array<{
    name: string;
    value: string;
  }>,
): string {
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

function joinDefined(values: Array<string | undefined>): string | undefined {
  const present = values.filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  return present.length > 0 ? present.join("") : undefined;
}

function delay(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}
