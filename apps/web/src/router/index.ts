import { createRouter, createWebHistory } from "vue-router";
import HomeView from "../views/HomeView.vue";
import DashboardView from "../views/DashboardView.vue";
import CreateSwapView from "../views/CreateSwapView.vue";
import ManageSwapView from "../views/ManageSwapView.vue";
import JoinSwapView from "../views/JoinSwapView.vue";
import MySwapView from "../views/MySwapView.vue";
import { api } from "../api";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "home", component: HomeView },
    { path: "/dashboard", name: "dashboard", component: DashboardView, meta: { auth: true } },
    { path: "/create", name: "create", component: CreateSwapView, meta: { auth: true } },
    { path: "/swap/:code/manage", name: "manage", component: ManageSwapView, meta: { auth: true } },
    { path: "/join", redirect: "/join/" },
    { path: "/join/:code?", name: "join", component: JoinSwapView },
    { path: "/s/:code/me/:token?", name: "my-swap", component: MySwapView },
  ],
});

router.beforeEach(async (to) => {
  try {
    const res = await api.get<{ user: unknown }>("/api/auth/me");
    const user = res.user;

    if (to.name === "home" && user && to.query.login !== "1" && !to.query.error) {
      return { name: "dashboard" };
    }

    if (to.meta.auth && !user) {
      return { name: "home", query: { login: "1" } };
    }
  } catch {
    // A failed session check is not a logout. Sending them to sign in again
    // would drop a still-valid 30-day cookie on a blip or a cached error.
  }

  return true;
});

export default router;
