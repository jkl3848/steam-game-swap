/**
 * Creates a GitHub Actions deploy identity for Firebase Hosting:
 * service account + Workload Identity Federation (OIDC, no JSON key).
 *
 * Uses the logged-in Firebase CLI session.
 */
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const PROJECT_ID = "steam-game-swap-dev";
const PROJECT_NUMBER = "807163395777";
const SA_ID = "github-hosting";
const SA_EMAIL = `${SA_ID}@${PROJECT_ID}.iam.gserviceaccount.com`;
const POOL_ID = "github-actions";
const PROVIDER_ID = "github";
const GITHUB_REPO = "jkl3848/steam-game-swap";

const require = createRequire(import.meta.url);

async function getAccessToken() {
  const auth = require("firebase-tools/lib/auth.js");
  const scopes = require("firebase-tools/lib/scopes.js");
  const account = auth.getGlobalDefaultAccount?.() ?? auth.getAllAccounts?.()?.[0];
  const refreshToken = account?.tokens?.refresh_token;
  if (!refreshToken) {
    throw new Error(
      "Could not find a Firebase CLI login. Run: npx firebase-tools@latest login",
    );
  }
  const tokens = await auth.getAccessToken(refreshToken, [scopes.CLOUD_PLATFORM]);
  const token = typeof tokens === "string" ? tokens : tokens?.access_token;
  if (!token) {
    throw new Error("Firebase CLI login did not return an access token");
  }
  return token;
}

async function google(method, url, token, body) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const msg = json?.error?.message ?? text ?? res.statusText;
    const err = new Error(`${method} ${url} -> ${res.status}: ${msg}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

async function enableApis(token) {
  const apis = [
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "sts.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "firebasehosting.googleapis.com",
  ];
  for (const api of apis) {
    try {
      await google(
        "POST",
        `https://serviceusage.googleapis.com/v1/projects/${PROJECT_ID}/services/${api}:enable`,
        token,
        {},
      );
      console.log(`Enabled ${api}`);
    } catch (e) {
      if (e.status === 400 || e.status === 409) {
        console.log(`${api} already enabled or pending`);
      } else {
        throw e;
      }
    }
  }
}

async function ensureServiceAccount(token) {
  try {
    await google(
      "POST",
      `https://iam.googleapis.com/v1/projects/${PROJECT_ID}/serviceAccounts`,
      token,
      {
        accountId: SA_ID,
        serviceAccount: {
          displayName: "GitHub Actions Hosting deploy",
          description: "Deploys Firebase Hosting from GitHub Actions via WIF",
        },
      },
    );
    console.log(`Created service account ${SA_EMAIL}`);
  } catch (e) {
    if (e.status === 409) {
      console.log(`Service account ${SA_EMAIL} already exists`);
    } else {
      throw e;
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function grantProjectRoles(token) {
  const roles = [
    "roles/firebasehosting.admin",
    "roles/serviceusage.serviceUsageConsumer",
    "roles/firebase.viewer",
  ];
  const delays = [5000, 10000, 20000];
  let lastError;
  for (const delay of [0, ...delays]) {
    if (delay) {
      console.log(`Waiting ${delay / 1000}s for service account to propagate...`);
      await sleep(delay);
    }
    try {
      const policy = await google(
        "POST",
        `https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT_ID}:getIamPolicy`,
        token,
        {},
      );
      policy.bindings ??= [];
      let changed = false;
      for (const role of roles) {
        let binding = policy.bindings.find((b) => b.role === role);
        if (!binding) {
          binding = { role, members: [] };
          policy.bindings.push(binding);
        }
        const member = `serviceAccount:${SA_EMAIL}`;
        if (!binding.members.includes(member)) {
          binding.members.push(member);
          changed = true;
        }
      }
      if (!changed) {
        console.log("Project IAM roles already granted");
        return;
      }
      await google(
        "POST",
        `https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT_ID}:setIamPolicy`,
        token,
        { policy },
      );
      console.log("Granted Hosting deploy roles to service account");
      return;
    } catch (e) {
      lastError = e;
      if (e.status !== 400) throw e;
    }
  }
  throw lastError;
}

async function ensureWif(token) {
  const poolName = `projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}`;
  try {
    await google(
      "POST",
      `https://iam.googleapis.com/v1/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools?workloadIdentityPoolId=${POOL_ID}`,
      token,
      {
        displayName: "GitHub Actions",
        description: "OIDC pool for GitHub Actions deploys",
      },
    );
    console.log(`Created WIF pool ${POOL_ID}`);
  } catch (e) {
    if (e.status === 409) {
      console.log(`WIF pool ${POOL_ID} already exists`);
    } else {
      throw e;
    }
  }

  const providerParent = `${poolName}/providers`;
  try {
    await google(
      "POST",
      `https://iam.googleapis.com/v1/${providerParent}?workloadIdentityPoolProviderId=${PROVIDER_ID}`,
      token,
      {
        displayName: "GitHub",
        description: `GitHub repo ${GITHUB_REPO}`,
        attributeMapping: {
          "google.subject": "assertion.sub",
          "attribute.actor": "assertion.actor",
          "attribute.repository": "assertion.repository",
          "attribute.repository_owner": "assertion.repository_owner",
        },
        attributeCondition: `assertion.repository == "${GITHUB_REPO}"`,
        oidc: {
          issuerUri: "https://token.actions.githubusercontent.com",
        },
      },
    );
    console.log(`Created WIF provider ${PROVIDER_ID}`);
  } catch (e) {
    if (e.status === 409) {
      console.log(`WIF provider ${PROVIDER_ID} already exists`);
    } else {
      throw e;
    }
  }
}

async function bindWifToSa(token) {
  const principal = `principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/attribute.repository/${GITHUB_REPO}`;
  const resource = `projects/${PROJECT_ID}/serviceAccounts/${SA_EMAIL}`;
  const policy = await google(
    "POST",
    `https://iam.googleapis.com/v1/${resource}:getIamPolicy`,
    token,
    {},
  );
  policy.bindings ??= [];
  let binding = policy.bindings.find((b) => b.role === "roles/iam.workloadIdentityUser");
  if (!binding) {
    binding = { role: "roles/iam.workloadIdentityUser", members: [] };
    policy.bindings.push(binding);
  }
  if (binding.members.includes(principal)) {
    console.log("WIF already bound to service account");
    return;
  }
  binding.members.push(principal);
  await google(
    "POST",
    `https://iam.googleapis.com/v1/${resource}:setIamPolicy`,
    token,
    { policy },
  );
  console.log("Bound GitHub repo to service account via WIF");
}

function resolveFirebaseTools() {
  const fromProject = spawnSync("pnpm", ["root", "-w"], {
    encoding: "utf8",
    shell: true,
  });
  if (fromProject.status === 0) {
    process.env.NODE_PATH = `${fromProject.stdout.trim()}`;
  }
}

async function main() {
  resolveFirebaseTools();
  const token = await getAccessToken();
  if (!token) throw new Error("Empty access token from Firebase CLI");
  await enableApis(token);
  await ensureServiceAccount(token);
  await grantProjectRoles(token);
  await ensureWif(token);
  await bindWifToSa(token);
  console.log(`
GitHub Actions can now deploy Hosting as ${SA_EMAIL}
Provider: projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/providers/${PROVIDER_ID}
Repo: ${GITHUB_REPO}
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
