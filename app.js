(async function () {
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const clipVar = (stage) => `--clip: var(--t-${stage})`;
  const stars = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(n));

  let data;
  try {
    // Revalidate on every load so a data update is never hidden behind a stale cache.
    data = await fetch("data/skills.json", { cache: "no-cache" }).then((r) => r.json());
  } catch (err) {
    $("#grid").innerHTML = `<div class="empty">没能读取 data/skills.json。请通过本地服务器打开页面（见 README），不要直接双击 HTML 文件。</div>`;
    return;
  }

  const { stages, skills, workflows } = data;
  const byId = Object.fromEntries(skills.map((s) => [s.id, s]));
  const stageById = Object.fromEntries(stages.map((s) => [s.id, s]));
  const state = { q: "", stage: null, official: false, nokey: false, plugin: false, cn: false };
  // Skills listed in this repo's own marketplace (.claude-plugin/marketplace.json) install by name.
  const hub = data.hub;
  const hasPlugin = (s) => Boolean(s.market);
  const addMarket = `claude plugin marketplace add ${hub.repo}`;
  const pluginId = (s) => `${s.market.name}@${hub.name}`;

  $("#hero-pill").innerHTML = `<b>${skills.length}</b> 个 skill · <b>${skills.filter((s) => s.cn).length}</b> 个支持国产模型 →`;
  $("#checked").textContent = data.checkedAt;
  $("#install-checked").textContent = data.installCheckedAt || data.checkedAt;

  // Timeline
  const clipHtml = (s) =>
    `<button class="clip" style="${clipVar(s.stage)}" data-jump="${esc(s.id)}" title="${esc(s.name)} · ${esc(s.repo)}"><span class="clip-name">${esc(s.name)}</span><span class="clip-owner">${esc(s.repo.split("/")[0])}</span></button>`;
  const linear = stages.filter((s) => s.id !== "pipeline");
  const cols = linear
    .map((st, i) => {
      const clips = skills.filter((s) => s.stage === st.id).map(clipHtml).join("");
      return `<div class="col"><button class="stage-btn" style="${clipVar(st.id)}" data-stage="${st.id}" aria-pressed="false" title="${esc(st.hint)}"><span class="n">${String(i + 1).padStart(2, "0")}</span>${esc(st.name)}</button>${clips}</div>`;
    })
    .join("");
  const pipe = stageById.pipeline;
  const pipeClips = skills.filter((s) => s.stage === "pipeline").map(clipHtml).join("");
  $("#timeline").innerHTML = `<div class="cols">${cols}</div><div class="pipe"><button class="stage-btn" style="${clipVar("pipeline")}" data-stage="pipeline" aria-pressed="false" title="${esc(pipe.hint)}">${esc(pipe.name)}</button><div class="pipe-clips">${pipeClips}</div></div>`;

  // Stage chips
  $("#stage-chips").innerHTML =
    `<button class="chip" data-stage="" aria-pressed="true">全部</button>` +
    stages.map((st) => `<button class="chip" data-stage="${st.id}" aria-pressed="false" style="${clipVar(st.id)}"><span class="dot"></span>${esc(st.name)}</button>`).join("");

  const setStage = (id) => {
    state.stage = id || null;
    document.querySelectorAll("[data-stage]").forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.stage || null) === state.stage)));
    render();
  };
  document.addEventListener("click", (e) => {
    const stageBtn = e.target.closest("[data-stage]");
    if (stageBtn) {
      const id = stageBtn.dataset.stage;
      const fromTimeline = stageBtn.classList.contains("stage-btn");
      setStage(fromTimeline && state.stage === id ? null : id);
      if (fromTimeline) $("#bin").scrollIntoView();
      return;
    }
    const jump = e.target.closest("[data-jump]");
    if (jump) jumpTo(jump.dataset.jump);
    const copy = e.target.closest("[data-copy]");
    if (copy) copyText(copy, copy.dataset.copy);
  });

  function jumpTo(id) {
    let card = document.getElementById(`skill-${id}`);
    if (!card) {
      state.q = ""; $("#q").value = "";
      state.official = state.nokey = state.plugin = state.cn = false;
      ["#f-official", "#f-nokey", "#f-plugin", "#f-cn"].forEach((s) => ($(s).checked = false));
      setStage(null);
      card = document.getElementById(`skill-${id}`);
    }
    card.scrollIntoView({ block: "center" });
    card.classList.add("flash");
    setTimeout(() => card.classList.remove("flash"), 1400);
  }

  async function copyText(btn, text) {
    btn.dataset.label ||= btn.textContent;
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = "已复制";
    } catch {
      // Clipboard can be refused; select the command so the viewer can copy it by hand.
      const pre = btn.parentElement.querySelector("pre");
      if (pre) {
        const range = document.createRange();
        range.selectNodeContents(pre);
        const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
      }
      btn.textContent = pre ? "已选中" : "复制失败";
    }
    btn.classList.add("done");
    setTimeout(() => { btn.textContent = btn.dataset.label; btn.classList.remove("done"); }, 1500);
  }

  // Filters
  $("#q").addEventListener("input", (e) => { state.q = e.target.value.trim().toLowerCase(); render(); });
  [["#f-official", "official"], ["#f-nokey", "nokey"], ["#f-plugin", "plugin"], ["#f-cn", "cn"]].forEach(([sel, key]) =>
    $(sel).addEventListener("change", (e) => { state[key] = e.target.checked; render(); })
  );

  const cmdBlock = (label, cmd) =>
    `<div class="cmd"><span class="lbl">${esc(label)}</span><pre>${esc(cmd)}</pre><button class="copy" data-copy="${esc(cmd)}" aria-label="复制${esc(label)}命令">复制</button></div>`;

  const keyText = (s) => {
    if (s.apiKey === "unknown") return `<span class="unknown">未核实</span>`;
    const base = s.apiKey === null ? "不需要" : esc(s.apiKey);
    return s.keyNote ? `${base}<span class="key-note">（${esc(s.keyNote)}）</span>` : base;
  };

  // The first block on a card: the one way to install it that works everywhere Claude Code runs.
  // Two shell lines, so a single paste into a terminal adds the marketplace (a no-op the second time) and installs.
  const quickInstall = (s) =>
    s.market
      ? `<div class="cmd primary"><span class="lbl">Claude Code · 在终端粘贴运行</span><pre>${esc(addMarket)}\nclaude plugin install ${esc(pluginId(s))}</pre><button class="copy" data-copy="${esc(`${addMarket}\nclaude plugin install ${pluginId(s)}`)}" aria-label="复制 Claude Code 安装命令">复制</button></div>
        <p class="hint">添加过市场后，也可以在 Claude Code 里输入 <code>/plugin install ${esc(pluginId(s))}</code></p>`
      : "";

  function cardHtml(s) {
    const st = stageById[s.stage];
    const badges = [
      s.official ? `<span class="badge official" title="由工具或平台本身的团队维护">官方</span>` : "",
      s.cn ? `<span class="badge" title="支持国产视频模型或剪映">国产模型 / 剪映</span>` : "",
    ].join("");
    // Keep the card short: one install route shows, everything else folds away.
    // With a marketplace entry that is the Claude Code command; otherwise the upstream's first route.
    const shown = s.market ? [] : s.install.slice(0, 1);
    const rest = s.market ? s.install : s.install.slice(1);
    const extras = [
      s.includes.length > 1 ? `<div class="includes" aria-label="包含的 skill">${s.includes.map((i) => `<code>${esc(i)}</code>`).join("")}</div>` : "",
      s.market ? `<p class="hint">Cursor、Codex 等其他 agent 用下面的命令安装。</p>` : "",
      ...rest.map((i) => cmdBlock(i.label, i.cmd)),
    ].join("");
    const moreLabel = [s.includes.length > 1 ? `包含 ${s.includes.length} 个 skill` : "", rest.length ? (s.market ? "其他 agent / 安装方式" : "其他安装方式") : ""].filter(Boolean).join(" · ");
    return `<article class="card" id="skill-${esc(s.id)}" style="${clipVar(s.stage)}">
      <div class="card-top"><span class="stage-tag">${esc(st.name)}</span>${badges ? `<div class="badges">${badges}</div>` : ""}</div>
      <div>
        <h3><a href="#skill-${esc(s.id)}" class="permalink" title="这个 skill 的链接">${esc(s.name)}</a></h3>
        <a class="repo" href="https://github.com/${esc(s.repo)}" target="_blank" rel="noopener">${esc(s.repo)}</a>
      </div>
      <p class="summary">${esc(s.summary)}</p>
      <dl class="facts">
        <dt>API key</dt><dd>${keyText(s)}</dd>
        <dt>依赖</dt><dd>${s.local.length ? esc(s.local.join("、")) : "无"}</dd>
        <dt>GitHub</dt><dd class="num">★ ${stars(s.stars)} · ${esc(s.license)} · ${esc(s.updated)}</dd>
      </dl>
      ${s.note ? `<p class="note">${esc(s.note)}</p>` : ""}
      <div class="install">
        ${quickInstall(s)}
        ${shown.map((i) => cmdBlock(i.label, i.cmd)).join("")}
        ${s.noMarket ? `<p class="hint">没有放进插件市场：${esc(s.noMarket)}。</p>` : ""}
        ${extras ? `<details class="more"><summary>${moreLabel}</summary><div class="more-body">${extras}</div></details>` : ""}
      </div>
    </article>`;
  }

  function matches(s) {
    if (state.stage && s.stage !== state.stage) return false;
    if (state.official && !s.official) return false;
    if (state.nokey && s.apiKey !== null) return false;
    if (state.plugin && !hasPlugin(s)) return false;
    if (state.cn && !s.cn) return false;
    if (state.q) {
      const hay = [s.name, s.repo, s.summary, stageById[s.stage].name, ...s.includes, ...s.local, s.apiKey || "", s.keyNote || "", s.note || ""].join(" ").toLowerCase();
      if (!hay.includes(state.q)) return false;
    }
    return true;
  }

  function render() {
    const list = skills.filter(matches).sort((a, b) => b.stars - a.stars);
    $("#grid").innerHTML = list.length ? list.map(cardHtml).join("") : `<div class="empty">没有符合条件的 skill。换个关键词，或取消一些筛选试试。</div>`;
    $("#count").textContent = `${list.length} / ${skills.length}`;
  }
  render();

  // A link like #skill-capcut-cli opens that card, even after filters or a search hid it.
  const openFromHash = () => {
    const id = decodeURIComponent(location.hash).replace(/^#skill-/, "");
    if (location.hash.startsWith("#skill-") && byId[id]) jumpTo(id);
  };
  window.addEventListener("hashchange", openFromHash);

  // Workflows
  $("#flow-list").innerHTML = workflows
    .map((w) => {
      // Marketplace skills go in as one block of shell lines; the rest keep their own commands.
      const steps = w.steps.map((st) => byId[st.skill]);
      const viaMarket = steps.filter((s) => s.market);
      const allCmds = [
        viaMarket.length ? `# Claude Code\n${addMarket}\n${viaMarket.map((s) => `claude plugin install ${pluginId(s)}`).join("\n")}` : "",
        ...steps.filter((s) => !s.market).map((s) => `# ${s.name}\n${s.install[0].cmd}`),
      ].filter(Boolean).join("\n\n");
      return `<article class="flow">
        <div class="flow-head">
          <h3>${esc(w.name)}</h3>
          <p>${esc(w.summary)}</p>
          <button class="btn ghost small" data-copy="${esc(allCmds)}">复制全部安装命令</button>
        </div>
        <ol class="steps">${w.steps
          .map((st) => `<li class="step">${clipHtml(byId[st.skill])}<p>${esc(st.does)}</p></li>`)
          .join("")}</ol>
      </article>`;
    })
    .join("");

  // Marketplace band: add it once, then install from any card or browse inside Claude Code.
  $("#market-count").textContent = skills.filter(hasPlugin).length;
  $("#market-cmds").innerHTML =
    cmdBlock("1. 添加市场（只需一次）", addMarket) +
    cmdBlock("2. 安装卡片上的 skill，比如", `claude plugin install ${pluginId(skills.find(hasPlugin))}`) +
    cmdBlock("或者在 Claude Code 里浏览全部", "/plugin");

  // Run last, once every section above has its final height.
  openFromHash();
})();
