/* Purple Codex — local-first world bible
   - Loads default data from /data/world.json
   - Overrides with localStorage if present
   - CRUD for lore/races/characters
   - Search across all
   - Export/import JSON
*/

const STORAGE_KEY = "purple_codex_world_v1";
const RECENT_KEY = "purple_codex_recent_v1";
const DEFAULT_DATA_URL = "data/world.json";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const now = () => Date.now();

let state = {
  world: { title: "Your World", tagline: "World Bible • Lore • Races • Characters" },
  lore: [],
  races: [],
  characters: []
};

let ui = {
  currentView: "home",
  selectedLoreId: null,
  selectedRaceId: null,
  selectedCharId: null,
  editingLore: false,
  editingRace: false,
  editingChar: false
};

/* ---------- Utilities ---------- */

function uid(prefix){
  return `${prefix}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

function safeText(s){
  return (s ?? "").toString();
}

function escapeHtml(str){
  return safeText(str)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function setRecent(type, id, title){
  const entry = { type, id, title, t: now() };
  const rec = loadRecent();
  const filtered = rec.filter(x => !(x.type === type && x.id === id));
  filtered.unshift(entry);
  const trimmed = filtered.slice(0, 10);
  localStorage.setItem(RECENT_KEY, JSON.stringify(trimmed));
  renderHome();
}

function loadRecent(){
  try{
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
  }catch{
    return [];
  }
}

function clearRecent(){
  localStorage.removeItem(RECENT_KEY);
  renderHome();
}

/* ---------- Markdown-ish renderer ---------- */
/* Supports:
   - headings # ## ###
   - bold **text**
   - italics *text*
   - inline code `code`
   - blockquote > ...
   - unordered list - item
   - links [[Page Title]] => clickable lore link
*/
function renderMarkdown(md){
  const lines = safeText(md).replace(/\r\n/g,"\n").split("\n");
  let out = [];
  let inList = false;

  const closeList = () => {
    if(inList){ out.push("</ul>"); inList = false; }
  };

  for(const rawLine of lines){
    let line = rawLine;

    // blockquote
    if(line.startsWith("> ")){
      closeList();
      out.push(`<blockquote>${inlineMd(line.slice(2))}</blockquote>`);
      continue;
    }

    // headings
    if(/^###\s+/.test(line)){
      closeList();
      out.push(`<h3>${inlineMd(line.replace(/^###\s+/,""))}</h3>`);
      continue;
    }
    if(/^##\s+/.test(line)){
      closeList();
      out.push(`<h2>${inlineMd(line.replace(/^##\s+/,""))}</h2>`);
      continue;
    }
    if(/^#\s+/.test(line)){
      closeList();
      out.push(`<h1>${inlineMd(line.replace(/^#\s+/,""))}</h1>`);
      continue;
    }

    // list
    if(/^\-\s+/.test(line)){
      if(!inList){ out.push("<ul>"); inList = true; }
      out.push(`<li>${inlineMd(line.replace(/^\-\s+/,""))}</li>`);
      continue;
    }

    // blank
    if(line.trim() === ""){
      closeList();
      out.push("<div style='height:10px'></div>");
      continue;
    }

    // paragraph
    closeList();
    out.push(`<p>${inlineMd(line)}</p>`);
  }

  closeList();
  return out.join("\n");
}

function inlineMd(text){
  let t = escapeHtml(text);

  // inline code
  t = t.replace(/`([^`]+)`/g, (_m, g1) => `<code>${escapeHtml(g1)}</code>`);

  // bold
  t = t.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");

  // italics (simple)
  t = t.replace(/\*([^*]+)\*/g, "<i>$1</i>");

  // [[Links]] to lore titles
  t = t.replace(/\[\[([^\]]+)\]\]/g, (_m, title) => {
    const name = title.trim();
    const id = findLoreIdByTitle(name);
    const data = id ? `data-link="${id}"` : `data-link-missing="${escapeHtml(name)}"`;
    return `<a href="#" class="wikilink" ${data}>${escapeHtml(name)}</a>`;
  });

  return t;
}

function findLoreIdByTitle(title){
  const x = state.lore.find(p => p.title.toLowerCase() === title.toLowerCase());
  return x?.id || null;
}

/* ---------- Persistence ---------- */

function saveAll(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  toast("Saved.");
}

async function loadInitial(){
  // LocalStorage wins
  const local = localStorage.getItem(STORAGE_KEY);
  if(local){
    try{
      state = JSON.parse(local);
      normalizeState();
      return;
    }catch{
      // fallthrough to default
    }
  }

  // Load default file
  const res = await fetch(DEFAULT_DATA_URL);
  const data = await res.json();
  state = data;
  normalizeState();
  // set timestamps if missing
  stampAllIfZero();
  saveAll();
}

function normalizeState(){
  state.world ??= { title:"Your World", tagline:"World Bible • Lore • Races • Characters" };
  state.lore ??= [];
  state.races ??= [];
  state.characters ??= [];
}

function stampAllIfZero(){
  const t = now();
  state.lore.forEach(x => { if(!x.updatedAt) x.updatedAt = t; });
  state.races.forEach(x => { if(!x.updatedAt) x.updatedAt = t; });
  state.characters.forEach(x => { if(!x.updatedAt) x.updatedAt = t; });
}

function wipeLocal(){
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(RECENT_KEY);
  location.reload();
}

/* ---------- Navigation ---------- */

function setView(name){
  ui.currentView = name;
  $$(".view").forEach(v => v.classList.remove("active"));
  $(`#view-${name}`).classList.add("active");

  $$(".navItem").forEach(b => b.classList.remove("active"));
  $(`.navItem[data-view="${name}"]`).classList.add("active");

  if(name === "home") renderHome();
  if(name === "lore") renderLore();
  if(name === "races") renderRaces();
  if(name === "characters") renderCharacters();
  if(name === "search") renderSearch();
  if(name === "settings") renderSettings();
}

/* ---------- Rendering ---------- */

function renderTop(){
  $("#worldTitle").textContent = state.world.title || "Your World";
  $("#worldTagline").textContent = state.world.tagline || "";
  $("#worldSubtitle").textContent = state.world.tagline || "World Bible • Lore • Races • Characters";
}

function renderHome(){
  renderTop();
  $("#statLore").textContent = state.lore.length.toString();
  $("#statRaces").textContent = state.races.length.toString();
  $("#statChars").textContent = state.characters.length.toString();

  const starters = [
    "History",
    "Magic",
    "Factions",
    "Locations",
    "Cosmology",
    "Artifacts",
    "Creatures",
    "Timeline",
    "Rules of the World"
  ];
  const wrap = $("#starterChips");
  wrap.innerHTML = "";
  starters.forEach(s => {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.textContent = s;
    chip.onclick = () => {
      const page = newLorePage({ title: s, section: "Starter", body: `## ${s}\nWrite here.\n` });
      ui.selectedLoreId = page.id;
      setView("lore");
    };
    wrap.appendChild(chip);
  });

  const rec = loadRecent();
  const rwrap = $("#recentList");
  rwrap.innerHTML = "";
  if(rec.length === 0){
    rwrap.innerHTML = `<div class="muted small">No recent edits yet.</div>`;
  }else{
    for(const r of rec){
      const div = document.createElement("div");
      div.className = "recentItem";
      div.innerHTML = `<div class="listTitle">${escapeHtml(r.title)}</div>
        <div class="listMeta">${escapeHtml(r.type)} • ${new Date(r.t).toLocaleString()}</div>`;
      div.onclick = () => {
        if(r.type === "lore"){ ui.selectedLoreId = r.id; setView("lore"); }
        if(r.type === "race"){ ui.selectedRaceId = r.id; setView("races"); }
        if(r.type === "character"){ ui.selectedCharId = r.id; setView("characters"); }
      };
      rwrap.appendChild(div);
    }
  }
}

/* ---------- Lore ---------- */

function renderLore(){
  renderTop();
  populateLoreSectionFilter();
  const filterText = $("#loreFilter").value.toLowerCase();
  const section = $("#loreSectionFilter").value;

  const list = $("#loreList");
  list.innerHTML = "";

  const items = state.lore
    .slice()
    .sort((a,b)=> (b.updatedAt||0) - (a.updatedAt||0))
    .filter(p => {
      const okText = (p.title + " " + p.section + " " + p.body).toLowerCase().includes(filterText);
      const okSection = !section || (safeText(p.section).toLowerCase() === section.toLowerCase());
      return okText && okSection;
    });

  if(items.length === 0){
    list.innerHTML = `<div class="muted small">No lore pages match.</div>`;
  }else{
    for(const p of items){
      const el = document.createElement("div");
      el.className = "listItem" + (p.id === ui.selectedLoreId ? " active" : "");
      el.innerHTML = `<div class="listTitle">${escapeHtml(p.title || "Untitled")}</div>
                      <div class="listMeta">${escapeHtml(p.section || "—")} • ${timeAgo(p.updatedAt)}</div>`;
      el.onclick = () => {
        ui.selectedLoreId = p.id;
        ui.editingLore = false;
        renderLore();
      };
      list.appendChild(el);
    }
  }

  const page = state.lore.find(x => x.id === ui.selectedLoreId);
  if(!page){
    $("#loreEmpty").classList.remove("hidden");
    $("#loreView").classList.add("hidden");
    $("#loreEditor").classList.add("hidden");
    $("#loreCrumbs").textContent = "Lore";
    return;
  }

  $("#loreCrumbs").textContent = `Lore / ${page.section || "—"} / ${page.title || "Untitled"}`;

  if(ui.editingLore){
    showLoreEditor(page);
  }else{
    showLoreView(page);
  }
}

function populateLoreSectionFilter(){
  const sel = $("#loreSectionFilter");
  const cur = sel.value;
  const sections = Array.from(new Set(state.lore.map(x => x.section).filter(Boolean))).sort();
  sel.innerHTML = `<option value="">All sections</option>` + sections.map(s => `<option>${escapeHtml(s)}</option>`).join("");
  // keep selection if possible
  if(sections.includes(cur)) sel.value = cur;
}

function showLoreView(page){
  $("#loreEmpty").classList.add("hidden");
  $("#loreView").classList.remove("hidden");
  $("#loreEditor").classList.add("hidden");

  $("#loreTitle").textContent = page.title || "Untitled";
  $("#loreSectionTag").textContent = page.section || "—";
  $("#loreUpdated").textContent = `Updated ${timeAgo(page.updatedAt)}`;
  $("#loreBody").innerHTML = renderMarkdown(page.body || "");

  // handle wikilinks
  $("#loreBody").querySelectorAll("a.wikilink").forEach(a=>{
    a.addEventListener("click",(e)=>{
      e.preventDefault();
      const id = a.getAttribute("data-link");
      if(id){
        ui.selectedLoreId = id;
        ui.editingLore = false;
        renderLore();
        setRecent("lore", id, state.lore.find(x=>x.id===id)?.title || "Lore");
      }else{
        const missing = a.getAttribute("data-link-missing");
        toast(`No page found titled "${missing}". Create it with New Page.`);
      }
    });
  });
}

function showLoreEditor(page){
  $("#loreEmpty").classList.add("hidden");
  $("#loreView").classList.add("hidden");
  $("#loreEditor").classList.remove("hidden");

  $("#loreTitleInput").value = page.title || "";
  $("#loreSectionInput").value = page.section || "";
  $("#loreBodyInput").value = page.body || "";

  updateLorePreview();
}

function updateLorePreview(){
  $("#lorePreview").innerHTML = renderMarkdown($("#loreBodyInput").value);
}

function newLorePage(seed={}){
  const page = {
    id: uid("lore"),
    title: seed.title || "New Lore Page",
    section: seed.section || "Unsorted",
    body: seed.body || "Write here…\n",
    updatedAt: now()
  };
  state.lore.unshift(page);
  ui.selectedLoreId = page.id;
  ui.editingLore = true;
  saveAll();
  setRecent("lore", page.id, page.title);
  return page;
}

function saveLore(){
  const page = state.lore.find(x => x.id === ui.selectedLoreId);
  if(!page) return;

  page.title = $("#loreTitleInput").value.trim() || "Untitled";
  page.section = $("#loreSectionInput").value.trim() || "Unsorted";
  page.body = $("#loreBodyInput").value;
  page.updatedAt = now();

  ui.editingLore = false;
  saveAll();
  setRecent("lore", page.id, page.title);
  renderLore();
}

function deleteLore(){
  const page = state.lore.find(x => x.id === ui.selectedLoreId);
  if(!page) return;
  if(!confirm(`Delete lore page "${page.title}"?`)) return;

  state.lore = state.lore.filter(x => x.id !== page.id);
  ui.selectedLoreId = state.lore[0]?.id || null;
  ui.editingLore = false;
  saveAll();
  renderLore();
}

/* ---------- Races ---------- */

function renderRaces(){
  renderTop();
  const filterText = $("#raceFilter").value.toLowerCase();
  const list = $("#raceList");
  list.innerHTML = "";

  const items = state.races
    .slice()
    .sort((a,b)=> (b.updatedAt||0) - (a.updatedAt||0))
    .filter(r => (r.name + " " + r.category + " " + r.vibe + " " + (r.traits||[]).join(",") + " " + r.body)
      .toLowerCase().includes(filterText));

  if(items.length === 0){
    list.innerHTML = `<div class="muted small">No races match.</div>`;
  }else{
    for(const r of items){
      const el = document.createElement("div");
      el.className = "listItem" + (r.id === ui.selectedRaceId ? " active" : "");
      el.innerHTML = `<div class="listTitle">${escapeHtml(r.name || "Unnamed")}</div>
                      <div class="listMeta">${escapeHtml(r.category || "—")} • ${timeAgo(r.updatedAt)}</div>`;
      el.onclick = () => {
        ui.selectedRaceId = r.id;
        ui.editingRace = false;
        renderRaces();
      };
      list.appendChild(el);
    }
  }

  const race = state.races.find(x => x.id === ui.selectedRaceId);
  if(!race){
    $("#raceEmpty").classList.remove("hidden");
    $("#raceView").classList.add("hidden");
    $("#raceEditor").classList.add("hidden");
    $("#raceCrumbs").textContent = "Races";
    return;
  }

  $("#raceCrumbs").textContent = `Races / ${race.name || "Unnamed"}`;

  if(ui.editingRace){
    showRaceEditor(race);
  }else{
    showRaceView(race);
  }
}

function showRaceView(r){
  $("#raceEmpty").classList.add("hidden");
  $("#raceView").classList.remove("hidden");
  $("#raceEditor").classList.add("hidden");

  $("#raceName").textContent = r.name || "Unnamed";
  $("#raceCategoryTag").textContent = r.category || "—";
  $("#raceUpdated").textContent = `Updated ${timeAgo(r.updatedAt)}`;
  $("#raceVibe").textContent = r.vibe || "—";
  $("#raceTraits").textContent = (r.traits || []).join(", ") || "—";
  $("#raceBody").innerHTML = renderMarkdown(r.body || "");
}

function showRaceEditor(r){
  $("#raceEmpty").classList.add("hidden");
  $("#raceView").classList.add("hidden");
  $("#raceEditor").classList.remove("hidden");

  $("#raceNameInput").value = r.name || "";
  $("#raceCategoryInput").value = r.category || "";
  $("#raceVibeInput").value = r.vibe || "";
  $("#raceTraitsInput").value = (r.traits || []).join(", ");
  $("#raceBodyInput").value = r.body || "";

  updateRacePreview();
}

function updateRacePreview(){
  $("#racePreview").innerHTML = renderMarkdown($("#raceBodyInput").value);
}

function newRace(seed={}){
  const r = {
    id: uid("race"),
    name: seed.name || "New Race",
    category: seed.category || "Unsorted",
    vibe: seed.vibe || "",
    traits: seed.traits || [],
    body: seed.body || "Describe this race here…\n",
    updatedAt: now()
  };
  state.races.unshift(r);
  ui.selectedRaceId = r.id;
  ui.editingRace = true;
  saveAll();
  setRecent("race", r.id, r.name);
  return r;
}

function saveRace(){
  const r = state.races.find(x => x.id === ui.selectedRaceId);
  if(!r) return;

  r.name = $("#raceNameInput").value.trim() || "Unnamed";
  r.category = $("#raceCategoryInput").value.trim() || "Unsorted";
  r.vibe = $("#raceVibeInput").value.trim();
  r.traits = $("#raceTraitsInput").value.split(",").map(s=>s.trim()).filter(Boolean);
  r.body = $("#raceBodyInput").value;
  r.updatedAt = now();

  ui.editingRace = false;
  saveAll();
  setRecent("race", r.id, r.name);
  renderRaces();
  renderCharacters(); // update race filters
}

function deleteRace(){
  const r = state.races.find(x => x.id === ui.selectedRaceId);
  if(!r) return;
  if(!confirm(`Delete race "${r.name}"?`)) return;

  state.races = state.races.filter(x => x.id !== r.id);
  ui.selectedRaceId = state.races[0]?.id || null;
  ui.editingRace = false;
  saveAll();
  renderRaces();
  renderCharacters();
}

/* ---------- Characters ---------- */

function renderCharacters(){
  renderTop();
  populateCharRaceFilter();

  const filterText = $("#charFilter").value.toLowerCase();
  const raceFilter = $("#charRaceFilter").value;

  const list = $("#charList");
  list.innerHTML = "";

  const items = state.characters
    .slice()
    .sort((a,b)=> (b.updatedAt||0) - (a.updatedAt||0))
    .filter(c => {
      const okText = (c.name + " " + c.race + " " + c.role + " " + c.origin + " " + (c.keywords||[]).join(",") + " " + c.bio)
        .toLowerCase().includes(filterText);
      const okRace = !raceFilter || safeText(c.race).toLowerCase() === raceFilter.toLowerCase();
      return okText && okRace;
    });

  if(items.length === 0){
    list.innerHTML = `<div class="muted small">No characters match.</div>`;
  }else{
    for(const c of items){
      const el = document.createElement("div");
      el.className = "listItem" + (c.id === ui.selectedCharId ? " active" : "");
      el.innerHTML = `<div class="listTitle">${escapeHtml(c.name || "Unnamed")}</div>
                      <div class="listMeta">${escapeHtml(c.race || "—")} • ${escapeHtml(c.role || "—")}</div>`;
      el.onclick = () => {
        ui.selectedCharId = c.id;
        ui.editingChar = false;
        renderCharacters();
      };
      list.appendChild(el);
    }
  }

  const c = state.characters.find(x => x.id === ui.selectedCharId);
  if(!c){
    $("#charEmpty").classList.remove("hidden");
    $("#charView").classList.add("hidden");
    $("#charEditor").classList.add("hidden");
    $("#charCrumbs").textContent = "Characters";
    return;
  }

  $("#charCrumbs").textContent = `Characters / ${c.name || "Unnamed"}`;

  if(ui.editingChar){
    showCharEditor(c);
  }else{
    showCharView(c);
  }
}

function populateCharRaceFilter(){
  const sel = $("#charRaceFilter");
  const cur = sel.value;
  const races = Array.from(new Set(state.characters.map(x=>x.race).filter(Boolean))).sort();
  const knownRaces = Array.from(new Set(state.races.map(x=>x.name).filter(Boolean))).sort();
  const all = Array.from(new Set([...knownRaces, ...races])).sort();

  sel.innerHTML = `<option value="">All races</option>` + all.map(r => `<option>${escapeHtml(r)}</option>`).join("");
  if(all.includes(cur)) sel.value = cur;
}

function showCharView(c){
  $("#charEmpty").classList.add("hidden");
  $("#charView").classList.remove("hidden");
  $("#charEditor").classList.add("hidden");

  $("#charAvatar").textContent = (c.name || " ").trim().slice(0,1).toUpperCase() || "✶";
  $("#charName").textContent = c.name || "Unnamed";
  $("#charRaceTag").textContent = c.race || "—";
  $("#charRoleTag").textContent = c.role || "—";
  $("#charUpdated").textContent = `Updated ${timeAgo(c.updatedAt)}`;

  $("#charAge").textContent = c.age || "—";
  $("#charOrigin").textContent = c.origin || "—";
  $("#charKeywords").textContent = (c.keywords || []).join(", ") || "—";
  $("#charBio").innerHTML = renderMarkdown(c.bio || "");

  const relWrap = $("#charRels");
  relWrap.innerHTML = "";
  const rels = c.relationships || [];
  if(rels.length === 0){
    relWrap.innerHTML = `<div class="muted small">No relationships yet.</div>`;
  }else{
    for(const r of rels){
      const div = document.createElement("div");
      div.className = "rel";
      div.innerHTML = `
        <div class="relTop">
          <div class="relName">${escapeHtml(r.name || "—")}</div>
          <div class="relType">${escapeHtml(r.type || "")}</div>
        </div>
        <div class="muted">${escapeHtml(r.note || "")}</div>
      `;
      relWrap.appendChild(div);
    }
  }
}

function showCharEditor(c){
  $("#charEmpty").classList.add("hidden");
  $("#charView").classList.add("hidden");
  $("#charEditor").classList.remove("hidden");

  $("#charNameInput").value = c.name || "";
  $("#charRaceInput").value = c.race || "";
  $("#charRoleInput").value = c.role || "";
  $("#charAgeInput").value = c.age || "";
  $("#charOriginInput").value = c.origin || "";
  $("#charKeywordsInput").value = (c.keywords || []).join(", ");
  $("#charBioInput").value = c.bio || "";

  const relLines = (c.relationships || []).map(r => `${r.name} — ${r.type} — ${r.note}`.trim());
  $("#charRelsInput").value = relLines.join("\n");

  updateCharPreview();
}

function updateCharPreview(){
  $("#charPreview").innerHTML = renderMarkdown($("#charBioInput").value);
}

function parseRelationships(text){
  const lines = safeText(text).split("\n").map(l=>l.trim()).filter(Boolean);
  const rels = [];
  for(const line of lines){
    const parts = line.split("—").map(s=>s.trim());
    const [name, type, note] = [parts[0]||"", parts[1]||"", parts.slice(2).join(" — ")||""];
    rels.push({ name, type, note });
  }
  return rels;
}

function newCharacter(seed={}){
  const c = {
    id: uid("char"),
    name: seed.name || "New Character",
    race: seed.race || "",
    role: seed.role || "",
    age: seed.age || "",
    origin: seed.origin || "",
    keywords: seed.keywords || [],
    bio: seed.bio || "Write their bio here…\n",
    relationships: seed.relationships || [],
    updatedAt: now()
  };
  state.characters.unshift(c);
  ui.selectedCharId = c.id;
  ui.editingChar = true;
  saveAll();
  setRecent("character", c.id, c.name);
  return c;
}

function saveCharacter(){
  const c = state.characters.find(x => x.id === ui.selectedCharId);
  if(!c) return;

  c.name = $("#charNameInput").value.trim() || "Unnamed";
  c.race = $("#charRaceInput").value.trim();
  c.role = $("#charRoleInput").value.trim();
  c.age = $("#charAgeInput").value.trim();
  c.origin = $("#charOriginInput").value.trim();
  c.keywords = $("#charKeywordsInput").value.split(",").map(s=>s.trim()).filter(Boolean);
  c.bio = $("#charBioInput").value;
  c.relationships = parseRelationships($("#charRelsInput").value);
  c.updatedAt = now();

  ui.editingChar = false;
  saveAll();
  setRecent("character", c.id, c.name);
  renderCharacters();
}

function deleteCharacter(){
  const c = state.characters.find(x => x.id === ui.selectedCharId);
  if(!c) return;
  if(!confirm(`Delete character "${c.name}"?`)) return;

  state.characters = state.characters.filter(x => x.id !== c.id);
  ui.selectedCharId = state.characters[0]?.id || null;
  ui.editingChar = false;
  saveAll();
  renderCharacters();
}

/* ---------- Search ---------- */

function renderSearch(){
  renderTop();
  $("#searchInput").value = $("#globalSearch").value || "";
  runSearch($("#searchInput").value);
}

function runSearch(q){
  const query = safeText(q).trim().toLowerCase();
  const out = $("#searchResults");
  out.innerHTML = "";

  if(!query){
    out.innerHTML = `<div class="muted">Type something to search.</div>`;
    return;
  }

  const results = [];

  for(const p of state.lore){
    if((p.title + " " + p.section + " " + p.body).toLowerCase().includes(query)){
      results.push({
        type: "Lore",
        title: p.title || "Untitled",
        id: p.id,
        snippet: snippetFrom(p.body, query)
      });
    }
  }

  for(const r of state.races){
    const hay = (r.name + " " + r.category + " " + r.vibe + " " + (r.traits||[]).join(",") + " " + r.body).toLowerCase();
    if(hay.includes(query)){
      results.push({
        type: "Race",
        title: r.name || "Unnamed",
        id: r.id,
        snippet: snippetFrom(r.body || r.vibe || "", query)
      });
    }
  }

  for(const c of state.characters){
    const hay = (c.name + " " + c.race + " " + c.role + " " + c.origin + " " + (c.keywords||[]).join(",") + " " + c.bio).toLowerCase();
    if(hay.includes(query)){
      results.push({
        type: "Character",
        title: c.name || "Unnamed",
        id: c.id,
        snippet: snippetFrom(c.bio || "", query)
      });
    }
  }

  if(results.length === 0){
    out.innerHTML = `<div class="muted">No results.</div>`;
    return;
  }

  for(const r of results.slice(0, 100)){
    const div = document.createElement("div");
    div.className = "result";
    div.innerHTML = `
      <div class="resultTitle">${escapeHtml(r.title)}</div>
      <div class="resultType">${escapeHtml(r.type)}</div>
      <div class="resultSnippet">${escapeHtml(r.snippet)}</div>
    `;
    div.onclick = () => {
      if(r.type === "Lore"){ ui.selectedLoreId = r.id; setView("lore"); }
      if(r.type === "Race"){ ui.selectedRaceId = r.id; setView("races"); }
      if(r.type === "Character"){ ui.selectedCharId = r.id; setView("characters"); }
    };
    out.appendChild(div);
  }
}

function snippetFrom(text, query){
  const t = safeText(text);
  const idx = t.toLowerCase().indexOf(query);
  if(idx === -1) return t.slice(0, 140) + (t.length > 140 ? "…" : "");
  const start = Math.max(0, idx - 50);
  const end = Math.min(t.length, idx + 90);
  const snip = (start > 0 ? "…" : "") + t.slice(start, end) + (end < t.length ? "…" : "");
  return snip.replace(/\s+/g, " ");
}

function timeAgo(ts){
  if(!ts) return "—";
  const s = Math.floor((now() - ts) / 1000);
  if(s < 10) return "just now";
  if(s < 60) return `${s}s ago`;
  const m = Math.floor(s/60);
  if(m < 60) return `${m}m ago`;
  const h = Math.floor(m/60);
  if(h < 48) return `${h}h ago`;
  const d = Math.floor(h/24);
  return `${d}d ago`;
}

/* ---------- Settings ---------- */

function renderSettings(){
  renderTop();
  $("#worldTitleInput").value = state.world.title || "";
  $("#worldTaglineInput").value = state.world.tagline || "";
}

function saveWorldSettings(){
  state.world.title = $("#worldTitleInput").value.trim() || "Your World";
  state.world.tagline = $("#worldTaglineInput").value.trim() || "";
  saveAll();
  renderTop();
  toast("World settings saved.");
}

/* ---------- Import / Export ---------- */

function exportJson(){
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${(state.world.title || "world").replace(/\s+/g,"_").toLowerCase()}_codex.json`;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
}

function importJsonFile(file){
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const data = JSON.parse(reader.result);
      state = data;
      normalizeState();
      stampAllIfZero();
      saveAll();
      toast("Imported.");
      // reset selections
      ui.selectedLoreId = state.lore[0]?.id || null;
      ui.selectedRaceId = state.races[0]?.id || null;
      ui.selectedCharId = state.characters[0]?.id || null;
      renderTop();
      setView("home");
    }catch(e){
      alert("Import failed: invalid JSON.");
    }
  };
  reader.readAsText(file);
}

/* ---------- Tiny toast ---------- */

let toastTimer = null;
function toast(msg){
  let el = $("#toast");
  if(!el){
    el = document.createElement("div");
    el.id = "toast";
    el.style.position = "fixed";
    el.style.left = "50%";
    el.style.bottom = "16px";
    el.style.transform = "translateX(-50%)";
    el.style.padding = "10px 12px";
    el.style.borderRadius = "14px";
    el.style.border = "1px solid rgba(255,255,255,.12)";
    el.style.background = "rgba(0,0,0,.55)";
    el.style.backdropFilter = "blur(10px)";
    el.style.color = "white";
    el.style.zIndex = "9999";
    el.style.boxShadow = "0 10px 30px rgba(0,0,0,.35)";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = "1";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>{ el.style.opacity = "0"; }, 1400);
}

/* ---------- Wire up events ---------- */

function bindEvents(){
  // nav
  $$(".navItem").forEach(b => b.addEventListener("click", ()=> setView(b.dataset.view)));

  // home buttons
  $("#goLore").onclick = () => setView("lore");
  $("#goCharacters").onclick = () => setView("characters");
  $("#btnClearRecent").onclick = clearRecent;

  // global search
  $("#globalSearch").addEventListener("input", (e)=>{
    if(ui.currentView === "search") runSearch(e.target.value);
  });

  // Ctrl / focus search
  window.addEventListener("keydown", (e)=>{
    if((e.ctrlKey || e.metaKey) && e.key === "/"){
      e.preventDefault();
      $("#globalSearch").focus();
    }
  });

  // Save, Import, Export
  $("#btnSaveAll").onclick = saveAll;
  $("#btnExport").onclick = exportJson;
  $("#btnImport").onclick = () => $("#filePicker").click();
  $("#filePicker").addEventListener("change", (e)=>{
    const f = e.target.files?.[0];
    if(f) importJsonFile(f);
    e.target.value = "";
  });

  // lore events
  $("#btnNewLore").onclick = () => { newLorePage(); renderLore(); };
  $("#loreFilter").addEventListener("input", renderLore);
  $("#loreSectionFilter").addEventListener("change", renderLore);
  $("#btnLoreEdit").onclick = () => { ui.editingLore = true; renderLore(); };
  $("#btnLoreCancel").onclick = () => { ui.editingLore = false; renderLore(); };
  $("#btnLoreSave").onclick = saveLore;
  $("#btnLoreDelete").onclick = deleteLore;
  $("#loreBodyInput").addEventListener("input", updateLorePreview);

  // races events
  $("#btnNewRace").onclick = () => { newRace(); renderRaces(); };
  $("#raceFilter").addEventListener("input", renderRaces);
  $("#btnRaceEdit").onclick = () => { ui.editingRace = true; renderRaces(); };
  $("#btnRaceCancel").onclick = () => { ui.editingRace = false; renderRaces(); };
  $("#btnRaceSave").onclick = saveRace;
  $("#btnRaceDelete").onclick = deleteRace;
  $("#raceBodyInput").addEventListener("input", updateRacePreview);

  // chars events
  $("#btnNewChar").onclick = () => { newCharacter(); renderCharacters(); };
  $("#charFilter").addEventListener("input", renderCharacters);
  $("#charRaceFilter").addEventListener("change", renderCharacters);
  $("#btnCharEdit").onclick = () => { ui.editingChar = true; renderCharacters(); };
  $("#btnCharCancel").onclick = () => { ui.editingChar = false; renderCharacters(); };
  $("#btnCharSave").onclick = saveCharacter;
  $("#btnCharDelete").onclick = deleteCharacter;
  $("#charBioInput").addEventListener("input", updateCharPreview);

  // search view
  $("#searchInput").addEventListener("input", (e)=> runSearch(e.target.value));

  // settings
  $("#btnSaveWorld").onclick = saveWorldSettings;
  $("#btnReset").onclick = async () => {
    if(!confirm("Reset to defaults from data/world.json? This will overwrite local edits.")) return;
    localStorage.removeItem(STORAGE_KEY);
    await loadInitial();
    toast("Reset complete.");
    ui.selectedLoreId = state.lore[0]?.id || null;
    ui.selectedRaceId = state.races[0]?.id || null;
    ui.selectedCharId = state.characters[0]?.id || null;
    setView("home");
  };
  $("#btnWipe").onclick = () => {
    if(!confirm("Wipe ALL local data? This cannot be undone (unless you exported).")) return;
    wipeLocal();
  };
}

/* ---------- Boot ---------- */

(async function main(){
  await loadInitial();

  // default selections
  ui.selectedLoreId = state.lore[0]?.id || null;
  ui.selectedRaceId = state.races[0]?.id || null;
  ui.selectedCharId = state.characters[0]?.id || null;

  bindEvents();
  renderTop();
  renderHome();

  // quick jumps
  $("#globalSearch").addEventListener("keydown",(e)=>{
    if(e.key === "Enter"){
      setView("search");
      $("#searchInput").focus();
      runSearch($("#globalSearch").value);
    }
  });

})();
