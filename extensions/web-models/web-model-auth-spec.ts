// Web model manual auth specs, credential builders, and auth result wiring.
// Extracted from api.ts to keep each file under the oxlint max-lines limit.
import {
  buildApiKeyCredential,
  type ProviderAuthResult,
  type SecretInputMode,
} from "openclaw/plugin-sdk/provider-auth";
import type { OpenClawConfig } from "openclaw/plugin-sdk/provider-onboard";
import {
  applyWebModelProviderConfig,
  getWebModelDefaultModelRef,
  type BrowserBackedWebModelProviderId,
} from "./web-model-specs.js";

export type WebModelManualAuthFieldId =
  | "accessToken"
  | "bearer"
  | "cookie"
  | "cookieOrHeaders"
  | "organizationId"
  | "sessionid"
  | "sessionKeyOrCookie"
  | "ttwid"
  | "userAgent"
  | "xsrfToken";

export type WebModelManualAuthField = {
  id: WebModelManualAuthFieldId;
  message: string;
  hint?: string;
  placeholder?: string;
  optional?: boolean;
};

export type WebModelManualAuthSpec = {
  title: string;
  lines: string[];
  fields: readonly WebModelManualAuthField[];
};

export type WebModelManualAuthInput = Partial<Record<WebModelManualAuthFieldId, string>>;

export function buildBrowserCookieCredentialValue(params: {
  cookie: string;
  userAgent?: string;
}): string {
  return JSON.stringify({
    cookie: params.cookie,
    ...(params.userAgent ? { userAgent: params.userAgent } : {}),
  });
}

export function buildChatGPTWebCredentialValue(params: {
  accessToken: string;
  cookie?: string;
  userAgent?: string;
}): string {
  return JSON.stringify({
    accessToken: params.accessToken,
    cookie: params.cookie ?? `__Secure-next-auth.session-token=${params.accessToken}`,
    userAgent:
      params.userAgent ??
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
}

export function buildClaudeWebCredentialValue(params: {
  sessionKey: string;
  cookie?: string;
  userAgent?: string;
  organizationId?: string;
}): string {
  return JSON.stringify({
    sessionKey: params.sessionKey,
    cookie: params.cookie ?? `sessionKey=${params.sessionKey}`,
    ...(params.userAgent ? { userAgent: params.userAgent } : {}),
    ...(params.organizationId ? { organizationId: params.organizationId } : {}),
  });
}

export function buildDeepseekWebCredentialValue(params: {
  cookie: string;
  bearer?: string;
  userAgent?: string;
}): string {
  return JSON.stringify({
    cookie: params.cookie,
    ...(params.bearer ? { bearer: params.bearer } : {}),
    ...(params.userAgent ? { userAgent: params.userAgent } : {}),
  });
}

export function buildDoubaoWebCredentialValue(params: {
  sessionid: string;
  ttwid?: string;
  cookie?: string;
  userAgent?: string;
}): string {
  return JSON.stringify({
    sessionid: params.sessionid,
    ...(params.ttwid ? { ttwid: params.ttwid } : {}),
    ...(params.userAgent ? { userAgent: params.userAgent } : {}),
    ...(params.cookie
      ? { cookie: params.cookie }
      : {
          cookie: params.ttwid
            ? `sessionid=${params.sessionid}; ttwid=${params.ttwid}`
            : `sessionid=${params.sessionid}`,
        }),
  });
}

export function buildQwenCNWebCredentialValue(params: {
  cookie: string;
  xsrfToken: string;
  userAgent?: string;
  ut?: string;
}): string {
  return JSON.stringify({
    cookie: params.cookie,
    xsrfToken: params.xsrfToken,
    ...(params.userAgent ? { userAgent: params.userAgent } : {}),
    ...(params.ut ? { ut: params.ut } : {}),
  });
}

const DEFAULT_BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function buildCookieFields(params?: {
  message?: string;
  hint?: string;
}): readonly WebModelManualAuthField[] {
  return [
    {
      id: "cookie",
      message: params?.message ?? "Paste cookies",
      ...(params?.hint ? { hint: params.hint } : { hint: "All cookies from the browser session" }),
      placeholder: "...",
    },
    {
      id: "userAgent",
      message: "User agent (Optional)",
      hint: "Leave blank to reuse the default browser user agent",
      placeholder: "Optional",
      optional: true,
    },
  ];
}

function buildCookieManualAuthSpec(params: {
  title: string;
  description: string;
  url: string;
}): WebModelManualAuthSpec {
  return {
    title: params.title,
    lines: [
      params.description,
      `1. Login to ${params.url} in your browser`,
      "2. Open DevTools (F12) -> Application -> Cookies",
      "3. Copy all cookies",
    ],
    fields: buildCookieFields(),
  };
}

export function getWebModelManualAuthSpec(
  providerId: BrowserBackedWebModelProviderId,
): WebModelManualAuthSpec {
  switch (providerId) {
    case "chatgpt-web":
      return {
        title: "ChatGPT Login",
        lines: [
          "To use ChatGPT Browser, you need the session token from chatgpt.com.",
          "1. Login to https://chatgpt.com/ in your browser",
          "2. Open DevTools (F12) -> Application -> Cookies",
          "3. Find and copy the '__Secure-next-auth.session-token' cookie value",
        ],
        fields: [
          {
            id: "accessToken",
            message: "Paste session token",
            hint: "The __Secure-next-auth.session-token value from cookies",
            placeholder: "...",
          },
        ],
      };
    case "claude-web":
      return {
        title: "Claude Login",
        lines: [
          "To use Claude Web manually, you need cookies from claude.ai.",
          "1. Login to https://claude.ai in your browser",
          "2. Open DevTools (F12) -> Network tab",
          "3. Refresh the page and click any request to claude.ai",
          "4. In Request Headers, find 'cookie:' and copy the ENTIRE cookie string",
          "   (It should contain sessionKey and other cookies)",
          "",
          "Alternative: Just copy the sessionKey value from Application -> Cookies",
        ],
        fields: [
          {
            id: "sessionKeyOrCookie",
            message: "Paste cookie string or sessionKey",
            hint: "Full cookie string or just sessionKey value",
            placeholder: "sessionKey=sk-ant-sid02-...; other_cookie=...",
          },
          {
            id: "organizationId",
            message: "Organization ID (Optional)",
            hint: "Only needed if your Claude account requires it",
            placeholder: "Optional",
            optional: true,
          },
          {
            id: "userAgent",
            message: "User agent (Optional)",
            hint: "Leave blank to use the standard browser user agent",
            placeholder: "Optional",
            optional: true,
          },
        ],
      };
    case "deepseek-web":
      return {
        title: "DeepSeek Login",
        lines: [
          "To use DeepSeek Browser manually, you need a session cookie from chat.deepseek.com.",
          "1. Login to https://chat.deepseek.com",
          "2. Open DevTools (F12) -> Network tab",
          "3. Look for a request to '/api/v0/chat/completion'",
          "4. Copy the whole 'Cookie' and 'Authorization' headers.",
        ],
        fields: [
          {
            id: "cookieOrHeaders",
            message: "Paste Cookie / Headers",
            hint: "Paste the 'Cookie:' value or multiple headers. I'll try to parse them.",
            placeholder: "lpk3-app-session-id=...; ds_session_id=...",
          },
          {
            id: "bearer",
            message: "Authorization Bearer (Optional)",
            hint: "If you have a 'Bearer ...' token from the headers, paste it here.",
            placeholder: "Optional",
            optional: true,
          },
          {
            id: "userAgent",
            message: "User agent (Optional)",
            placeholder: "Optional",
            optional: true,
          },
        ],
      };
    case "doubao-web":
      return {
        title: "Doubao Login",
        lines: [
          "To use Doubao Browser, you need the sessionid cookie from www.doubao.com.",
          "1. Login to https://www.doubao.com/chat/",
          "2. Open DevTools (F12) -> Application -> Cookies",
          "3. Find and copy the 'sessionid' cookie value",
          "4. Optionally also copy 'ttwid' cookie",
        ],
        fields: [
          {
            id: "sessionid",
            message: "Paste sessionid cookie",
            hint: "The sessionid value from cookies",
            placeholder: "...",
          },
          {
            id: "ttwid",
            message: "Paste ttwid cookie (Optional)",
            hint: "The ttwid value from cookies - optional but recommended",
            placeholder: "Optional",
            optional: true,
          },
          {
            id: "userAgent",
            message: "User agent (Optional)",
            hint: "Leave blank to use the standard browser user agent",
            placeholder: "Optional",
            optional: true,
          },
        ],
      };
    case "qwen-cn-web":
      return {
        title: "Qwen CN Login",
        lines: [
          "To use Qwen CN Browser manually, you need a session cookie from qianwen.com.",
          "1. Login to https://www.qianwen.com",
          "2. Open DevTools (F12) -> Network tab",
          "3. Look for a request to '/api/v2/chat'",
          "4. Copy the 'Cookie' and 'x-xsrf-token' headers.",
        ],
        fields: [
          {
            id: "cookieOrHeaders",
            message: "Paste Cookie / Headers",
            placeholder: "tongyi_sso_ticket=...; x-xsrf-token=...",
          },
          {
            id: "xsrfToken",
            message: "XSRF Token (Optional if pasted above)",
            placeholder: "tokenValue",
            optional: true,
          },
          {
            id: "userAgent",
            message: "User agent (Optional)",
            placeholder: "Optional",
            optional: true,
          },
        ],
      };
    case "gemini-web":
      return buildCookieManualAuthSpec({
        title: "Gemini Login",
        description: "To use Gemini Browser, you need cookies from gemini.google.com.",
        url: "https://gemini.google.com/app",
      });
    case "glm-intl-web":
      return {
        title: "GLM International Login",
        lines: [
          "To use GLM International (chat.z.ai), you need authentication cookies.",
          "1. Login to https://chat.z.ai in your browser",
          "2. Open DevTools (F12) -> Application -> Cookies",
          "3. Look for authentication cookies (e.g., chatglm_refresh_token, refresh_token, auth_token, access_token)",
          "4. Copy the cookie value that looks like a token (long random string)",
        ],
        fields: buildCookieFields({
          message: "Paste authentication cookie value",
          hint: "Look for chatglm_refresh_token, refresh_token, auth_token, etc.",
        }),
      };
    case "glm-web":
      return {
        title: "ChatGLM Login",
        lines: [
          "To use ChatGLM (智谱清言), you need the chatglm_refresh_token cookie.",
          "1. Login to https://chatglm.cn in your browser",
          "2. Open DevTools (F12) -> Application -> Cookies",
          "3. Find and copy the chatglm_refresh_token value",
        ],
        fields: buildCookieFields({
          message: "Paste chatglm_refresh_token",
          hint: "chatglm_refresh_token from chatglm.cn",
        }),
      };
    case "grok-web":
      return buildCookieManualAuthSpec({
        title: "Grok Login",
        description: "To use Grok Browser, you need cookies from grok.com.",
        url: "https://grok.com",
      });
    case "kimi-web":
      return buildCookieManualAuthSpec({
        title: "Kimi Login",
        description: "To use Kimi Browser, you need cookies from www.kimi.com.",
        url: "https://www.kimi.com",
      });
    case "perplexity-web":
      return buildCookieManualAuthSpec({
        title: "Perplexity Login",
        description: "To use Perplexity Browser, you need cookies from perplexity.ai.",
        url: "https://www.perplexity.ai",
      });
    case "qwen-web":
      return buildCookieManualAuthSpec({
        title: "Qwen Login",
        description: "To use Qwen Browser, you need cookies from chat.qwen.ai.",
        url: "https://chat.qwen.ai",
      });
    case "xiaomimo-web":
      return buildCookieManualAuthSpec({
        title: "Xiaomi Mimo Login",
        description: "To use Xiaomi Mimo Browser, you need cookies from aistudio.xiaomimimo.com.",
        url: "https://aistudio.xiaomimimo.com",
      });
  }
}

function parseClaudeSessionInput(raw: string): {
  cookie: string;
  sessionKey: string;
} {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Claude login requires a sessionKey or cookie string.");
  }
  if (trimmed.startsWith("sk-ant-sid")) {
    return {
      sessionKey: trimmed,
      cookie: `sessionKey=${trimmed}`,
    };
  }
  const sessionKey = extractCookieValue(trimmed, "sessionKey");
  if (!sessionKey) {
    throw new Error("Could not find sessionKey in the provided Claude cookie string.");
  }
  return {
    cookie: trimmed,
    sessionKey,
  };
}

function parseCookieAndHeaderBlock(raw: string): {
  bearer?: string;
  cookie: string;
  xsrfToken?: string;
} {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("A cookie or header block is required.");
  }

  let cookie: string | undefined;
  let bearer: string | undefined;
  let xsrfToken: string | undefined;
  for (const line of trimmed.split(/\r?\n/)) {
    const value = line.trim();
    const lower = value.toLowerCase();
    if (lower.startsWith("cookie:")) {
      cookie = value.slice(7).trim();
      continue;
    }
    if (lower.startsWith("authorization:")) {
      const authValue = value.slice(14).trim();
      if (authValue.toLowerCase().startsWith("bearer ")) {
        bearer = authValue.slice(7).trim();
      }
      continue;
    }
    if (lower.startsWith("x-xsrf-token:")) {
      xsrfToken = value.slice(13).trim();
      continue;
    }
    if (!cookie && value.includes("=") && value.includes(";")) {
      cookie = value;
    }
  }

  const fallbackCookie = cookie ?? trimmed;
  const fallbackBearer = bearer ?? extractBearerToken(trimmed);
  return {
    cookie: fallbackCookie,
    ...(fallbackBearer ? { bearer: fallbackBearer } : {}),
    ...(xsrfToken ? { xsrfToken } : {}),
  };
}

function extractBearerToken(raw: string): string | undefined {
  const match = raw.match(/bearer\s+([a-zA-Z0-9.\-_/]+)/i);
  return match?.[1]?.trim() || undefined;
}

function extractCookieValue(cookie: string, key: string): string | undefined {
  const escaped = key.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]+)`, "i"));
  return match?.[1]?.trim() || undefined;
}

function requireField(value: string | undefined, field: WebModelManualAuthFieldId): string {
  const normalized = normalizeOptionalField(value);
  if (!normalized) {
    throw new Error(`Missing required web auth field: ${field}`);
  }
  return normalized;
}

function normalizeOptionalField(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function buildWebModelCredentialValue(
  providerId: BrowserBackedWebModelProviderId,
  input: WebModelManualAuthInput,
): string {
  switch (providerId) {
    case "chatgpt-web":
      return buildChatGPTWebCredentialValue({
        accessToken: requireField(input.accessToken, "accessToken"),
        cookie: normalizeOptionalField(input.cookie),
        userAgent: normalizeOptionalField(input.userAgent),
      });
    case "claude-web": {
      const parsed = parseClaudeSessionInput(
        requireField(input.sessionKeyOrCookie, "sessionKeyOrCookie"),
      );
      return buildClaudeWebCredentialValue({
        sessionKey: parsed.sessionKey,
        cookie: parsed.cookie,
        userAgent: normalizeOptionalField(input.userAgent) ?? DEFAULT_BROWSER_USER_AGENT,
        organizationId: normalizeOptionalField(input.organizationId),
      });
    }
    case "deepseek-web": {
      const parsed = parseCookieAndHeaderBlock(
        requireField(input.cookieOrHeaders, "cookieOrHeaders"),
      );
      return buildDeepseekWebCredentialValue({
        cookie: parsed.cookie,
        bearer: normalizeOptionalField(input.bearer) ?? parsed.bearer,
        userAgent: normalizeOptionalField(input.userAgent),
      });
    }
    case "doubao-web":
      return buildDoubaoWebCredentialValue({
        sessionid: requireField(input.sessionid, "sessionid"),
        ttwid: normalizeOptionalField(input.ttwid),
        userAgent: normalizeOptionalField(input.userAgent) ?? DEFAULT_BROWSER_USER_AGENT,
      });
    case "qwen-cn-web": {
      const parsed = parseCookieAndHeaderBlock(
        requireField(input.cookieOrHeaders, "cookieOrHeaders"),
      );
      const cookie = parsed.cookie;
      const xsrfToken = normalizeOptionalField(input.xsrfToken) ?? parsed.xsrfToken;
      if (!xsrfToken) {
        throw new Error("Qwen CN login requires an x-xsrf-token value.");
      }
      return buildQwenCNWebCredentialValue({
        cookie,
        xsrfToken,
        userAgent: normalizeOptionalField(input.userAgent),
        ut: extractCookieValue(cookie, "b-user-id"),
      });
    }
    case "gemini-web":
    case "glm-intl-web":
    case "glm-web":
    case "grok-web":
    case "kimi-web":
    case "perplexity-web":
    case "qwen-web":
    case "xiaomimo-web": {
      const cookie = requireField(input.cookie, "cookie");
      const userAgent = normalizeOptionalField(input.userAgent);
      return userAgent ? buildBrowserCookieCredentialValue({ cookie, userAgent }) : cookie;
    }
  }
}

export function buildWebModelProviderAuthResult(params: {
  config: OpenClawConfig;
  providerId: BrowserBackedWebModelProviderId;
  input: WebModelManualAuthInput;
  secretInputMode?: SecretInputMode;
}): ProviderAuthResult {
  const credentialValue = buildWebModelCredentialValue(params.providerId, params.input);
  return {
    profiles: [
      {
        profileId: `${params.providerId}:default`,
        credential: buildApiKeyCredential(
          params.providerId,
          credentialValue,
          { mode: "cookie" },
          params.secretInputMode
            ? {
                config: params.config,
                secretInputMode: params.secretInputMode,
              }
            : undefined,
        ),
      },
    ],
    configPatch: applyWebModelProviderConfig(params.config, params.providerId),
    defaultModel: getWebModelDefaultModelRef(params.providerId),
  };
}
