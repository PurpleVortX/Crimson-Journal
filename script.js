// script.js
(() => {
  // ====== CONFIG: folder-based entries ======
  const PATHS = {
    racesIndex: "entries/races/index.json",
    racesDir:   "entries/races/",
    classesIndex: "entries/classes/index.json",
    classesDir:   "entries/classes/",
  };

  const elQ = document.getElementById("q");
  const elClassLens = document.getElementById("classLens");
  const elTag = document.getElementById("tagFilter");
  const elGroups = document.getElementById("groups");
  const elCards = document.getElementById("cards");
  const elDetail = document.getElementById("detail");
  const elMeta = document.getElementById("resultsMeta");

  const elBtnAll = document.getElementById("btnAll");
  const elBtnAtoZ = document.getElementById("btnAtoZ");
  const elBtnClear = document.getElementById("btnClear");
  const elBtnRandom = document.getElementById("btnRandom");

  const elToast = document.getElementById("toast");

  const state = {
    races: [],
    classes: [],
    activeRaceId: null,
    classLens: "",
    query: "",
    group: "All",
    tag: "",
  };

  const safe = (s) => String(s ?? "").replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
  }[m]));

  const toast = (msg) => {
    if (!elToast) return;
    elToast.textContent = msg;
    elToast.style.opacity = "1";
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (elToast.style.opacity = "0"), 1200);
  };

  async function fetchJSON(path) {
    const r = await fetch(path, { cache: "no-store" });
    if (!r.ok) throw new Error(path);
    return r.json();
  }

  function asList(idx) {
    if (Array.isArray(idx)) return idx;
    if (idx && typeof idx === "object") {
      if (Array.isArray(idx.files)) return idx.files;
      if (Array.isArray(idx.entries)) return idx.entries;
      if (Array.isArray(idx.races)) return idx.races;
      if (Array.isArray(idx.classes)) return idx.classes;
    }
    return [];
  }

  function normalizeEntryFileName(x) {
    // allow "elf.json" or { "file":"elf.json" } or { "path":"elf.json" }
    if (typeof x === "string") return x.trim();
    if (x && typeof x === "object") return String(x.file || x.path || "").trim();
    return "";
  }

  async function loadEntries(indexPath, dirPath) {
    const idx = await fetchJSON(indexPath);
    const files = asList(idx).map(normalizeEntryFileName).filter(Boolean);
    const unique = [...new Set(files)];

    const results = await Promise.allSettled(
      unique.map(f => fetchJSON(dirPath + f))
    );

    const ok = [];
    const bad = [];
    for (let i = 0; i < results.length; i++) {
      const res = results[i];
      if (res.status === "fulfilled") ok.push(res.value);
      else bad.push(unique[i]);
    }

    if (bad.length) toast(`Missing: ${bad.slice(0, 3).join(", ")}${bad.length > 3 ? "…" : ""}`);
    return ok;
  }

  function idOf(r) {
    return (r.id || r.key || r.name || r.race || "").toString().trim() || ("entry-" + Math.random().toString(16).slice(2));
  }
  function nameOf(r) {
    return (r.name || r.race || r.id || "Entry").toString();
  }

  function collectTags(r) {
    const tags = [];
    const addMany = (x) => {
      if (!x) return;
      if (Array.isArray(x)) x.forEach(v => v && tags.push(String(v)));
      else tags.push(String(x));
    };
    addMany(r.tags);
    addMany(r.traits);
    addMany(r.affinities);
    addMany(r.type);
    addMany(r.category);
    return [...new Set(tags.map(t => t.trim()).filter(Boolean))].slice(0, 12);
  }

  function collectText(r) {
    const parts = [];
    const pushMany = (x) => {
      if (!x) return;
      if (Array.isArray(x)) x.forEach(v => v && parts.push(String(v)));
      else parts.push(String(x));
    };
    pushMany(r.description);
    pushMany(r.notes);
    pushMany(r.traits);
    pushMany(r.tags);
    pushMany(r.title);
    pushMany(r.lore);
    return parts.join(" ").toLowerCase();
  }

  function tapePhoto(src, alt) {
    if (!src) return "";
    return `
      <div class="photo-frame">
        <div class="tape"></div>
        <div class="tape right"></div>
        <img src="${safe(src)}" alt="${safe(alt)}" loading="lazy" />
      </div>
    `;
  }

  function buildClassLens() {
    elClassLens.innerHTML = `<option value="">Class Lens: None</option>`;
    for (const c of state.classes) {
      const name = (c.name || c.class || c.id || "Class").toString();
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = `Class Lens: ${name}`;
      elClassLens.appendChild(opt);
    }
    elClassLens.value = state.classLens || "";
  }

  function buildTagFilter() {
    const all = new Set();
    state.races.forEach(r => collectTags(r).forEach(t => all.add(t)));
    const tags = [...all].sort((a,b)=>a.localeCompare(b));

    elTag.innerHTML = `<option value="">Filter: All tags</option>`;
    for (const t of tags) {
      const opt = document.createElement("option");
      opt.value = t;
      opt.textContent = `Tag: ${t}`;
      elTag.appendChild(opt);
    }
    elTag.value = state.tag || "";
  }

  function buildGroups() {
    elGroups.innerHTML = "";

    const quick = document.createElement("div");
    quick.className = "group";
    quick.innerHTML = `<div class="group-title">Quick</div><div class="group-items"></div>`;
    const qi = quick.querySelector(".group-items");

    const mk = (label, value) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "group-btn" + (state.group === value ? " active" : "");
      b.textContent = label;
      b.addEventListener("click", () => { state.group = value; render(); });
      qi.appendChild(b);
    };
    mk("All", "All");
    mk("A–Z", "A–Z");
    elGroups.appendChild(quick);

    const letters = document.createElement("div");
    letters.className = "group";
    letters.innerHTML = `<div class="group-title">Letters</div><div class="group-items"></div>`;
    const li = letters.querySelector(".group-items");
    ["A–E","F–J","K–O","P–T","U–Z"].forEach(bucket => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "group-btn" + (state.group === bucket ? " active" : "");
      btn.textContent = bucket;
      btn.addEventListener("click", () => { state.group = bucket; render(); });
      li.appendChild(btn);
    });
    elGroups.appendChild(letters);

    const counts = new Map();
    state.races.forEach(r => collectTags(r).forEach(t => counts.set(t, (counts.get(t)||0)+1)));
    const topTags = [...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10).map(x=>x[0]);

    if (topTags.length) {
      const tags = document.createElement("div");
      tags.className = "group";
      tags.innerHTML = `<div class="group-title">Common Tags</div><div class="group-items"></div>`;
      const ti = tags.querySelector(".group-items");
      for (const t of topTags) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "group-btn" + (state.group === t ? " active" : "");
        btn.textContent = t;
        btn.addEventListener("click", () => { state.group = t; render(); });
        ti.appendChild(btn);
      }
      elGroups.appendChild(tags);
    }
  }

  function inLetterBucket(name, bucket) {
    const c = (name[0] || "").toUpperCase();
    if (!c) return false;
    const ranges = {
      "A–E": ["A","E"],
      "F–J": ["F","J"],
      "K–O": ["K","O"],
      "P–T": ["P","T"],
      "U–Z": ["U","Z"],
    };
    const r = ranges[bucket];
    if (!r) return false;
    return c >= r[0] && c <= r[1];
  }

  function filteredRaces() {
    const q = (state.query || "").trim().toLowerCase();
    const tag = (state.tag || "").trim();

    let arr = state.races.slice();

    if (state.group === "A–Z") {
      arr.sort((a,b)=>nameOf(a).localeCompare(nameOf(b)));
    } else if (["A–E","F–J","K–O","P–T","U–Z"].includes(state.group)) {
      arr = arr.filter(r => inLetterBucket(nameOf(r), state.group))
               .sort((a,b)=>nameOf(a).localeCompare(nameOf(b)));
    } else if (state.group && state.group !== "All") {
      arr = arr.filter(r => collectTags(r).some(t => t.toLowerCase() === state.group.toLowerCase()))
               .sort((a,b)=>nameOf(a).localeCompare(nameOf(b)));
    }

    if (tag) {
      arr = arr.filter(r => collectTags(r).some(t => t.toLowerCase() === tag.toLowerCase()));
    }

    if (q) {
      arr = arr.filter(r => nameOf(r).toLowerCase().includes(q) || collectText(r).includes(q));
    }

    return arr;
  }

  function renderEmpty() {
    elDetail.innerHTML = `
      <div class="empty">
        <div>
          <div class="empty-title">No results</div>
          <div class="empty-text">Try clearing filters or changing the search.</div>
        </div>
      </div>
    `;
  }

  function statsTable(r) {
    const s = r.stats || r.baseStats || r.defaults || null;
    if (!s || typeof s !== "object") return "";

    const rows = Object.entries(s).map(([k,v]) => `
      <tr><th>${safe(k)}</th><td>${safe(v)}</td></tr>
    `).join("");

    return `
      <div class="hr"></div>
      <table class="table" aria-label="Stats"><tbody>${rows}</tbody></table>
    `;
  }

  function renderDetail(r) {
    const name = nameOf(r);
    const title = (r.title || "").toString().trim();
    const lens = (state.classLens || "").trim();
    const subtitleParts = [];
    if (lens) subtitleParts.push(`Class: ${lens}`);
    if (title) subtitleParts.push(title);

    const img = (r.image || "").toString().trim();
    const desc = Array.isArray(r.description) ? r.description : (r.description ? [r.description] : []);
    const notes = Array.isArray(r.notes) ? r.notes : (r.notes ? [r.notes] : []);
    const traits = Array.isArray(r.traits) ? r.traits : (r.traits ? [r.traits] : []);
    const tags = collectTags(r);

    elDetail.innerHTML = `
      <div class="entry-title">${safe(name)}</div>
      ${subtitleParts.length ? `<div class="entry-sub">${safe(subtitleParts.join(" • "))}</div>` : `<div class="entry-sub">—</div>`}
      <div class="hr"></div>

      ${img ? tapePhoto(img, name) : ""}

      ${(desc.length ? desc : ["Entry still being written."]).map(t => `<div class="p">${safe(t)}</div>`).join("")}

      ${statsTable(r)}

      ${traits.length ? `<div class="hr"></div>${traits.map(t => `<div class="p">${safe(String(t).startsWith("•") ? t : "• " + t)}</div>`).join("")}` : ""}

      ${notes.length ? `<div class="hr"></div>${notes.map(t => `<div class="p">${safe(String(t).startsWith("•") ? t : "• " + t)}</div>`).join("")}` : ""}

      ${tags.length ? `<div class="hr"></div><div class="p"><b>Tags:</b> ${tags.map(t => `<span class="tag">${safe(t)}</span>`).join(" ")}</div>` : ""}
    `;
  }

  function renderCards() {
    const arr = filteredRaces();
    elCards.innerHTML = "";

    elMeta.textContent = `${arr.length} of ${state.races.length}`;

    for (const r of arr) {
      const id = idOf(r);
      const name = nameOf(r);
      const tags = collectTags(r).slice(0, 4);
      const sig = name.trim()[0]?.toUpperCase() || "•";

      const card = document.createElement("div");
      card.className = "card" + (state.activeRaceId === id ? " active" : "");
      card.dataset.id = id;

      card.innerHTML = `
        <div class="sigil">${safe(sig)}</div>
        <div class="info">
          <div class="name">${safe(name)}</div>
          <div class="tags">${tags.map(t => `<span class="tag">${safe(t)}</span>`).join("")}</div>
        </div>
      `;

      card.addEventListener("click", () => {
        state.activeRaceId = id;
        render();
        renderDetail(r);
      });

      elCards.appendChild(card);
    }

    if (!arr.length) return renderEmpty();

    if (!state.activeRaceId) {
      state.activeRaceId = idOf(arr[0]);
      render();
      renderDetail(arr[0]);
      return;
    }

    const active = arr.find(x => idOf(x) === state.activeRaceId);
    if (!active) {
      state.activeRaceId = idOf(arr[0]);
      render();
      renderDetail(arr[0]);
    } else {
      renderDetail(active);
    }
  }

  function render() {
    buildGroups();
    renderCards();
  }

  function wire() {
    elQ.addEventListener("input", () => {
      state.query = elQ.value || "";
      state.activeRaceId = null;
      render();
    });

    elClassLens.addEventListener("change", () => {
      state.classLens = elClassLens.value || "";
      const arr = filteredRaces();
      const active = arr.find(r => idOf(r) === state.activeRaceId) || arr[0];
      if (active) renderDetail(active);
    });

    elTag.addEventListener("change", () => {
      state.tag = elTag.value || "";
      state.activeRaceId = null;
      render();
    });

    elBtnAll.addEventListener("click", () => { state.group = "All"; state.activeRaceId = null; render(); });
    elBtnAtoZ.addEventListener("click", () => { state.group = "A–Z"; state.activeRaceId = null; render(); });
    elBtnClear.addEventListener("click", () => {
      state.group = "All";
      state.tag = "";
      state.query = "";
      state.activeRaceId = null;
      elTag.value = "";
      elQ.value = "";
      render();
    });

    elBtnRandom.addEventListener("click", () => {
      const arr = filteredRaces();
      if (!arr.length) return;
      const pick = arr[Math.floor(Math.random() * arr.length)];
      state.activeRaceId = idOf(pick);
      render();
      renderDetail(pick);
      toast("Random entry opened.");
    });
  }

  async function start() {
    wire();

    try {
      // Load per-file entries
      const [races, classes] = await Promise.all([
        loadEntries(PATHS.racesIndex, PATHS.racesDir),
        loadEntries(PATHS.classesIndex, PATHS.classesDir),
      ]);

      // Normalize and ensure IDs
      state.races = races.map(r => ({ ...r, id: r.id || idOf(r) }))
                         .sort((a,b)=>nameOf(a).localeCompare(nameOf(b)));

      state.classes = classes.map(c => ({ ...c, id: c.id || (c.name || c.class || "class") }))
                             .sort((a,b)=>(String(a.name||a.class||a.id)).localeCompare(String(b.name||b.class||b.id)));

      buildClassLens();
      buildTagFilter();
      render();
      toast("Entries loaded.");

    } catch (e) {
      toast("Could not load entries indexes. Check entries/races/index.json and entries/classes/index.json");
      state.races = [];
      state.classes = [];
      buildClassLens();
      buildTagFilter();
      render();
    }
  }

  start();
})();
