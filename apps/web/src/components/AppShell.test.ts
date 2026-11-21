import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";
import AppShell from "./AppShell.vue";

const getMock = vi.fn();
const postMock = vi.fn();

vi.mock("../api", () => ({
  api: {
    get: (...args: unknown[]) => getMock(...args),
    post: (...args: unknown[]) => postMock(...args),
  },
  discordLoginUrl: () => "/auth/discord",
}));

describe("AppShell leave swap", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    vi.stubGlobal("confirm", vi.fn());
  });

  it("labels the control Leave swap and confirms before leaving when signed in", async () => {
    getMock.mockResolvedValue({
      user: { displayName: "Manager", avatarUrl: null },
      actingAs: { firstName: "Alice", code: "ABCD12" },
    });
    postMock.mockResolvedValue({ ok: true });
    (window.confirm as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/", component: { template: "<div />" } },
        { path: "/dashboard", component: { template: "<div />" } },
        { path: "/join", component: { template: "<div />" } },
        { path: "/s/:code/me", component: { template: "<div />" } },
        { path: "/swap/:code/manage", component: { template: "<div />" } },
      ],
    });
    await router.push("/");
    await router.isReady();

    const wrapper = mount(AppShell, {
      slots: { default: "<div>content</div>" },
      global: { plugins: [router] },
    });
    await flushPromises();

    const leaveBtn = wrapper.findAll("button").find((b) => b.text() === "Leave swap");
    expect(leaveBtn).toBeTruthy();
    await leaveBtn!.trigger("click");
    expect(window.confirm).toHaveBeenCalledWith(
      "Leave this swap view? Your Discord login stays signed in.",
    );
    expect(postMock).toHaveBeenCalledWith("/api/auth/dev/stop-acting");
  });

  it("does not leave when confirmation is cancelled", async () => {
    getMock.mockResolvedValue({
      user: { displayName: "Manager", avatarUrl: null },
      actingAs: { firstName: "Alice", code: "ABCD12" },
    });
    (window.confirm as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/", component: { template: "<div />" } },
        { path: "/dashboard", component: { template: "<div />" } },
        { path: "/join", component: { template: "<div />" } },
        { path: "/s/:code/me", component: { template: "<div />" } },
        { path: "/swap/:code/manage", component: { template: "<div />" } },
      ],
    });
    await router.push("/");
    await router.isReady();

    const wrapper = mount(AppShell, {
      slots: { default: "<div>content</div>" },
      global: { plugins: [router] },
    });
    await flushPromises();

    const leaveBtn = wrapper.findAll("button").find((b) => b.text() === "Leave swap");
    await leaveBtn!.trigger("click");
    expect(postMock).not.toHaveBeenCalled();
  });
});
