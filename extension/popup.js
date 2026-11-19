/* ORBITx — GitHub Tech Stack Peek
 * Works on github.com repo pages (repo languages) and profile pages
 * (aggregate stack across the user's repos). Falls back to mock data
 * when opened via the preview server (?mock=repo|user).
 */
const ORBITX_URL = "https://orbitx-indol.vercel.app/";

const LANG_COLORS = {
  JavaScript: "#f1e05a", TypeScript: "#3178c6", Python: "#3572A5",
  Java: "#b07219", "C#": "#178600", C: "#555555", "C++": "#f34b7d",
  Go: "#00ADD8", Rust: "#dea584", Ruby: "#701516", PHP: "#4F5D95",
  Swift: "#F05138", Kotlin: "#A97BFF", Dart: "#00B4AB", Shell: "#89e051",
  HTML: "#e34c26", CSS: "#563d7c", SCSS: "#c6538c", Vue: "#41b883",
  Svelte: "#ff3e00", Jupyter_Notebook: "#DA5B0B", "Jupyter Notebook": "#DA5B0B",
  R: "#198CE7", Lua: "#000080", Elixir: "#6e4a7e", Haskell: "#5e5086",
  Solidity: "#AA6746", Blade: "#f7523f", Astro: "#ff5a03",
};
const FALLBACK_COLORS = ["#ff7a00", "#06b6d4", "#7c3aed", "#059669", "#d97706", "#1b2559"];

/* ---------------- target detection ---------------- */

function parseGithubUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname !== "github.com" && u.hostname !== "www.github.com") return null;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length >= 2 && parts[0] !== "orgs" && parts[0] !== "topics")
      return { type: "repo", owner: parts[0], repo: parts[1].replace(/\.git$/, "") };
    if (parts.length === 1) return { type: "user", user: parts[0] };
  } catch (_) { /* ignore */ }
  return null;
}

const MOCKS = {
  repo: {
    type: "repo", owner: "vercel", repo: "next.js",
    data: {
      name: "next.js", description: "The React Framework",
      stars: 124000, forks: 26800,
      languages: { JavaScript: 58.4, TypeScript: 38.2, Shell: 2.1, CSS: 1.3 },
    },
  },
  user: {
    type: "user", user: "torvalds",
    data: {
      name: "Linus Torvalds", avatar: "", bio: "Creator of Linux & Git",
      repos: 8, followers: 190000,
      languages: { C: 82.5, Shell: 10.4, Perl: 4.6, Makefile: 2.5 },
    },
  },
};

async function getTarget() {
  const params = new URLSearchParams(location.search);
  const mock = params.get("mock");
  if (mock && MOCKS[mock]) {
    const m = MOCKS[mock];
    return { ...m, data: { ...m.data, _mock: true } };
  }
  if (params.get("live")) {
    // preview-server live mode: target arrives via postMessage
    const target = await new Promise((resolve) => {
      const onMsg = (e) => {
        if (e.data && e.data.orbitxTarget) {
          window.removeEventListener("message", onMsg);
          resolve(e.data.orbitxTarget);
        }
      };
      window.addEventListener("message", onMsg);
    });
    return parseGithubUrl(target);
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return parseGithubUrl(tab && tab.url);
}

/* ---------------- GitHub fetching ---------------- */

async function getToken() {
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    const { githubToken } = await chrome.storage.local.get("githubToken");
    return githubToken || null;
  }
  return null;
}

async function gh(path) {
  const token = await getToken();
  const headers = { Accept: "application/vnd.github+json" };
  if (token) headers.Authorization = "Bearer " + token;
  const res = await fetch("https://api.github.com" + path, { headers });
  if (res.status === 404) throw new Error("NOT_FOUND");
  if (res.status === 403) throw new Error("RATE_LIMIT");
  if (!res.ok) throw new Error("API_ERROR");
  return res.json();
}

function toPercentages(langObj, limit = 6) {
  const total = Object.values(langObj || {}).reduce((a, b) => a + b, 0) || 1;
  return Object.entries(langObj)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, bytes]) => ({ name: name.replace(/_/g, " "), pct: (bytes / total) * 100 }));
}

async function fetchRepo({ owner, repo }) {
  const [info, langs] = await Promise.all([
    gh(`/repos/${owner}/${repo}`),
    gh(`/repos/${owner}/${repo}/languages`),
  ]);
  return {
    badge: "repo", title: `${owner}/${repo}`,
    description: info.description || "",
    avatar: info.owner && info.owner.avatar_url,
    stats: [
      { num: fmt(info.stargazers_count), label: "Stars" },
      { num: fmt(info.forks_count), label: "Forks" },
      { num: String(Object.keys(langs).length), label: "Languages" },
    ],
    languages: toPercentages(langs),
  };
}

async function fetchUser({ user }) {
  const [info, repos] = await Promise.all([
    gh(`/users/${user}`),
    gh(`/users/${user}/repos?per_page=100&sort=updated`),
  ]);
  const counts = {};
  for (const r of repos) {
    if (r.fork) continue;
    if (r.language) counts[r.language] = (counts[r.language] || 0) + 1;
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  const languages = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, n]) => ({ name, pct: (n / total) * 100 }));
  return {
    badge: "user", title: info.name || info.login,
    description: info.bio || `@${info.login} on GitHub`,
    avatar: info.avatar_url,
    stats: [
      { num: fmt(info.public_repos), label: "Repos" },
      { num: fmt(info.followers), label: "Followers" },
      { num: String(languages.length), label: "Top Langs" },
    ],
    languages,
  };
}

function fmt(n) {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
}

/* ---------------- rendering ---------------- */

const el = (id) => document.getElementById(id);

function colorFor(name, i) {
  const key = Object.keys(LANG_COLORS).find(
    (k) => k.toLowerCase() === name.toLowerCase().replace(/ /g, "_")
  );
  return (key && LANG_COLORS[key]) || FALLBACK_COLORS[i % FALLBACK_COLORS.length];
}

function render(target, data) {
  el("loading").remove();
  const c = el("content");

  const badge = document.createElement("span");
  badge.className = "badge " + data.badge;
  badge.textContent = data.badge === "repo" ? "Repository" : "GitHub Profile";

  const head = document.createElement("div");
  head.className = "target";
  if (data.avatar) {
    const img = document.createElement("img");
    img.src = data.avatar;
    img.alt = "";
    head.appendChild(img);
  }
  const wrap = document.createElement("div");
  const name = document.createElement("div");
  name.className = "target-name";
  name.textContent = data.title;
  wrap.appendChild(name);
  if (data.description) {
    const d = document.createElement("div");
    d.className = "target-desc";
    d.textContent = data.description;
    wrap.appendChild(d);
  }
  head.appendChild(wrap);

  const card = document.createElement("div");
  card.className = "stack-card";
  const st = document.createElement("div");
  st.className = "stack-title";
  st.textContent = "Tech Stack";
  card.appendChild(st);

  c.appendChild(badge);
  c.appendChild(head);
  c.appendChild(card);

  if (!data.languages.length) {
    const n = document.createElement("div");
    n.className = "notice";
    n.textContent = "No language data detected for this target yet.";
    c.appendChild(n);
  } else {
    data.languages.forEach((l, i) => {
      const row = document.createElement("div");
      row.className = "lang-row";
      const dot = document.createElement("span");
      dot.className = "lang-dot";
      dot.style.background = colorFor(l.name, i);
      const nm = document.createElement("span");
      nm.className = "lang-name";
      nm.textContent = l.name;
      const track = document.createElement("div");
      track.className = "bar-track";
      const fill = document.createElement("div");
      fill.className = "bar-fill";
      fill.style.width = Math.max(3, l.pct) + "%";
      fill.style.background = colorFor(l.name, i);
      track.appendChild(fill);
      const pct = document.createElement("span");
      pct.className = "lang-pct";
      pct.textContent = l.pct.toFixed(1) + "%";
      row.append(dot, nm, track, pct);
      card.appendChild(row);
    });
  }

  if (data.stats && data.stats.length) {
    const stats = document.createElement("div");
    stats.className = "stats";
    for (const s of data.stats) {
      const box = document.createElement("div");
      box.className = "stat";
      const num = document.createElement("div");
      num.className = "stat-num";
      num.textContent = s.num;
      const lab = document.createElement("div");
      lab.className = "stat-label";
      lab.textContent = s.label;
      box.append(num, lab);
      stats.appendChild(box);
    }
    c.appendChild(stats);
  }

  if (data._mock) {
    const n = document.createElement("div");
    n.className = "notice";
    n.style.marginTop = "10px";
    n.innerHTML = "<strong>Preview mode</strong> — sample data shown. Load the unpacked extension to see live GitHub data.";
    c.appendChild(n);
  }

  const cta = el("cta");
  cta.disabled = false;
  const ghUser = target.type === "repo" ? target.owner : target.user;
  cta.addEventListener("click", () => {
    const url = ORBITX_URL + (ghUser ? "?github=" + encodeURIComponent(ghUser) : "");
    if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url });
    } else {
      window.open(url, "_blank");
    }
  });
}

function renderError(code, target) {
  el("loading").remove();
  const c = el("content");
  const n = document.createElement("div");
  n.className = "notice";
  const msgs = {
    NOT_FOUND: "<strong>Not found.</strong> This GitHub page doesn't resolve to a public repo or user.",
    RATE_LIMIT: "<strong>GitHub rate limit hit.</strong> 60 requests/hour without a token — paste a personal access token below to raise it to 5,000/hour, or wait for the reset.",
    OFF_GITHUB: "<strong>Open a GitHub tab.</strong> Navigate to a github.com repo or profile, then click OrbitX.",
    API_ERROR: "<strong>GitHub API error.</strong> Please try again in a moment.",
  };
  n.innerHTML = msgs[code] || msgs.API_ERROR;
  c.appendChild(n);

  if (code === "RATE_LIMIT") renderTokenForm(c);

  if (target) {
    const cta = el("cta");
    cta.disabled = false;
    const ghUser = target.type === "repo" ? target.owner : target.user;
    cta.addEventListener("click", () => {
      const url = ORBITX_URL + (ghUser ? "?github=" + encodeURIComponent(ghUser) : "");
      window.open(url, "_blank");
    });
  }
}

function renderTokenForm(container) {
  const form = document.createElement("div");
  form.className = "token-form";
  const input = document.createElement("input");
  input.type = "password";
  input.className = "token-input";
  input.placeholder = "ghp_… (public repo token)";
  input.autocomplete = "off";
  const btn = document.createElement("button");
  btn.className = "token-save";
  btn.textContent = "Save & retry";
  const hint = document.createElement("div");
  hint.className = "token-hint";
  hint.innerHTML = "Create one at <b>github.com/settings/tokens</b> — stored only in this browser.";
  btn.addEventListener("click", async () => {
    const token = input.value.trim();
    if (!token) return;
    if (chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({ githubToken: token });
    }
    window.location.reload();
  });
  form.append(input, btn, hint);
  container.appendChild(form);
}

/* ---------------- boot ---------------- */

(async function init() {
  const target = await getTarget();
  if (!target) return renderError("OFF_GITHUB", null);
  if (target.data) return render(target, target.data); // preview mock
  try {
    const data = target.type === "repo" ? await fetchRepo(target) : await fetchUser(target);
    render(target, data);
  } catch (e) {
    renderError(e.message, target);
  }
})();
