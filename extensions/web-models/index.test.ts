// Web-models auth tests cover provider-owned manual browser auth result wiring.
import { capturePluginRegistration } from "openclaw/plugin-sdk/plugin-test-runtime";
import { describe, expect, it, vi } from "vitest";
import {
  buildChatGPTWebCredentialValue,
  buildQwenCNWebCredentialValue,
  WEB_MODEL_SPECS,
} from "./api.js";

const captureWebModelBrowserAuthInput = vi.hoisted(() => vi.fn());
const createConfiguredWebModelStreamFn = vi.hoisted(() => vi.fn());

vi.mock("./browser-auth.js", () => ({
  captureWebModelBrowserAuthInput,
}));
vi.mock("openclaw/plugin-sdk/web-models", () => ({
  createConfiguredWebModelStreamFn,
}));

import plugin from "./index.js";

function registerProvider(providerId: string) {
  const captured = capturePluginRegistration(plugin);
  const provider = captured.providers.find((entry) => entry.id === providerId);
  expect(provider?.id).toBe(providerId);
  return provider!;
}

function getAuthMethod(providerId: string, methodId: string) {
  const provider = registerProvider(providerId);
  const auth = provider.auth.find((entry) => entry.id === methodId);
  expect(auth?.id).toBe(methodId);
  return auth!;
}

function createPrompter(responses: string[]) {
  const pending = [...responses];
  return {
    intro: vi.fn(),
    outro: vi.fn(),
    note: vi.fn(),
    plain: vi.fn(),
    select: vi.fn(),
    multiselect: vi.fn(),
    confirm: vi.fn(),
    text: vi.fn(async () => {
      const next = pending.shift();
      if (next === undefined) {
        throw new Error("Unexpected prompt");
      }
      return next;
    }),
    progress: vi.fn(() => ({
      update: vi.fn(),
      stop: vi.fn(),
    })),
  };
}

function createAuthContext(prompter: ReturnType<typeof createPrompter>) {
  return {
    config: {},
    prompter,
    runtime: {
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      exit: vi.fn(),
    },
    isRemote: false,
    openUrl: vi.fn(),
    oauth: {
      createVpsAwareHandlers: vi.fn(),
    },
    allowSecretRefPrompt: false,
  } as const;
}

describe("web-models plugin auth", () => {
  it("registers static text model catalogs for every provider", () => {
    const captured = capturePluginRegistration(plugin);
    expect(captured.modelCatalogProviders).toHaveLength(Object.keys(WEB_MODEL_SPECS).length);
    for (const entry of captured.modelCatalogProviders) {
      const entries = entry.staticCatalog?.({} as never) ?? [];
      expect(entry.kinds).toEqual(["text"]);
      expect(entries.length).toBeGreaterThan(0);
      expect(
        entries.every(
          (model) =>
            model.kind === "text" && model.provider === entry.provider && model.source === "static",
        ),
      ).toBe(true);
    }
  });

  it("registers provider-owned stream factories through the web-models SDK seam", () => {
    const provider = registerProvider("chatgpt-web");
    const streamFn = vi.fn();
    createConfiguredWebModelStreamFn.mockReturnValueOnce(streamFn);

    const resolved = provider.createStreamFn?.({
      model: {
        api: "chatgpt-web",
      },
    } as never);

    expect(createConfiguredWebModelStreamFn).toHaveBeenCalledWith("chatgpt-web");
    expect(resolved).toBe(streamFn);
  });

  it("captures browser auth automatically for ChatGPT Web", async () => {
    const auth = getAuthMethod("chatgpt-web", "web");
    const progress = { update: vi.fn(), stop: vi.fn() };
    const prompter = {
      ...createPrompter([]),
      progress: vi.fn(() => progress),
    };
    captureWebModelBrowserAuthInput.mockResolvedValueOnce({
      accessToken: "session-token",
      cookie: "__Secure-next-auth.session-token=session-token",
      userAgent: "test-agent",
    });

    const result = await auth?.run(createAuthContext(prompter) as never);

    expect(captureWebModelBrowserAuthInput).toHaveBeenCalledWith({
      config: {},
      openUrl: expect.any(Function),
      progress,
      prompter,
      providerId: "chatgpt-web",
    });
    expect(progress.stop).toHaveBeenCalledWith("Browser login captured");
    expect(result).toMatchObject({
      defaultModel: "chatgpt-web/gpt-4",
      profiles: [
        {
          profileId: "chatgpt-web:default",
          credential: {
            type: "api_key",
            provider: "chatgpt-web",
            key: buildChatGPTWebCredentialValue({
              accessToken: "session-token",
              cookie: "__Secure-next-auth.session-token=session-token",
              userAgent: "test-agent",
            }),
            metadata: { mode: "cookie" },
          },
        },
      ],
    });
  });

  it("keeps manual ChatGPT Web auth as an explicit fallback method", async () => {
    const auth = getAuthMethod("chatgpt-web", "manual-web");
    const prompter = createPrompter(["session-token"]);

    const result = await auth?.run(createAuthContext(prompter) as never);

    expect(prompter.note).toHaveBeenCalledWith(
      expect.stringContaining("ChatGPT Browser"),
      "ChatGPT Login",
    );
    expect(result).toMatchObject({
      defaultModel: "chatgpt-web/gpt-4",
      profiles: [
        {
          profileId: "chatgpt-web:default",
          credential: {
            type: "api_key",
            provider: "chatgpt-web",
            key: buildChatGPTWebCredentialValue({ accessToken: "session-token" }),
            metadata: { mode: "cookie" },
          },
        },
      ],
    });
    expect(result?.configPatch?.models?.providers?.["chatgpt-web"]).toMatchObject({
      api: "chatgpt-web",
      baseUrl: "https://chatgpt.com",
    });
    expect(result?.configPatch?.models?.providers?.["chatgpt-web"]).not.toHaveProperty("apiKey");
  });

  it("parses Qwen CN header blocks and derives the stored ut field", async () => {
    const auth = getAuthMethod("qwen-cn-web", "manual-web");
    const prompter = createPrompter([
      "cookie: tongyi_sso_ticket=abc; b-user-id=user-42\nx-xsrf-token: token-123",
      "",
      "",
    ]);

    const result = await auth?.run(createAuthContext(prompter) as never);

    expect(result?.profiles).toStrictEqual([
      {
        profileId: "qwen-cn-web:default",
        credential: {
          type: "api_key",
          provider: "qwen-cn-web",
          key: buildQwenCNWebCredentialValue({
            cookie: "tongyi_sso_ticket=abc; b-user-id=user-42",
            xsrfToken: "token-123",
            ut: "user-42",
          }),
          metadata: { mode: "cookie" },
        },
      },
    ]);
    expect(result?.defaultModel).toBe("qwen-cn-web/qwen-turbo");
  });

  it("keeps plain browser-cookie providers as raw cookie strings when no user agent is provided", async () => {
    const auth = getAuthMethod("grok-web", "manual-web");
    const prompter = createPrompter(["session=abc; foo=bar", ""]);

    const result = await auth?.run(createAuthContext(prompter) as never);

    expect(result?.profiles).toStrictEqual([
      {
        profileId: "grok-web:default",
        credential: {
          type: "api_key",
          provider: "grok-web",
          key: "session=abc; foo=bar",
          metadata: { mode: "cookie" },
        },
      },
    ]);
    expect(result?.defaultModel).toBe("grok-web/grok-2");
  });

  it("keeps Manus API on the legacy auth path for now", async () => {
    const auth = getAuthMethod("manus-api", "web");

    const result = await auth?.run(createAuthContext(createPrompter([])) as never);

    expect(result).toStrictEqual({
      profiles: [],
      notes: [
        "This provider still uses the legacy onboarding/auth-choice path.",
        "Use `openclaw onboard` or the existing Manus API key flow for now.",
      ],
    });
  });
});
