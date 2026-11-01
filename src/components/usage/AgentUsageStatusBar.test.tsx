// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import zh from "../../i18n/zh.json";
import { consumeCodexResetCredit, getAgentUsage } from "../../lib/tauri";
import type { ProviderUsage } from "../../lib/agentUsage";
import { AgentUsageStatusBar } from "./AgentUsageStatusBar";

vi.mock("../../lib/tauri", () => ({
  getAgentUsage: vi.fn(),
  consumeCodexResetCredit: vi.fn(),
}));
const i18n = createInstance();
await i18n.init({ lng: "zh", resources: { zh: { translation: zh } } });
let container: HTMLDivElement;
let root: Root;
let focused = true;
let visible = true;

function fixture(percent = 85): ProviderUsage[] {
  const updated_at = Math.floor(Date.now() / 1000);
  return [
    {
      provider: "claude",
      status: "ready",
      windows: [
        {
          key: "five_hour",
          used_percent: 23,
          resets_at: updated_at + 7200,
          window_minutes: 300,
        },
        {
          key: "seven_day",
          used_percent: percent,
          resets_at: updated_at + 172800,
          window_minutes: 10080,
        },
      ],
      updated_at,
      retry_after_seconds: null,
    },
    {
      provider: "codex",
      status: "ready",
      windows: [
        {
          key: "five_hour",
          used_percent: 0,
          resets_at: updated_at + 3600,
          window_minutes: 300,
        },
      ],
      updated_at,
      retry_after_seconds: null,
    },
  ];
}

function button(label: string): HTMLButtonElement {
  const node = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (item) => item.getAttribute("aria-label") === label,
  );
  if (!node) throw new Error(`Missing button ${label}`);
  return node;
}
async function render(strict = false) {
  const content = (
    <I18nextProvider i18n={i18n}>
      <AgentUsageStatusBar />
    </I18nextProvider>
  );
  await act(async () =>
    root.render(strict ? <StrictMode>{content}</StrictMode> : content),
  );
}
async function click(label: string) {
  await act(async () => button(label).click());
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  focused = true;
  visible = true;
  vi.spyOn(document, "hasFocus").mockImplementation(() => focused);
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() =>
    visible ? "visible" : "hidden",
  );
  vi.mocked(getAgentUsage).mockReset().mockResolvedValue(fixture());
  vi.mocked(consumeCodexResetCredit).mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("shows the tightest quota and zero, opens details and restores focus with Escape", async () => {
  await render();
  expect(button("Agent 用量").textContent).toBe("0%85%");
  await click("Agent 用量");
  const panel = document.querySelector<HTMLElement>('[role="dialog"]')!;
  expect(panel).not.toBeNull();
  expect(document.activeElement).toBe(panel);
  expect(panel.textContent).toContain("5 小时");
  expect(panel.textContent).toContain("重置：");
  expect(panel.querySelectorAll('[role="progressbar"]')).toHaveLength(3);
  await act(async () =>
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    ),
  );
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(button("Agent 用量"));
  expect(button("Agent 用量").getAttribute("aria-expanded")).toBe("false");
});

it("prevents duplicate manual queries, retains displayed data during refresh and replaces failure with status", async () => {
  await render();
  await click("Agent 用量");
  let finish: (snapshot: ProviderUsage[]) => void = () => {};
  vi.mocked(getAgentUsage).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await click("刷新用量");
  const calls = vi.mocked(getAgentUsage).mock.calls.length;
  expect(button("刷新用量").disabled).toBe(true);
  expect(button("Agent 用量").textContent).toContain("85%");
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(getAgentUsage).toHaveBeenCalledTimes(calls);
  await act(async () => finish(fixture(91)));
  expect(button("Agent 用量").textContent).toContain("91%");
  expect(getAgentUsage).toHaveBeenLastCalledWith(true);
  vi.mocked(getAgentUsage).mockResolvedValueOnce(
    fixture().map((snapshot) => ({
      ...snapshot,
      status: "auth_expired",
      windows: [],
    })),
  );
  await click("刷新用量");
  expect(document.querySelectorAll('[role="progressbar"]')).toHaveLength(0);
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    "登录已失效",
  );
  expect(button("Agent 用量").textContent).toBe("Agent 用量");
});

it("pauses automatic queries when hidden or unfocused and resumes on activation", async () => {
  vi.useFakeTimers();
  focused = false;
  await render();
  expect(getAgentUsage).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTime(300000));
  expect(getAgentUsage).not.toHaveBeenCalled();
  focused = true;
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(getAgentUsage).toHaveBeenCalledTimes(1);
  visible = false;
  await act(async () => vi.advanceTimersByTime(300000));
  expect(getAgentUsage).toHaveBeenCalledTimes(1);
  visible = true;
  await act(async () => document.dispatchEvent(new Event("visibilitychange")));
  expect(getAgentUsage).toHaveBeenCalledTimes(2);
});

it("closes on outside focus and displays an IPC failure without stale percentages", async () => {
  await render();
  await click("Agent 用量");
  vi.mocked(getAgentUsage).mockRejectedValueOnce(new Error("fixture failure"));
  await click("刷新用量");
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    "查询失败",
  );
  expect(button("Agent 用量").textContent).toBe("Agent 用量");
  const outside = document.createElement("button");
  document.body.append(outside);
  await act(async () => outside.focus());
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  outside.remove();
});

it("ignores an older result after StrictMode effect cleanup", async () => {
  let finish: (snapshot: ProviderUsage[]) => void = () => {};
  vi.mocked(getAgentUsage).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await render(true);
  expect(button("Agent 用量").textContent).toContain("85%");
  await act(async () => finish(fixture(99)));
  expect(button("Agent 用量").textContent).toContain("85%");
  expect(button("Agent 用量").textContent).not.toContain("99%");
});

it("hides unavailable providers while keeping a valid zero usage visible", async () => {
  vi.mocked(getAgentUsage).mockResolvedValue(
    fixture().map((snapshot) =>
      snapshot.provider === "claude"
        ? { ...snapshot, status: "network_error", windows: [] }
        : snapshot,
    ),
  );
  await render();
  expect(button("Agent 用量").textContent).toBe("0%");
  expect(button("Agent 用量").querySelector('[title^="Claude"]')).toBeNull();
  expect(button("Agent 用量").querySelector('[title^="Codex"]')).not.toBeNull();
});

it("keeps the usage entry available without quota and shows percentages after recovery", async () => {
  vi.useFakeTimers();
  vi.mocked(getAgentUsage).mockResolvedValueOnce([]);
  await render();
  expect(button("Agent 用量").textContent).toBe("Agent 用量");
  await act(async () => vi.advanceTimersByTime(300000));
  expect(button("Agent 用量").textContent).toBe("0%85%");
});

it("recovers a hidden Codex quota promptly after a transient query failure", async () => {
  vi.useFakeTimers();
  vi.mocked(getAgentUsage).mockResolvedValueOnce(
    fixture().map((snapshot) =>
      snapshot.provider === "codex"
        ? { ...snapshot, status: "query_failed", windows: [] }
        : snapshot,
    ),
  );
  await render();
  expect(button("Agent 用量").querySelector('[title^="Codex"]')).toBeNull();
  await act(async () => vi.advanceTimersByTime(30000));
  expect(button("Agent 用量").querySelector('[title^="Codex"]')).not.toBeNull();
  expect(getAgentUsage).toHaveBeenCalledTimes(2);
  await act(async () => vi.advanceTimersByTime(30000));
  expect(getAgentUsage).toHaveBeenCalledTimes(2);
});

it("opens failure details and manually recovers through the persistent usage entry", async () => {
  vi.mocked(getAgentUsage)
    .mockResolvedValueOnce(
      fixture().map((snapshot) => ({
        ...snapshot,
        status: "query_failed",
        windows: [],
      })),
    )
    .mockResolvedValueOnce(
      fixture().map((snapshot) => ({
        ...snapshot,
        status: "query_failed",
        windows: [],
      })),
    );
  await render();
  expect(button("Agent 用量").textContent).toBe("Agent 用量");
  await click("Agent 用量");
  const panel = document.querySelector('[role="dialog"]')!;
  expect(panel.textContent).toContain("Codex");
  expect(panel.textContent).toContain("查询失败");
  expect(panel.querySelector('[role="progressbar"]')).toBeNull();
  await click("刷新用量");
  expect(button("Agent 用量").textContent).toBe("0%85%");
  expect(panel.querySelectorAll('[role="progressbar"]')).toHaveLength(3);
});

it("prioritizes Codex and warns in the status bar and reset details before expiry", async () => {
  const snapshots = fixture();
  const codex = snapshots.find((item) => item.provider === "codex")!;
  codex.reset_credits = {
    available_count: 4,
    credits: [
      {
        reset_type: "codexRateLimits",
        title: "Full reset",
        expires_at: codex.updated_at + 86400,
      },
      {
        reset_type: "codexRateLimits",
        title: null,
        expires_at: codex.updated_at + 10 * 86400,
      },
      {
        reset_type: "codexRateLimits",
        title: null,
        expires_at: codex.updated_at - 1,
      },
      { reset_type: "futureType", title: "Example reset", expires_at: null },
    ],
  };
  vi.mocked(getAgentUsage).mockResolvedValue(snapshots);
  await render();
  expect(button("Agent 用量").textContent).toContain("重置额度即将到期");
  expect(button("Agent 用量").textContent).toContain("0%85%");
  await click("Agent 用量");
  const panel = document.querySelector('[role="dialog"]')!;
  const providers = panel.querySelectorAll(
    'section[aria-label="Codex"], section[aria-label="Claude"]',
  );
  expect(providers[0].getAttribute("aria-label")).toBe("Codex");
  const resets = panel.querySelector('section[aria-label="使用限额重置"]')!;
  expect(resets.textContent).toContain("可用 4 次");
  expect(resets.querySelectorAll("li")).toHaveLength(4);
  expect(resets.querySelector("li span[title]")?.textContent).toBe(
    "Full reset",
  );
  expect(resets.textContent).toContain("完全重置");
  expect(resets.textContent).toContain("Example reset");
  expect(resets.textContent).toContain("未提供到期时间");
  expect(resets.textContent).toContain("已到期");
  expect(resets.querySelectorAll("li.text-danger")).toHaveLength(1);
  expect(resets.querySelector("li.text-danger")?.textContent).toContain(
    "即将到期，请尽快使用",
  );
});

it("distinguishes absent reset data, a known zero, and count-only results", async () => {
  for (const reset_credits of [
    undefined,
    { available_count: 0, credits: [] },
    { available_count: 2, credits: null },
  ]) {
    const snapshots = fixture();
    snapshots[1].reset_credits = reset_credits;
    vi.mocked(getAgentUsage).mockResolvedValue(snapshots);
    await render();
    await click("Agent 用量");
    await click("刷新用量");
    const resets = document.querySelector('section[aria-label="使用限额重置"]');
    if (!reset_credits) expect(resets).toBeNull();
    else {
      expect(resets?.textContent).toContain(
        `可用 ${reset_credits.available_count} 次`,
      );
      if (reset_credits.credits === null)
        expect(resets?.textContent).toContain("暂未提供额度明细");
    }
    await click("关闭");
  }
});

it("starts the expiry reminder as the clock enters the three-day window without another query", async () => {
  vi.useFakeTimers();
  const snapshots = fixture();
  const codex = snapshots.find((item) => item.provider === "codex")!;
  codex.reset_credits = {
    available_count: 1,
    credits: [
      {
        reset_type: "codexRateLimits",
        title: null,
        expires_at: codex.updated_at + 3 * 86400 + 60,
      },
    ],
  };
  vi.mocked(getAgentUsage).mockResolvedValue(snapshots);
  await render();
  expect(button("Agent 用量").textContent).not.toContain("重置额度即将到期");
  const queries = vi.mocked(getAgentUsage).mock.calls.length;
  await act(async () => vi.advanceTimersByTime(60_000));
  expect(button("Agent 用量").textContent).toContain("重置额度即将到期");
  expect(getAgentUsage).toHaveBeenCalledTimes(queries);
});

function resetFixture() {
  const snapshots = fixture();
  const codex = snapshots.find((item) => item.provider === "codex")!;
  codex.reset_credits = {
    available_count: 2,
    credits: [
      {
        id: "reset-one",
        reset_type: "codexRateLimits",
        title: null,
        expires_at: codex.updated_at + 86400,
      },
      {
        id: "reset-two",
        reset_type: "codexRateLimits",
        title: null,
        expires_at: codex.updated_at + 10 * 86400,
      },
    ],
  };
  return snapshots;
}
const useButtons = () => [
  ...document.querySelectorAll<HTMLButtonElement>(
    'section[aria-label="使用限额重置"] button',
  ),
];
const confirmUse = () =>
  [
    ...document.querySelectorAll<HTMLButtonElement>(
      '[role="alertdialog"] button',
    ),
  ].find((button) => button.textContent === "使用重置额度")!;

it("requires confirmation for the selected reset, cancels safely, and replaces quota with the server result", async () => {
  const snapshots = resetFixture();
  vi.mocked(getAgentUsage).mockResolvedValue(snapshots);
  const after = {
    ...snapshots[1],
    reset_credits: {
      available_count: 1,
      credits: [snapshots[1].reset_credits!.credits![1]],
    },
  };
  vi.mocked(consumeCodexResetCredit).mockResolvedValue({
    outcome: "reset",
    snapshot: after,
    refresh_error: null,
  });
  await render();
  await click("Agent 用量");
  expect(useButtons()).toHaveLength(2);
  await act(async () => useButtons()[0].click());
  expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
  expect(consumeCodexResetCredit).not.toHaveBeenCalled();
  await act(async () =>
    [
      ...document.querySelectorAll<HTMLButtonElement>(
        '[role="alertdialog"] button',
      ),
    ]
      .find((button) => button.textContent === "取消")!
      .click(),
  );
  expect(consumeCodexResetCredit).not.toHaveBeenCalled();
  await act(async () => useButtons()[0].click());
  await act(async () => confirmUse().click());
  expect(consumeCodexResetCredit).toHaveBeenCalledWith(
    expect.any(String),
    "reset-one",
  );
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    "可用 1 次",
  );
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    "重置已成功，用量已刷新",
  );
  expect(useButtons()).toHaveLength(1);
});

it("keeps confirmation open on uncertain failure and reuses its key without duplicate submissions", async () => {
  vi.mocked(getAgentUsage).mockResolvedValue(resetFixture());
  let reject!: (error: unknown) => void;
  vi.mocked(consumeCodexResetCredit).mockImplementationOnce(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
  );
  await render();
  await click("Agent 用量");
  await act(async () => useButtons()[0].click());
  await act(async () => confirmUse().click());
  const pendingConfirm = [
    ...document.querySelectorAll<HTMLButtonElement>(
      '[role="alertdialog"] button',
    ),
  ].at(-1)!;
  expect(pendingConfirm.disabled).toBe(true);
  await act(async () => pendingConfirm.click());
  expect(consumeCodexResetCredit).toHaveBeenCalledTimes(1);
  await act(async () => reject("network_error"));
  expect(
    document.querySelector('[role="alertdialog"] [role="alert"]')?.textContent,
  ).toContain("重试会复用本次请求");
  const key = vi.mocked(consumeCodexResetCredit).mock.calls[0][0];
  vi.mocked(consumeCodexResetCredit).mockResolvedValueOnce({
    outcome: "already_redeemed",
    snapshot: null,
    refresh_error: "network_error",
  });
  await act(async () => confirmUse().click());
  expect(consumeCodexResetCredit).toHaveBeenLastCalledWith(key, "reset-one");
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    "重置已完成，但刷新用量失败",
  );
  expect(
    document.querySelector('section[aria-label="使用限额重置"]'),
  ).toBeNull();
});
