import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";
import JoinSwapView from "./JoinSwapView.vue";

const getMock = vi.fn();

vi.mock("../api", () => ({
  api: {
    get: (...args: unknown[]) => getMock(...args),
    post: vi.fn(),
  },
  discordLinkUrl: (code: string) => `/auth/discord/link/${code}`,
}));

describe("JoinSwapView Discord gate", () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it("hides the join form until Discord is signed in when not in dev tools", async () => {
    getMock.mockImplementation(async (path: string) => {
      if (path === "/api/auth/config") return { botInviteUrl: "https://discord.gg/x", devTools: false };
      if (path === "/api/auth/me") return { user: null };
      if (path.includes("/api/swaps/")) {
        return { swap: { title: "Friday swap", canJoin: true } };
      }
      throw new Error(path);
    });

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/join/:code?", component: JoinSwapView },
        { path: "/", component: { template: "<div />" } },
      ],
    });
    await router.push("/join/ABCD12");
    await router.isReady();

    const wrapper = mount(JoinSwapView, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("Discord required");
    expect(wrapper.text()).toContain("Sign in with Discord");
    expect(wrapper.text()).not.toContain("First name");
    expect(wrapper.find('button[type="submit"]').exists()).toBe(false);
  });

  it("shows the join form when Discord session is present", async () => {
    getMock.mockImplementation(async (path: string) => {
      if (path === "/api/auth/config") return { botInviteUrl: "https://discord.gg/x", devTools: false };
      if (path === "/api/auth/me") {
        return {
          user: {
            discordId: "123",
            discordTag: "Tester",
            displayName: "Tester",
          },
        };
      }
      if (path.includes("/api/swaps/")) {
        return { swap: { title: "Friday swap", canJoin: true } };
      }
      throw new Error(path);
    });

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/join/:code?", component: JoinSwapView },
        { path: "/", component: { template: "<div />" } },
      ],
    });
    await router.push("/join/ABCD12");
    await router.isReady();

    const wrapper = mount(JoinSwapView, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("Signed in as");
    expect(wrapper.text()).toContain("Tester");
    expect(wrapper.text()).toContain("First name");
    expect(wrapper.find('button[type="submit"]').exists()).toBe(true);
  });
});
