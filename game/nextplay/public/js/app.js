(function(){
"use strict";

const FEED_URL = "https://gamemonetize.com/feed.php?format=0&num=100";
const API = window.NEXPLAY_API_URL || "";
const AVATARS = ["👤","🎮","🕹️","🏆","⚡","🔥","💎","🦊","🐉","🤖","👾","🎯"];
const HEARTBEAT_MS = 30000;
const IDLE_MS = 60000;

// Embedded high-speed offline fallback games with high-res SVG gradient thumbs
const LOCAL_FALLBACKS = [
  {id:"fb1",title:"Stack Tower",category:"Arcade",url:"https://html5.gamemonetize.co/smyepcsrhk5x5kmcuel2wj7n3ftbjj2p/",thumb:"https://img.gamemonetize.com/smyepcsrhk5x5kmcuel2wj7n3ftbjj2p/512x384.jpg",instructions:"Stack blocks as high as possible."},
  {id:"fb2",title:"Drift Boss",category:"Racing",url:"https://html5.gamemonetize.co/bozgguzm2ejqv60gsm0t4kstwe80hclc/",thumb:"https://img.gamemonetize.com/bozgguzm2ejqv60gsm0t4kstwe80hclc/512x384.jpg",instructions:"Click and hold to drift right, release to drift left."},
  {id:"fb3",title:"Color Switch",category:"Puzzle",url:"https://html5.gamemonetize.co/vuj35pjyhr7b8cd85gk2f28p351exqwn/",thumb:"https://img.gamemonetize.com/vuj35pjyhr7b8cd85gk2f28p351exqwn/512x384.jpg",instructions:"Tap to bounce and match color obstacles."},
  {id:"fb4",title:"Tank Stars",category:"Shooting",url:"https://html5.gamemonetize.co/a83kwue6bv9b93djhxqvi8ku3jvhlql0/",thumb:"https://img.gamemonetize.com/a83kwue6bv9b93djhxqvi8ku3jvhlql0/512x384.jpg",instructions:"Aim weapon angle and fire with maximum power."},
  {id:"fb5",title:"Knife Hit",category:"Action",url:"https://html5.gamemonetize.co/xtpxzk9s2wxpnjly81wu273beu4tui7j/",thumb:"https://img.gamemonetize.com/xtpxzk9s2wxpnjly81wu273beu4tui7j/512x384.jpg",instructions:"Throw knives into rotating target without hitting other knives."}
];

let state = {
  token: null,
  user: null,
  currentView: "discover",
  allGames: [],
  filteredGames: [],
  displayCount: 24,
  currentCat: "all",
  searchQuery: "",
  sessionId: null,
  sessionCoins: 0,
  sessionStart: 0,
  heartbeatTimer: null,
  idleTimer: null,
  lastActivity: Date.now(),
  isIdle: false,
  ws: null,
  chartActivity: null,
  chartPool: null,
  expanded: false,
  isFetchingGames: false
};

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

function escapeHtml(str){
  if(str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function api(path, opts={}){
  const h = {"Content-Type":"application/json"};
  if(state.token) h["Authorization"] = "Bearer " + state.token;
  const r = await fetch(API + path, {...opts, headers:{...h,...(opts.headers||{})}});
  if(!r.ok){
    const e = await r.json().catch(()=>({}));
    throw new Error(e.detail || r.statusText);
  }
  return r.json();
}

function updateCoins(c){
  const safeCoins = typeof c === "number" ? c : 0;
  ["#sidebar-coins","#hud-coins"].forEach(s=>{
    const e = $(s);
    if(e) e.textContent = safeCoins.toLocaleString();
  });
}

function updateUserDisplay(){
  if(!state.user) return;
  const isGuest = !!state.user.is_guest;
  const av = (state.user.avatar && state.user.avatar !== "default") ? state.user.avatar + " " : "";
  const hudUser = $("#hud-user");
  if(hudUser) hudUser.textContent = av + state.user.username;
  const avDisplay = $("#avatar-display");
  if(avDisplay) avDisplay.textContent = state.user.avatar || "👤";

  const hudSignIn = $("#hud-signin-btn");
  const sideSignIn = $("#sidebar-signin-btn");
  const logoutBtn = $("#logout-btn");
  if(hudSignIn) hudSignIn.style.display = isGuest ? "inline-flex" : "none";
  if(sideSignIn) sideSignIn.style.display = isGuest ? "block" : "none";
  if(logoutBtn) logoutBtn.textContent = isGuest ? "⚡ Switch Account" : "↩ Logout";
}

function switchView(name){
  if(state.currentView === "theater" && name !== "theater"){
    endSession();
    const frame = $("#game-iframe");
    if(frame) frame.src = "";
  }
  $$(".view").forEach(v => v.classList.remove("active"));
  const el = $("#view-" + name);
  if(el) el.classList.add("active");
  $$(".nav-item,.mob-nav-item").forEach(b => {
    b.classList.toggle("active", b.dataset.view === name);
  });
  const titles = {
    discover: "Discover Games",
    analytics: "Live Analytics & Prize Pool",
    leaderboard: "Global Rankings",
    wallet: "Wallet & Vault",
    profile: "Profile & Settings",
    admin: "Admin Center",
    theater: "Now Playing"
  };
  $("#view-title").textContent = titles[name] || name;
  state.currentView = name;
  if(name === "analytics") loadAnalytics();
  if(name === "leaderboard") loadLeaderboard();
  if(name === "wallet") loadWallet();
  if(name === "profile") loadProfile();
}

// ── Auth Modal Logic ──
let authMode = "login";
function openAuthModal(tab){
  authMode = tab || "login";
  $$(".modal-tab").forEach(x => x.classList.toggle("active", x.dataset.tab === authMode));
  $("#auth-submit").textContent = authMode === "login" ? "Sign In" : "Create Account";
  $("#auth-error").textContent = "";
  $("#auth-modal").style.display = "flex";
}

function closeAuthModal(){
  $("#auth-modal").style.display = "none";
  $("#auth-error").textContent = "";
}

$$(".modal-tab").forEach(t => t.addEventListener("click", () => {
  authMode = t.dataset.tab;
  $$(".modal-tab").forEach(x => x.classList.remove("active"));
  t.classList.add("active");
  $("#auth-submit").textContent = authMode === "login" ? "Sign In" : "Create Account";
  $("#auth-error").textContent = "";
}));

const authModalClose = $("#auth-modal-close");
if(authModalClose) authModalClose.addEventListener("click", closeAuthModal);
const authModalOverlay = $("#auth-modal");
if(authModalOverlay) authModalOverlay.addEventListener("click", (e) => {
  if(e.target === authModalOverlay) closeAuthModal();
});

const hudSignIn = $("#hud-signin-btn");
if(hudSignIn) hudSignIn.addEventListener("click", () => openAuthModal("login"));
const sideSignIn = $("#sidebar-signin-btn");
if(sideSignIn) sideSignIn.addEventListener("click", () => openAuthModal("login"));

$("#auth-form").addEventListener("submit", async(e) => {
  e.preventDefault();
  const u = $("#auth-username").value.trim(), p = $("#auth-password").value;
  if(!u || !p) return;
  try{
    const d = await api("/api/auth/" + (authMode === "login" ? "login" : "register"), {
      method: "POST",
      body: JSON.stringify({username: u, password: p})
    });
    state.token = d.token;
    state.user = {
      id: d.user_id,
      username: d.username || u,
      coins: d.coins || 0,
      is_admin: d.is_admin || false,
      is_guest: false,
      avatar: d.avatar || "default",
      sound_enabled: d.sound_enabled !== false,
      low_spec_mode: d.low_spec_mode || false
    };
    localStorage.setItem("nx_token", d.token);
    localStorage.setItem("nx_user", JSON.stringify(state.user));
    closeAuthModal();
    enterApp();
  }catch(err){
    $("#auth-error").textContent = err.message;
  }
});

function enterApp(){
  $("#auth-modal").style.display = "none";
  $("#app").style.display = "flex";
  updateUserDisplay();
  updateCoins(state.user.coins);
  if(state.user.is_admin) $("#admin-nav").style.display = "";
  else $("#admin-nav").style.display = "none";
  if(state.user.low_spec_mode) document.body.classList.add("low-spec");
  else document.body.classList.remove("low-spec");
  loadGames();
  loadAdSenseConfig();
  initChat();
}

async function autoGuestLogin(){
  const randNum = Math.floor(1000 + Math.random() * 9000);
  const guestUser = "Guest_" + randNum;
  const guestPass = "gst_" + Math.random().toString(36).slice(2, 10);
  try{
    const d = await api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({username: guestUser, password: guestPass})
    });
    state.token = d.token;
    state.user = {
      id: d.user_id,
      username: d.username || guestUser,
      coins: 0,
      is_admin: false,
      is_guest: true,
      avatar: "👤",
      sound_enabled: true,
      low_spec_mode: false
    };
    localStorage.setItem("nx_token", d.token);
    localStorage.setItem("nx_user", JSON.stringify(state.user));
    enterApp();
  }catch(err){
    state.token = null;
    state.user = {
      id: 0,
      username: guestUser,
      coins: 0,
      is_admin: false,
      is_guest: true,
      avatar: "👤",
      sound_enabled: true,
      low_spec_mode: false
    };
    enterApp();
  }
}

// ── Direct Startup: Instant Home Page Open ──
(async function initSession(){
  const t = localStorage.getItem("nx_token");
  const u = localStorage.getItem("nx_user");
  if(t && u){
    try{
      state.token = t;
      state.user = JSON.parse(u);
      enterApp();
      return;
    }catch(e){
      localStorage.removeItem("nx_token");
      localStorage.removeItem("nx_user");
    }
  }
  await autoGuestLogin();
})();

// ── Logout ──
$("#logout-btn").addEventListener("click", async() => {
  endSession();
  localStorage.removeItem("nx_token");
  localStorage.removeItem("nx_user");
  state.token = null;
  state.user = null;
  if(state.ws){ try{state.ws.close();}catch(e){} }
  await autoGuestLogin();
});

// ── Navigation ──
$$(".nav-item,.mob-nav-item").forEach(b => b.addEventListener("click", () => {
  if(b.dataset.view) switchView(b.dataset.view);
  $("#sidebar").classList.remove("open");
}));
$("#sidebar-toggle").addEventListener("click", () => $("#sidebar").classList.toggle("open"));

// ── High-Performance Direct Fetch & Game Engine ──
async function loadGames(){
  if(state.allGames.length === 0){
    renderSkeletonLoader();
    try{
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(FEED_URL, { signal: controller.signal });
      clearTimeout(timeoutId);
      if(!res.ok) throw new Error("Direct feed status " + res.status);
      const raw = await res.json();
      state.allGames = Array.isArray(raw) && raw.length > 0 ? raw : LOCAL_FALLBACKS;
    }catch(e){
      // Graceful fallback to local backend or offline presets
      try{
        const bData = await api("/api/games?page=1");
        state.allGames = (bData.games && bData.games.length > 0) ? bData.games : LOCAL_FALLBACKS;
      }catch(err){
        state.allGames = LOCAL_FALLBACKS;
      }
    }
  }
  applyFiltersAndRender();
}

function renderSkeletonLoader(){
  const grid = $("#game-grid");
  if(!grid) return;
  grid.innerHTML = `
    <div class="skeleton-grid" id="skeleton-loader">
      <div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div>
      <div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div>
      <div class="skeleton-card"></div><div class="skeleton-card"></div>
    </div>`;
}

function applyFiltersAndRender(append=false){
  let list = state.allGames;
  if(state.currentCat !== "all"){
    const cat = state.currentCat.toLowerCase();
    list = list.filter(g => (g.category || "").toLowerCase().includes(cat));
  }
  if(state.searchQuery){
    const q = state.searchQuery.toLowerCase();
    list = list.filter(g =>
      (g.title || "").toLowerCase().includes(q) ||
      (g.description || "").toLowerCase().includes(q) ||
      (g.category || "").toLowerCase().includes(q)
    );
  }
  state.filteredGames = list;

  const grid = $("#game-grid");
  if(!grid) return;
  const skel = $("#skeleton-loader");
  if(skel) skel.remove();
  if(!append) grid.innerHTML = "";

  if(state.filteredGames.length === 0){
    grid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 48px; font-size: 0.95rem;">No games match your query. Try a different search!</p>`;
    $("#load-more").style.display = "none";
    return;
  }

  const slice = state.filteredGames.slice(0, state.displayCount);
  const fragment = document.createDocumentFragment();

  slice.forEach((g, i) => {
    const card = document.createElement("div");
    card.className = "game-card";
    const thumb = g.thumb || g.asset || g.image || "";
    const isHot = i < 3 && state.currentCat === "all" && !state.searchQuery;

    card.innerHTML = `
      <div class="game-thumb-wrap">
        <img class="game-card-thumb" src="${thumb}" alt="${escapeHtml(g.title||"")}" loading="lazy" decoding="async" onerror="this.style.opacity='0.5'">
        <div class="game-play-overlay">
          <span class="game-play-btn">▶ PLAY</span>
        </div>
        ${isHot ? '<span class="game-card-badge">HOT</span>' : ''}
      </div>
      <div class="game-card-body">
        <div class="game-card-title">${escapeHtml(g.title||"Untitled")}</div>
        <div class="game-card-cat">${escapeHtml(g.category||"Arcade")}</div>
      </div>`;

    card.addEventListener("click", () => openTheater(g));
    fragment.appendChild(card);
  });

  grid.appendChild(fragment);

  const loadMoreBtn = $("#load-more");
  if(loadMoreBtn){
    loadMoreBtn.style.display = state.displayCount < state.filteredGames.length ? "inline-flex" : "none";
  }
}

// ── Category & Search Handlers ──
$$(".cat-pill").forEach(p => p.addEventListener("click", () => {
  $$(".cat-pill").forEach(x => x.classList.remove("active"));
  p.classList.add("active");
  state.currentCat = p.dataset.cat;
  state.displayCount = 24;
  applyFiltersAndRender();
}));

let searchTimer;
const searchInput = $("#game-search");
if(searchInput){
  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.searchQuery = searchInput.value.trim();
      state.displayCount = 24;
      applyFiltersAndRender();
    }, 180);
  });
}

$("#load-more").addEventListener("click", () => {
  state.displayCount += 24;
  applyFiltersAndRender();
});

// ── Theater & Preview Fix ──
function openTheater(game){
  switchView("theater");
  let url = game.url || game.game_url || "";
  if(url.startsWith("http://")) url = url.replace("http://", "https://");

  const frame = $("#game-iframe");
  const popout = $("#theater-popout");
  const loader = $("#game-loader-overlay");

  if(loader) loader.style.opacity = "1";
  if(popout) popout.href = url;

  frame.src = url;
  $("#theater-title").textContent = game.title || "Game Preview";
  $("#game-instructions-text").textContent = game.instructions || game.description || "Use keyboard or mouse controls to play.";

  // Hide loader smoothly once iframe is ready
  frame.onload = () => {
    if(loader) loader.style.opacity = "0";
  };
  setTimeout(() => {
    if(loader) loader.style.opacity = "0";
  }, 4500);

  startSession(game.id || game.title || "arcade_game");
}

$("#theater-back").addEventListener("click", () => {
  endSession();
  const frame = $("#game-iframe");
  if(frame) frame.src = "";
  switchView("discover");
});

$("#theater-fullscreen").addEventListener("click", () => {
  const f = $("#game-iframe");
  if(!f) return;
  if(f.requestFullscreen) f.requestFullscreen();
  else if(f.webkitRequestFullscreen) f.webkitRequestFullscreen();
});

$("#theater-expand").addEventListener("click", () => {
  state.expanded = !state.expanded;
  $(".theater-hud").style.display = state.expanded ? "none" : "";
  $(".theater-miner-bar").style.display = state.expanded ? "none" : "";
});

let isMuted = false;
$("#theater-mute").addEventListener("click", () => {
  isMuted = !isMuted;
  $("#theater-mute").textContent = isMuted ? "🔇" : "🔊";
});

$("#theater-info").addEventListener("click", () => {
  const d = $("#game-instructions-drawer");
  d.style.display = d.style.display === "none" ? "block" : "none";
});

// ── Anti-Cheat Miner & Sessions ──
async function startSession(gameId){
  try{
    const d = await api(`/api/session/start?game_id=${encodeURIComponent(gameId)}`, {method:"POST"});
    state.sessionId = d.session_id;
    state.sessionCoins = 0;
    state.sessionStart = Date.now();
    state.lastActivity = Date.now();
    state.isIdle = false;
    $("#miner-hud").style.display = "flex";
    $("#idle-overlay").style.display = "none";
    startHeartbeat();
    startIdleDetection();
  }catch(e){
    // In local guest mode, maintain client-side mining timer
    state.sessionStart = Date.now();
    state.sessionCoins = 0;
    startHeartbeat();
    startIdleDetection();
  }
}

function startHeartbeat(){
  clearInterval(state.heartbeatTimer);
  state.heartbeatTimer = setInterval(async() => {
    if(state.isIdle) return;
    if(state.sessionId){
      try{
        const d = await api("/api/session/heartbeat", {
          method: "POST",
          body: JSON.stringify({session_id: state.sessionId})
        });
        if(d.status === "ok"){
          state.sessionCoins += d.coins_added;
          state.user.coins += d.coins_added;
          updateCoins(state.user.coins);
          $("#theater-session-coins").textContent = `+${state.sessionCoins} ⬡`;
          $("#miner-coins-rate").textContent = `+${d.coins_added}`;
        }
      }catch(e){}
    } else if(state.user){
      // Offline increment
      state.sessionCoins += 1;
      state.user.coins = (state.user.coins || 0) + 1;
      updateCoins(state.user.coins);
      $("#theater-session-coins").textContent = `+${state.sessionCoins} ⬡`;
    }
    const elapsed = Math.floor((Date.now() - state.sessionStart) / 1000);
    const m = Math.floor(elapsed / 60), s = elapsed % 60;
    $("#theater-session-time").textContent = `${m}:${String(s).padStart(2, "0")}`;
  }, HEARTBEAT_MS);
}

function startIdleDetection(){
  const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];
  const resetIdle = () => {
    state.lastActivity = Date.now();
    if(state.isIdle){
      state.isIdle = false;
      $("#idle-overlay").style.display = "none";
      startHeartbeat();
    }
  };
  events.forEach(e => document.addEventListener(e, resetIdle, {passive: true}));
  clearInterval(state.idleTimer);
  state.idleTimer = setInterval(() => {
    if(Date.now() - state.lastActivity > IDLE_MS && !state.isIdle){
      state.isIdle = true;
      clearInterval(state.heartbeatTimer);
      $("#idle-overlay").style.display = "flex";
    }
  }, 5000);
}

$("#resume-btn").addEventListener("click", () => {
  state.isIdle = false;
  state.lastActivity = Date.now();
  $("#idle-overlay").style.display = "none";
  startHeartbeat();
});

async function endSession(){
  if(!state.sessionId && !state.sessionStart) return;
  clearInterval(state.heartbeatTimer);
  clearInterval(state.idleTimer);
  if(state.sessionId){
    try{
      await api("/api/session/end", {method:"POST", body:JSON.stringify({session_id: state.sessionId})});
    }catch(e){}
    state.sessionId = null;
  }
  $("#miner-hud").style.display = "none";
  if(state.user) localStorage.setItem("nx_user", JSON.stringify(state.user));
}

// ── Analytics & High-Contrast Charts ──
async function loadAnalytics(){
  try{
    const d = await api("/api/analytics");
    $("#stat-users").textContent = (d.total_users || 0).toLocaleString();
    $("#stat-coins").textContent = (d.total_coins_mined || 0).toLocaleString();
    $("#stat-active").textContent = (d.active_gamers || 0);
    $("#stat-pool").textContent = "₹" + ((d.community_prize_pool || 0) / 100).toFixed(2);
    renderCharts(d);
  }catch(e){}
}

function renderCharts(d){
  const actCtx = $("#chart-activity");
  const poolCtx = $("#chart-pool");
  if(!actCtx || !poolCtx || typeof Chart === "undefined") return;
  if(state.chartActivity) state.chartActivity.destroy();
  if(state.chartPool) state.chartPool.destroy();

  const labels = ["12am", "4am", "8am", "12pm", "4pm", "8pm", "Now"];
  const gamers = (d.active_gamers || 1);
  const coinsMined = (d.total_coins_mined || 1200);

  const fakeActive = labels.map((_, i) => Math.max(1, gamers + Math.floor(Math.random() * 6 - 2)));
  const fakeCoins = labels.map((_, i) => Math.floor(coinsMined * (i + 1) / labels.length));

  state.chartActivity = new Chart(actCtx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Active Gamers",
          data: fakeActive,
          borderColor: "#00F0FF",
          backgroundColor: "rgba(0, 240, 255, 0.08)",
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointBackgroundColor: "#00F0FF"
        },
        {
          label: "Coins Mined",
          data: fakeCoins,
          borderColor: "#FF007A",
          backgroundColor: "rgba(255, 0, 122, 0.06)",
          fill: true,
          tension: 0.4,
          yAxisID: "y1",
          pointRadius: 4,
          pointBackgroundColor: "#FF007A"
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: "#A0AEC0", font: { family: "'Outfit', sans-serif", weight: "600" } } }
      },
      scales: {
        x: { ticks: { color: "#718096" }, grid: { color: "rgba(255, 255, 255, 0.04)" } },
        y: { ticks: { color: "#00F0FF" }, grid: { color: "rgba(255, 255, 255, 0.04)" } },
        y1: { position: "right", ticks: { color: "#FF007A" }, grid: { display: false } }
      }
    }
  });

  const reserve = d.platform_reserve || 900;
  const pool = d.community_prize_pool || 100;

  state.chartPool = new Chart(poolCtx, {
    type: "doughnut",
    data: {
      labels: ["Platform Vault (90%)", "Community Pool (10%)"],
      datasets: [{
        data: [reserve, pool],
        backgroundColor: ["#121526", "#00F0FF"],
        borderColor: ["#05050A", "#05050A"],
        borderWidth: 3
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: "#A0AEC0", font: { family: "'Outfit', sans-serif", weight: "600" } } }
      }
    }
  });
}

// ── Global Rankings & Top-3 Podium ──
async function loadLeaderboard(){
  try{
    const d = await api("/api/leaderboard");
    const list = d.leaderboard || [];

    // Render Top 3 Podium
    const podium = $("#leaderboard-podium");
    if(podium){
      podium.innerHTML = "";
      const top3 = list.slice(0, 3);
      const podiumMeta = [
        {rank: 1, label: "Cyber Apex Champion", icon: "👑", cls: "rank-1"},
        {rank: 2, label: "Gold Contender", icon: "🥈", cls: "rank-2"},
        {rank: 3, label: "Pink Vanguard", icon: "🥉", cls: "rank-3"}
      ];
      top3.forEach((p, idx) => {
        const meta = podiumMeta[idx];
        const card = document.createElement("div");
        card.className = `podium-card ${meta.cls}`;
        card.innerHTML = `
          <div class="podium-crown">${meta.icon}</div>
          <div class="podium-name">${escapeHtml(p.username)}</div>
          <div class="podium-coins">${(p.coins || 0).toLocaleString()} ⬡</div>
          <span class="podium-tier tier-cyber">${meta.label}</span>
          <span style="font-size:0.78rem; color:var(--text-muted); font-family:var(--font-mono);">Reward: ~₹${((p.coins||0)/1000).toFixed(2)}</span>`;
        podium.appendChild(card);
      });
    }

    // Render Full Table
    const body = $("#leaderboard-body");
    if(body){
      body.innerHTML = "";
      list.forEach(p => {
        const tierCls = p.tier === "Cyber Apex" ? "tier-cyber" : p.tier === "Gold" ? "tier-gold" : p.tier === "Silver" ? "tier-silver" : "tier-bronze";
        const row = document.createElement("div");
        row.className = "lb-row";
        row.innerHTML = `
          <span class="lb-rank">#${p.rank}</span>
          <span class="lb-name">${escapeHtml(p.username)}</span>
          <span class="lb-coins">${(p.coins || 0).toLocaleString()} ⬡</span>
          <span class="lb-hours">${p.hours || 0}h</span>
          <span class="lb-tier ${tierCls}">${p.tier}</span>
          <span class="lb-reward">~₹${((p.coins || 0)/100*0.1).toFixed(2)}</span>`;
        body.appendChild(row);
      });
    }
  }catch(e){}
}

// ── Wallet & Cyber Vault ──
async function loadWallet(){
  try{
    const d = await api("/api/wallet");
    state.user.coins = d.coins || 0;
    updateCoins(state.user.coins);

    $("#wallet-coins").textContent = (d.coins || 0).toLocaleString();
    $("#wallet-inr").textContent = `= ₹${(d.inr_value || 0).toFixed(2)}`;

    const ci = $("#converter-input");
    if(ci && !ci.value){
      ci.value = d.coins || 0;
      $("#converter-result").textContent = `= ₹${((d.coins || 0) / 100).toFixed(2)}`;
    }

    const minRedeem = d.min_redeem || 1000;
    const pct = Math.min(100, (d.coins || 0) / minRedeem * 100);
    $("#redeem-progress-fill").style.width = pct + "%";
    $("#redeem-status").textContent = `${d.coins || 0} / ${minRedeem} Coins (${pct.toFixed(0)}% to Payout)`;
    $("#payout-badge").textContent = d.payout_status || "Season 1 Coin Stacking Active";

    const logs = $("#wallet-logs");
    if(logs){
      logs.innerHTML = "";
      if(!d.logs || d.logs.length === 0){
        logs.innerHTML = `<p style="color:var(--text-muted); font-size:0.86rem; padding:14px;">No game sessions recorded yet. Play any game to earn points!</p>`;
      } else {
        d.logs.forEach(l => {
          const row = document.createElement("div");
          row.className = "log-row";
          const mins = Math.floor((l.playtime_seconds || 0) / 60);
          row.innerHTML = `
            <span class="log-game">${escapeHtml(l.game_title || l.game_id)}</span>
            <span class="log-coins">+${l.coins_earned} ⬡</span>
            <span class="log-time">${mins}m</span>
            <span class="log-date">${escapeHtml(l.created_at || "")}</span>`;
          logs.appendChild(row);
        });
      }
    }
  }catch(e){}
}

$("#converter-input").addEventListener("input", () => {
  const v = parseInt($("#converter-input").value) || 0;
  $("#converter-result").textContent = `= ₹${(v / 100).toFixed(2)}`;
});

// ── Profile ──
async function loadProfile(){
  try{
    const d = await api("/api/profile");
    state.user = {...state.user, ...d};
    $("#profile-username").value = d.username || "";
    $("#profile-sound").checked = d.sound_enabled !== false;
    $("#profile-lowspec").checked = !!d.low_spec_mode;

    const cur = $("#avatar-display");
    const av = AVATARS.find(a => a === d.avatar) || "👤";
    if(cur) cur.textContent = av;

    const opts = $("#avatar-options");
    if(opts){
      opts.innerHTML = "";
      AVATARS.forEach(a => {
        const el = document.createElement("div");
        el.className = "avatar-opt" + (a === d.avatar ? " active" : "");
        el.textContent = a;
        el.addEventListener("click", () => {
          $$(".avatar-opt").forEach(x => x.classList.remove("active"));
          el.classList.add("active");
          if(cur) cur.textContent = a;
        });
        opts.appendChild(el);
      });
    }
  }catch(e){}
}

$("#save-profile").addEventListener("click", async() => {
  const btn = $("#save-profile");
  const orig = btn.textContent;
  const sel = document.querySelector(".avatar-opt.active");
  const body = {
    username: $("#profile-username").value.trim(),
    avatar: sel ? sel.textContent : undefined,
    sound_enabled: $("#profile-sound").checked,
    low_spec_mode: $("#profile-lowspec").checked
  };
  try{
    await api("/api/profile", {method:"PUT", body:JSON.stringify(body)});
    state.user = {...state.user, ...body};
    localStorage.setItem("nx_user", JSON.stringify(state.user));
    if(body.low_spec_mode) document.body.classList.add("low-spec");
    else document.body.classList.remove("low-spec");
    updateUserDisplay();
    btn.textContent = "Saved ✓";
    setTimeout(() => btn.textContent = orig, 2000);
  }catch(e){
    alert(e.message);
  }
});

// ── Admin Panel ──
let adminUnlocked = false;
$("#admin-login-btn").addEventListener("click", async() => {
  try{
    await api(`/api/admin/login?password=${encodeURIComponent($("#admin-pw").value)}`, {method:"POST"});
    adminUnlocked = true;
    $("#admin-login-gate").style.display = "none";
    $("#admin-panel").style.display = "flex";
    loadAdminPanel();
  }catch(e){
    alert(e.message);
  }
});

async function loadAdminPanel(){
  try{
    const d = await api("/api/admin/settings");
    $("#admin-adstxt").value = d.settings.ads_txt || "";
    $("#admin-adsense-enabled").checked = d.settings.adsense_enabled === "true";
    $("#admin-adsense-header").value = d.settings.adsense_header || "";
    $("#admin-adsense-sidebar").value = d.settings.adsense_sidebar || "";
    $("#admin-adsense-below").value = d.settings.adsense_below_player || "";
    $("#admin-coin-rate").textContent = d.coin_per_minute;

    const list = $("#admin-users-list");
    if(list){
      list.innerHTML = "";
      d.users.forEach(u => {
        const row = document.createElement("div");
        row.className = "admin-user-row";
        const isAdmin = !!u.is_admin;
        row.innerHTML = `
          <span>${u.id}</span>
          <span>${escapeHtml(u.username)}</span>
          <span>${(u.coins||0).toLocaleString()} ⬡</span>
          <span>${Math.floor((u.total_playtime||0)/60)}m</span>
          <span>${isAdmin ? '<span class="admin-badge">Admin</span>' : `<button class="btn-primary promote-btn" data-uid="${u.id}">Make Admin</button>`}</span>`;
        list.appendChild(row);
      });
      list.querySelectorAll(".promote-btn").forEach(btn => {
        btn.addEventListener("click", async() => {
          const uid = btn.dataset.uid;
          const pw = $("#admin-pw").value;
          try{
            await api(`/api/admin/promote?user_id=${uid}&password=${encodeURIComponent(pw)}`, {method:"POST"});
            alert("User promoted to Admin!");
            loadAdminPanel();
          }catch(err){ alert(err.message); }
        });
      });
    }
  }catch(e){}
}

$("#save-adstxt").addEventListener("click", async() => {
  const btn = $("#save-adstxt");
  const orig = btn.textContent;
  try{
    await api("/api/admin/settings", {method:"PUT", body:JSON.stringify({key:"ads_txt", value:$("#admin-adstxt").value})});
    btn.textContent = "Saved ✓";
    setTimeout(() => btn.textContent = orig, 2000);
  }catch(e){ alert(e.message); }
});

$("#save-adsense").addEventListener("click", async() => {
  const btn = $("#save-adsense");
  const orig = btn.textContent;
  try{
    const pairs = [
      ["adsense_enabled", $("#admin-adsense-enabled").checked ? "true" : "false"],
      ["adsense_header", $("#admin-adsense-header").value],
      ["adsense_sidebar", $("#admin-adsense-sidebar").value],
      ["adsense_below_player", $("#admin-adsense-below").value]
    ];
    for(const [k, v] of pairs){
      await api("/api/admin/settings", {method:"PUT", body:JSON.stringify({key:k, value:v})});
    }
    loadAdSenseConfig();
    btn.textContent = "Saved ✓";
    setTimeout(() => btn.textContent = orig, 2000);
  }catch(e){ alert(e.message); }
});

// ── AdSense Config ──
async function loadAdSenseConfig(){
  try{
    const d = await api("/api/adsense-config");
    const h = $("#adsense-header-slot");
    const s = $("#adsense-sidebar-slot");
    const b = $("#adsense-below-player-slot");
    if(d.enabled){
      if(h){
        h.style.display = d.header_slot ? "block" : "none";
        if(d.header_slot) h.innerHTML = `<div class="ad-placeholder">📢 Header Ad: ${escapeHtml(d.header_slot)}</div>`;
      }
      if(s){
        s.style.display = d.sidebar_slot ? "block" : "none";
        if(d.sidebar_slot) s.innerHTML = `<div class="ad-placeholder">📢 Sidebar Ad: ${escapeHtml(d.sidebar_slot)}</div>`;
      }
      if(b){
        b.style.display = d.below_player_slot ? "block" : "none";
        if(d.below_player_slot) b.innerHTML = `<div class="ad-placeholder">📢 Below Player Ad: ${escapeHtml(d.below_player_slot)}</div>`;
      }
    } else {
      if(h) h.style.display = "none";
      if(s) s.style.display = "none";
      if(b) b.style.display = "none";
    }
  }catch(e){}
}

// ── Live WebSocket & Fallback Chat ──
function initChat(){
  if(!location.host){
    pollChat();
    return;
  }
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  try{
    state.ws = new WebSocket(`${proto}//${location.host}/ws/chat`);
    state.ws.onopen = () => state.ws.send(JSON.stringify({token: state.token}));
    state.ws.onmessage = (e) => {
      try{
        const d = JSON.parse(e.data);
        if(d.type === "history") d.messages.forEach(m => appendChat(m));
        else if(d.type === "message") appendChat(d);
        else if(d.type === "error") appendChat({username: "System", message: d.message, tier: ""});
      }catch(err){}
    };
    state.ws.onerror = () => pollChat();
    state.ws.onclose = () => setTimeout(() => pollChat(), 2500);
  }catch(e){
    pollChat();
  }
}

function appendChat(msg){
  const box = $("#chat-messages");
  if(!box) return;
  const el = document.createElement("div");
  el.className = "chat-msg";
  el.innerHTML = `
    <span class="chat-msg-user">${escapeHtml(msg.username||"")}<span class="chat-msg-tier">${escapeHtml(msg.tier||"")}</span></span>
    <div class="chat-msg-text">${escapeHtml(msg.message||"")}</div>
    <div class="chat-msg-time">${msg.created_at ? new Date(msg.created_at).toLocaleTimeString() : ""}</div>`;
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
}

async function pollChat(){
  try{
    const d = await api("/api/chat/messages");
    const box = $("#chat-messages");
    if(box){
      box.innerHTML = "";
      d.messages.forEach(m => appendChat(m));
    }
  }catch(e){}
}

function sendChat(){
  const input = $("#chat-input");
  const msg = input.value.trim();
  if(!msg) return;
  if(state.ws && state.ws.readyState === WebSocket.OPEN){
    state.ws.send(JSON.stringify({message: msg}));
  } else {
    api("/api/chat/send", {method:"POST", body:JSON.stringify({message: msg})})
      .then(() => pollChat())
      .catch(() => {});
  }
  input.value = "";
}

$("#chat-send").addEventListener("click", sendChat);
$("#chat-input").addEventListener("keydown", (e) => { if(e.key === "Enter") sendChat(); });
$("#chat-toggle").addEventListener("click", () => $("#chat-drawer").classList.toggle("open"));
$("#chat-close").addEventListener("click", () => $("#chat-drawer").classList.remove("open"));

})();
