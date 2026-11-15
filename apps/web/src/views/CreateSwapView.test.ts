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

describe("CreateSwapView", () => {
  beforeEach(() => {
    post.mockReset();
    post.mockResolvedValue({ swap: { code: "ABCD12" } });
  });

  it("submits numeric prices from type=number inputs without calling trim on them", async () => {
    const wrapper = await mountForm();

    await wrapper.find('input[type="number"]').setValue(15);
    const numberInputs = wrapper.findAll('input[type="number"]');
    await numberInputs[0]!.setValue(15);
    await numberInputs[1]!.setValue(40);

    await wrapper.find('input:not([type])').setValue("Friday swap");
    const dateInputs = wrapper.findAll('input[type="date"]');
    await dateInputs[0]!.setValue("2026-12-01");
    await dateInputs[1]!.setValue("2026-12-20");

    await wrapper.find("form").trigger("submit.prevent");
    await flushPromises();

    expect(post).toHaveBeenCalledWith("/api/swaps", {
      title: "Friday swap",
      rulesText: undefined,
      startDate: "2026-12-01",
      giftDeadline: "2026-12-20",
      priceMin: 15,
      priceMax: 40,
      autoMatch: true,
    });
  });

  it("omits blank prices", async () => {
    const wrapper = await mountForm();

    await wrapper.find('input:not([type])').setValue("Friday swap");
    const dateInputs = wrapper.findAll('input[type="date"]');
    await dateInputs[0]!.setValue("2026-12-01");
    await dateInputs[1]!.setValue("2026-12-20");

    await wrapper.find("form").trigger("submit.prevent");
    await flushPromises();

    expect(post).toHaveBeenCalledWith("/api/swaps", {
      title: "Friday swap",
      rulesText: undefined,
      startDate: "2026-12-01",
      giftDeadline: "2026-12-20",
      priceMin: undefined,
      priceMax: undefined,
      autoMatch: true,
    });
  });
});
