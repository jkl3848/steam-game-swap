import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRouter, createMemoryHistory } from "vue-router";
import CreateSwapView from "./CreateSwapView.vue";

const post = vi.fn();

vi.mock("../api", () => ({
  api: {
    post: (...args: unknown[]) => post(...args),
  },
}));

async function mountForm() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: { template: "<div />" } },
      { path: "/create", component: CreateSwapView },
      { path: "/swap/:code/manage", component: { template: "<div />" } },
    ],
  });
  await router.push("/create");
  await router.isReady();

  return mount(CreateSwapView, {
    global: {
      plugins: [router],
    },
  });
}

async function fillRequired(wrapper: Awaited<ReturnType<typeof mountForm>>) {
  await wrapper.find('input:not([type])').setValue("Friday swap");
  const urlInput = wrapper.find('input[type="url"]');
  await urlInput.setValue("https://discord.gg/example");
  const datetimeInputs = wrapper.findAll('input[type="datetime-local"]');
  await datetimeInputs[0]!.setValue("2026-12-01T15:00");
  await datetimeInputs[1]!.setValue("2026-12-20T18:00");
}

describe("CreateSwapView", () => {
  beforeEach(() => {
    post.mockReset();
    post.mockResolvedValue({ swap: { code: "ABCD12" } });
  });

  it("submits numeric prices from type=number inputs without calling trim on them", async () => {
    const wrapper = await mountForm();
    await fillRequired(wrapper);

    const numberInputs = wrapper.findAll('input[type="number"]');
    await numberInputs[0]!.setValue(15);
    await numberInputs[1]!.setValue(40);

    await wrapper.find("form").trigger("submit.prevent");
    await flushPromises();

    expect(post).toHaveBeenCalledWith(
      "/api/swaps",
      expect.objectContaining({
        title: "Friday swap",
        rulesText: undefined,
        priceMin: 15,
        priceMax: 40,
        autoMatch: true,
        discordInviteUrl: "https://discord.gg/example",
        timeZone: expect.any(String),
      }),
    );
    const payload = post.mock.calls[0]![1] as {
      startDate: string;
      giftDeadline: string;
    };
    expect(payload.startDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(payload.giftDeadline).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("omits blank prices", async () => {
    const wrapper = await mountForm();
    await fillRequired(wrapper);

    await wrapper.find("form").trigger("submit.prevent");
    await flushPromises();

    expect(post).toHaveBeenCalledWith(
      "/api/swaps",
      expect.objectContaining({
        title: "Friday swap",
        rulesText: undefined,
        priceMin: undefined,
        priceMax: undefined,
        autoMatch: true,
        discordInviteUrl: "https://discord.gg/example",
      }),
    );
  });
});
