import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";
import ManageSwapView from "./ManageSwapView.vue";

const getMock = vi.fn();
const postMock = vi.fn();

vi.mock("../api", () => ({
  api: {
    get: (...args: unknown[]) => getMock(...args),
    post: (...args: unknown[]) => postMock(...args),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

describe("ManageSwapView matches", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
  });

  it("shows giver → receiver mapping after matching", async () => {
    getMock.mockImplementation(async (path: string) => {
      if (path === "/api/auth/config") return { devTools: false };
      if (path.includes("/manage")) {
        return {
          swap: {
            title: "Friday swap",
            status: "matched",
            code: "ABCD12",
          },
          participants: [
            {
              id: "p1",
              firstName: "Alice",
              steamUsername: "alice_steam",
              discordTag: "Alice#0001",
              hasDiscord: true,
              wishlistCount: 2,
              giftSent: null,
            },
            {
              id: "p2",
              firstName: "Bob",
              steamUsername: "bob_steam",
              discordTag: "Bob#0001",
              hasDiscord: true,
              wishlistCount: 1,
              giftSent: "2026-12-05T00:00:00.000Z",
            },
          ],
          blackouts: [],
          matchingPossible: true,
          assignments: [
            { giverId: "p1", receiverId: "p2", sentAt: null },
            { giverId: "p2", receiverId: "p1", sentAt: "2026-12-05T00:00:00.000Z" },
          ],
        };
      }
      throw new Error(`unexpected ${path}`);
    });

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/swap/:code/manage", component: ManageSwapView },
        { path: "/", component: { template: "<div />" } },
      ],
    });
    await router.push("/swap/ABCD12/manage");
    await router.isReady();

    const wrapper = mount(ManageSwapView, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("Matches");
    expect(wrapper.text()).toContain("Alice");
    expect(wrapper.text()).toContain("Bob");
    expect(wrapper.text()).toContain("bob_steam");
    expect(wrapper.text()).toContain("→");
  });
});
