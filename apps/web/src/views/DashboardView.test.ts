import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";
import DashboardView from "./DashboardView.vue";

const get = vi.fn();

vi.mock("../api", () => ({
  api: {
    get: (...args: unknown[]) => get(...args),
  },
}));

async function mountDashboard() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: { template: "<div />" } },
      { path: "/dashboard", component: DashboardView },
      { path: "/join", component: { template: "<div />" } },
      { path: "/create", component: { template: "<div />" } },
      { path: "/swap/:code/manage", component: { template: "<div />" } },
      { path: "/s/:code/me/:token?", component: { template: "<div />" } },
    ],
  });
  await router.push("/dashboard");
  await router.isReady();
  return mount(DashboardView, { global: { plugins: [router] } });
}

describe("DashboardView", () => {
  beforeEach(() => {
    get.mockReset();
  });

  it("splits swaps you joined from swaps you made and links a match profile", async () => {
    get.mockResolvedValue({
      created: [
        { code: "MADE01", title: "The one I made", status: "matched", participantCount: 4 },
      ],
      joined: [
        {
          code: "MADE01",
          title: "The one I made",
          status: "matched",
          participantCount: 4,
          match: {
            firstName: "Alex",
            steamUsername: "alex_steam",
            steamProfileUrl: "https://steamcommunity.com/id/alex_steam",
          },
        },
        {
          code: "JOIN99",
          title: "A friend's swap",
          status: "open",
          participantCount: 2,
          match: null,
        },
      ],
    });

    const wrapper = await mountDashboard();
    await flushPromises();

    const text = wrapper.text();
    const inSection = text.slice(text.indexOf("Swaps I'm in"), text.indexOf("Swaps I made"));
    const madeSection = text.slice(text.indexOf("Swaps I made"));

    expect(inSection).toContain("The one I made");
    expect(inSection).toContain("A friend's swap");
    expect(inSection).toContain("My page");
    expect(inSection).toContain("Open Steam profile");
    expect(madeSection).toContain("The one I made");
    expect(madeSection).toContain("Manage");
    expect(madeSection).not.toContain("A friend's swap");

    const match = wrapper.find('a[href="https://steamcommunity.com/id/alex_steam"]');
    expect(match.exists()).toBe(true);
    expect(wrapper.find('a[href="/s/MADE01/me"]').exists()).toBe(true);
    expect(wrapper.find('a[href="/s/JOIN99/me"]').exists()).toBe(true);
    expect(wrapper.find('a[href="/swap/MADE01/manage"]').exists()).toBe(true);
  });
});