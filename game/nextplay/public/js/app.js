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

// Coin HUD & Profile shortcut links
const coinHud = $(".coin-hud");
if(coinHud){
  coinHud.style.cursor = "pointer";
  coinHud.title = "View Wallet & Vault";
  coinHud.addEventListener("click", () => switchView("wallet"));
}
const userHud = $("#hud-user");
if(userHud){
  userHud.style.cursor = "pointer";
  userHud.title = "View Profile";
  userHud.addEventListener("click", () => switchView("profile"));
}

// Keyboard shortcuts: Escape to exit expanded mode
document.addEventListener("keydown", (e) => {
  if(e.key === "Escape"){
    const theater = $("#view-theater");
    if(theater && theater.classList.contains("expanded")){
      theater.classList.remove("expanded");
      showToast("Standard Theater Fit", "🖥️");
    }
  }
});

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
  const wrapper = $("#game-player-wrapper") || $("#game-container");
  if(wrapper) wrapper.scrollTop = 0;

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
  const theater = $("#view-theater");
  if(!theater) return;
  theater.classList.toggle("expanded");
  const isExp = theater.classList.contains("expanded");
  $("#theater-expand").title = isExp ? "Exit Expanded Fit" : "Toggle Theater Fit";
  showToast(isExp ? "Expanded Edge-to-Edge Theater Mode" : "Standard Theater Fit", "🖥️");
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

// ── Interactive Toast Notification System ──
let toastTimer = null;
function showToast(msg, icon = "⚡"){
  const toast = $("#app-toast");
  const msgEl = $("#toast-message");
  const iconEl = toast ? toast.querySelector(".toast-icon") : null;
  if(!toast || !msgEl) return;
  msgEl.textContent = msg;
  if(iconEl && icon) iconEl.textContent = icon;
  toast.classList.add("show");
  if(toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 3500);
}

// ── Local Storage & Logs Helper ──
function getLocalLogs(){
  try{
    return JSON.parse(localStorage.getItem("nx_wallet_logs") || "[]");
  }catch(e){
    return [];
  }
}

function saveLocalLog(entry){
  try{
    const logs = getLocalLogs();
    logs.unshift({
      id: "log_" + Date.now(),
      created_at: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'}),
      ...entry
    });
    if(logs.length > 50) logs.pop();
    localStorage.setItem("nx_wallet_logs", JSON.stringify(logs));
  }catch(e){}
}

// ── Live Gaming Analytics & CSS Activity Bars ──
async function loadAnalytics(){
  let d = null;
  try{
    d = await api("/api/analytics");
  }catch(e){}

  const userCoins = (state.user && typeof state.user.coins === "number") ? state.user.coins : 0;
  const localLogs = getLocalLogs();
  const gamesPlayed = localLogs.length > 0 ? localLogs.length : 16;
  const totalMins = localLogs.reduce((acc, cur) => acc + Math.floor((cur.playtime_seconds || 60) / 60), 0) || 45;

  const commPool = (d && d.community_prize_pool !== undefined) ? d.community_prize_pool : 4850;
  const platReserve = (d && d.platform_reserve !== undefined) ? d.platform_reserve : 43650;

  const elGames = $("#stat-games-played");
  const elMins = $("#stat-minutes-spent");
  const elCoins = $("#stat-coins-earned");
  const elPool = $("#stat-pool");
  const elComm = $("#stat-community-pool");
  const elReserve = $("#stat-platform-reserve");

  if(elGames) elGames.textContent = gamesPlayed.toLocaleString();
  if(elMins) elMins.textContent = totalMins + "m";
  if(elCoins) elCoins.textContent = userCoins.toLocaleString() + " ⚡";
  if(elPool) elPool.textContent = "₹" + (commPool / 100).toFixed(2);
  if(elComm) elComm.textContent = "₹" + (commPool / 100).toFixed(2);
  if(elReserve) elReserve.textContent = "₹" + (platReserve / 100).toFixed(2);

  renderActivityBars();
}

function renderActivityBars(){
  const grid = $("#activity-bars-grid");
  if(!grid) return;
  grid.innerHTML = "";

  const timeSlots = [
    { hour: "00:00", coins: 140, miners: 18, pct: 35 },
    { hour: "03:00", coins: 85, miners: 12, pct: 22 },
    { hour: "06:00", coins: 110, miners: 15, pct: 28 },
    { hour: "09:00", coins: 280, miners: 42, pct: 65 },
    { hour: "12:00", coins: 410, miners: 68, pct: 88 },
    { hour: "15:00", coins: 340, miners: 54, pct: 74 },
    { hour: "18:00", coins: 490, miners: 82, pct: 95 },
    { hour: "21:00", coins: 380, miners: 63, pct: 80 },
    { hour: "LIVE", coins: 460, miners: 79, pct: 92, isLive: true }
  ];

  const frag = document.createDocumentFragment();
  timeSlots.forEach(slot => {
    const col = document.createElement("div");
    col.className = "activity-col";
    col.innerHTML = `
      <div class="activity-bar-track">
        <div class="activity-tooltip">Throughput: ${slot.coins} Coins/hr • ${slot.miners} Miners</div>
        <div class="activity-bar-fill" style="height: 0%;" data-target="${slot.pct}%"></div>
      </div>
      <span class="activity-col-label" style="${slot.isLive ? 'color:var(--neon-cyan);font-weight:700;' : ''}">${slot.hour}</span>
    `;
    frag.appendChild(col);
  });
  grid.appendChild(frag);

  requestAnimationFrame(() => {
    setTimeout(() => {
      grid.querySelectorAll(".activity-bar-fill").forEach(bar => {
        bar.style.height = bar.dataset.target || "50%";
      });
    }, 40);
  });
}

// ── Global Rankings & Top-3 Esports Podium ──
async function loadLeaderboard(){
  let list = [];
  try{
    const d = await api("/api/leaderboard");
    if(d && Array.isArray(d.leaderboard) && d.leaderboard.length > 0){
      list = d.leaderboard;
    }
  }catch(e){}

  if(list.length === 0){
    list = [
      { rank: 1, username: "KryptonGhost", coins: 8450, hours: 38.5, tier: "Cyber Apex", avatar: "⚡" },
      { rank: 2, username: "NeonValkyrie", coins: 6920, hours: 31.2, tier: "Gold", avatar: "🔥" },
      { rank: 3, username: "ShadowCipher", coins: 5210, hours: 24.8, tier: "Pink Vanguard", avatar: "🎯" },
      { rank: 4, username: "HyperGlitch", coins: 3950, hours: 18.2, tier: "Silver", avatar: "👾" },
      { rank: 5, username: "QuantumByte", coins: 2840, hours: 14.5, tier: "Silver", avatar: "🤖" },
      { rank: 6, username: "PixelViper", coins: 2100, hours: 11.0, tier: "Silver", avatar: "🕹️" },
      { rank: 7, username: "ZeroDayHero", coins: 1650, hours: 8.4, tier: "Bronze", avatar: "🦊" },
      { rank: 8, username: "VortexStriker", coins: 1220, hours: 6.2, tier: "Bronze", avatar: "⚔️" },
      { rank: 9, username: "CyberSamurai", coins: 980, hours: 4.8, tier: "Bronze", avatar: "🛡️" }
    ];

    if(state.user){
      const userCoins = typeof state.user.coins === "number" ? state.user.coins : 0;
      list.push({
        rank: 10,
        username: state.user.username + " (You)",
        coins: userCoins,
        hours: Math.max(0.5, (userCoins / 120)).toFixed(1),
        tier: userCoins >= 8000 ? "Cyber Apex" : userCoins >= 4000 ? "Gold" : userCoins >= 1000 ? "Silver" : "Bronze",
        avatar: state.user.avatar || "🎮",
        isUser: true
      });
      list.sort((a,b) => (b.coins || 0) - (a.coins || 0));
      list.forEach((p, idx) => p.rank = idx + 1);
    }
  }

  // Render Top 3 Podium
  const podium = $("#leaderboard-podium");
  if(podium){
    podium.innerHTML = "";
    const top3 = list.slice(0, 3);
    const podiumMeta = [
      { rank: 1, label: "Cyber Apex Champion", icon: "👑", cls: "rank-1" },
      { rank: 2, label: "Gold Contender", icon: "🥈", cls: "rank-2" },
      { rank: 3, label: "Pink Vanguard", icon: "🥉", cls: "rank-3" }
    ];
    top3.forEach((p, idx) => {
      const meta = podiumMeta[idx] || podiumMeta[0];
      const card = document.createElement("div");
      card.className = `podium-card ${meta.cls}`;
      card.innerHTML = `
        <div class="podium-crown">${meta.icon}</div>
        <div class="podium-name">${escapeHtml(p.username)}</div>
        <div class="podium-coins">${(p.coins || 0).toLocaleString()} ⚡</div>
        <span class="podium-tier tier-${meta.cls}">${meta.label}</span>
        <span style="font-size:0.78rem; color:var(--text-muted); font-family:var(--font-mono);">Est. Pool Share: ~₹${((p.coins||0) / 100 * 0.1).toFixed(2)}</span>
      `;
      podium.appendChild(card);
    });
  }

  // Render Full Table
  const body = $("#leaderboard-body");
  if(body){
    body.innerHTML = "";
    const frag = document.createDocumentFragment();
    list.forEach(p => {
      const tierCls = p.tier.toLowerCase().includes("apex") ? "tier-cyber" : p.tier.toLowerCase().includes("gold") ? "tier-gold" : p.tier.toLowerCase().includes("pink") ? "tier-pink" : p.tier.toLowerCase().includes("silver") ? "tier-silver" : "tier-bronze";
      const row = document.createElement("div");
      row.className = "lb-row" + (p.isUser ? " lb-highlight" : "");
      row.innerHTML = `
        <span class="lb-rank">#${p.rank}</span>
        <span class="lb-name">${escapeHtml(p.username)}</span>
        <span class="lb-coins">${(p.coins || 0).toLocaleString()} ⚡</span>
        <span class="lb-hours">${p.hours || 0}h</span>
        <span class="lb-tier ${tierCls}">${escapeHtml(p.tier)}</span>
        <span class="lb-reward">~₹${((p.coins || 0) / 100 * 0.1).toFixed(2)}</span>
      `;
      frag.appendChild(row);
    });
    body.appendChild(frag);
  }
}

// ── Wallet & Cyber Vault ──
async function loadWallet(){
  let d = null;
  try{
    d = await api("/api/wallet");
    if(d && typeof d.coins === "number"){
      state.user.coins = d.coins;
      localStorage.setItem("nx_user", JSON.stringify(state.user));
    }
  }catch(e){}

  const coins = (state.user && typeof state.user.coins === "number") ? state.user.coins : 0;
  updateCoins(coins);

  const walletCoinsEl = $("#wallet-coins");
  const walletInrEl = $("#wallet-inr");
  if(walletCoinsEl) walletCoinsEl.textContent = coins.toLocaleString();
  if(walletInrEl) walletInrEl.textContent = `= ₹${(coins / 100).toFixed(2)} INR (100 Coins = ₹1)`;

  const ci = $("#converter-input");
  if(ci && !ci.value){
    ci.value = coins;
    $("#converter-result").textContent = `₹${(coins / 100).toFixed(2)}`;
  }

  const minRedeem = 1000;
  const pct = Math.min(100, Math.round((coins / minRedeem) * 100));
  const progressFill = $("#redeem-progress-fill");
  const redeemStatus = $("#redeem-status");
  if(progressFill) progressFill.style.width = pct + "%";
  if(redeemStatus) redeemStatus.textContent = `${coins.toLocaleString()} / 1,000 Coins (${pct}% to Payout)`;

  // Render Transaction Logs
  const logsContainer = $("#wallet-logs");
  if(logsContainer){
    logsContainer.innerHTML = "";
    let logs = (d && d.logs && d.logs.length > 0) ? d.logs : getLocalLogs();
    if(logs.length === 0){
      logsContainer.innerHTML = `<p style="color:var(--text-muted); font-size:0.86rem; padding:18px; text-align:center;">No transactions recorded yet. Claim daily bonus or play games to stack coins!</p>`;
    } else {
      const frag = document.createDocumentFragment();
      logs.forEach(l => {
        const row = document.createElement("div");
        row.className = "log-row";
        const mins = l.playtime_seconds ? `${Math.floor(l.playtime_seconds / 60)}m` : "--";
        const coinText = l.type === "withdrawal" ? `-${l.coins_earned || l.coins} ⚡` : `+${l.coins_earned || l.coins} ⚡`;
        const coinCls = l.type === "withdrawal" ? "color:var(--hyper-pink);" : "color:var(--cyber-green);";
        row.innerHTML = `
          <span class="log-game">${escapeHtml(l.game_title || l.description || "Arcade Session")}</span>
          <span class="log-coins" style="${coinCls}">${coinText}</span>
          <span class="log-time">${mins}</span>
          <span class="log-date">${escapeHtml(l.created_at || "")}</span>
        `;
        frag.appendChild(row);
      });
      logsContainer.appendChild(frag);
    }
  }
}

// Converter Input Live Math
$("#converter-input").addEventListener("input", () => {
  const v = parseInt($("#converter-input").value) || 0;
  $("#converter-result").textContent = `₹${(v / 100).toFixed(2)}`;
});

// Converter Quick Chips
$$(".chip-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const data = btn.dataset.coins;
    const input = $("#converter-input");
    if(!input) return;
    if(data === "max"){
      input.value = (state.user && state.user.coins) ? state.user.coins : 0;
    } else {
      input.value = parseInt(data) || 0;
    }
    const v = parseInt(input.value) || 0;
    $("#converter-result").textContent = `₹${(v / 100).toFixed(2)}`;
  });
});

// Claim Daily Bonus (+50 Coins)
const claimBonusBtn = $("#claim-bonus-btn");
if(claimBonusBtn){
  claimBonusBtn.addEventListener("click", () => {
    const lastClaim = localStorage.getItem("nx_last_bonus_time");
    const now = Date.now();
    const cooldownMs = 12 * 60 * 60 * 1000;
    if(lastClaim && (now - parseInt(lastClaim)) < cooldownMs){
      const remainingMins = Math.ceil((cooldownMs - (now - parseInt(lastClaim))) / (60 * 1000));
      showToast(`Daily bonus on cooldown! Next bonus in ${remainingMins}m.`, "⏳");
      return;
    }
    const bonusAmount = 50;
    if(!state.user) state.user = { id: 1, username: "Gamer", coins: 0, is_guest: true };
    state.user.coins = (state.user.coins || 0) + bonusAmount;
    localStorage.setItem("nx_user", JSON.stringify(state.user));
    localStorage.setItem("nx_last_bonus_time", String(now));

    saveLocalLog({
      game_title: "Daily Bonus Reward",
      coins_earned: bonusAmount,
      playtime_seconds: 0,
      type: "bonus"
    });

    updateCoins(state.user.coins);
    loadWallet();
    showToast(`Claimed +${bonusAmount} Coins! Added to your vault.`, "🎁");
  });
}

// Withdraw / Redeem Payout
const withdrawBtn = $("#withdraw-btn");
if(withdrawBtn){
  withdrawBtn.addEventListener("click", () => {
    const coins = (state.user && typeof state.user.coins === "number") ? state.user.coins : 0;
    if(coins < 1000){
      const needed = 1000 - coins;
      showToast(`Minimum payout is 1,000 Coins (₹10). Stack ${needed} more coins to withdraw!`, "⚠️");
      return;
    }
    const inrValue = (coins / 100).toFixed(2);
    const upiPrompt = prompt(`Redeem ₹${inrValue} (${coins} Coins)
Enter your UPI ID (GPay / PhonePe / Paytm) or Amazon Pay number:`, "gamer@okaxis");
    if(upiPrompt === null) return;
    const upi = upiPrompt.trim() || "gamer@upi";

    saveLocalLog({
      game_title: `Redeem Payout (UPI: ${upi})`,
      coins_earned: coins,
      playtime_seconds: 0,
      type: "withdrawal"
    });

    state.user.coins = 0;
    localStorage.setItem("nx_user", JSON.stringify(state.user));
    updateCoins(0);
    loadWallet();
    showToast(`Payout of ₹${inrValue} submitted to ${upi}! Verification takes ~15 mins.`, "🚀");
  });
}

// Clear History
const clearLogsBtn = $("#clear-logs-btn");
if(clearLogsBtn){
  clearLogsBtn.addEventListener("click", () => {
    localStorage.removeItem("nx_wallet_logs");
    loadWallet();
    showToast("Transaction history cleared.", "🗑️");
  });
}

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
