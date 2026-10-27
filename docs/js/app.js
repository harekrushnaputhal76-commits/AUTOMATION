/**
 * NexPlay Arcade — Serverless Static Gaming Portal
 * Integrated with Google Firebase (Auth & Firestore) and GameMonetize API
 * 100% Serverless & GitHub Pages / Capacitor Android Ready
 */

(function(){
  "use strict";

  // ── Firebase Configuration & Initialization ──
  const firebaseConfig = {
    apiKey: "AIzaSyAOtQhO6frKmBHp389AB7-EU1HLMWT3IDY",
    authDomain: "nextgame-b0ff3.firebaseapp.com",
    projectId: "nextgame-b0ff3",
    storageBucket: "nextgame-b0ff3.firebasestorage.app",
    messagingSenderId: "653354001953",
    appId: "1:653354001953:web:7c6b0a2dae2e3b06512560",
    measurementId: "G-HTDYPKW9KW"
  };

  let fbApp = null;
  let auth = null;
  let db = null;
  let analytics = null;

  try {
    if (typeof firebase !== "undefined") {
      fbApp = firebase.initializeApp(firebaseConfig);
      auth = firebase.auth();
      db = firebase.firestore();
      try { analytics = firebase.analytics(); } catch(e){}
    }
  } catch(err) {
    console.warn("Firebase Init Notice:", err);
  }

  // ── Portal Constants ──
  const FEED_URL = "https://gamemonetize.com/feed.php?format=0&num=500";
  const COINS_PER_INR = 1000; // Fixed Conversion: 1,000 Coins = ₹1.00 INR
  const MINING_INTERVAL_MS = 30000; // Check and reward active play every 30s
  const COINS_PER_30S = 5; // +5 Coins per 30 seconds (+10 Coins/min)
  const IDLE_TIMEOUT_MS = 60000; // Pause session after 60s of inactivity

  const AVATARS = ["⚡", "🔥", "🎯", "👾", "🤖", "🕹️", "🦊", "⚔️", "🛡️", "🚀", "👑", "💎"];

  // Embedded High-Speed Offline Fallback Games
  const FALLBACK_GAMES = [
    {id:"fb1",title:"Stack Tower",category:"Arcade",url:"https://html5.gamemonetize.co/smyepcsrhk5x5kmcuel2wj7n3ftbjj2p/",thumb:"https://img.gamemonetize.com/smyepcsrhk5x5kmcuel2wj7n3ftbjj2p/512x384.jpg",description:"Stack blocks with perfect timing to build the tallest cyber skyscraper."},
    {id:"fb2",title:"Drift Boss",category:"Racing",url:"https://html5.gamemonetize.co/bozgguzm2ejqv60gsm0t4kstwe80hclc/",thumb:"https://img.gamemonetize.com/bozgguzm2ejqv60gsm0t4kstwe80hclc/512x384.jpg",description:"Master the tight corners. Click or hold to drift right, release to steer left."},
    {id:"fb3",title:"Color Switch",category:"Puzzle",url:"https://html5.gamemonetize.co/vuj35pjyhr7b8cd85gk2f28p351exqwn/",thumb:"https://img.gamemonetize.com/vuj35pjyhr7b8cd85gk2f28p351exqwn/512x384.jpg",description:"Tap the ball carefully through each obstacle that matches its current color."},
    {id:"fb4",title:"Tank Stars",category:"Shooting",url:"https://html5.gamemonetize.co/a83kwue6bv9b93djhxqvi8ku3jvhlql0/",thumb:"https://img.gamemonetize.com/a83kwue6bv9b93djhxqvi8ku3jvhlql0/512x384.jpg",description:"Calculate artillery trajectory, aim weapon angle, and blast enemy tanks."},
    {id:"fb5",title:"Knife Hit",category:"Action",url:"https://html5.gamemonetize.co/xtpxzk9s2wxpnjly81wu273beu4tui7j/",thumb:"https://img.gamemonetize.com/xtpxzk9s2wxpnjly81wu273beu4tui7j/512x384.jpg",description:"Throw knives into the rotating log without colliding into previously lodged blades."},
    {id:"fb6",title:"Moto X3M Bike Race",category:"Racing",url:"https://html5.gamemonetize.co/e4pldx2cuh7970j73p1l73q00683g02v/",thumb:"https://img.gamemonetize.com/e4pldx2cuh7970j73p1l73q00683g02v/512x384.jpg",description:"High-speed motocross stunt racing across hazardous obstacle courses."},
    {id:"fb7",title:"Subway Surf Runners",category:"Arcade",url:"https://html5.gamemonetize.co/012l68m1n5x03x10w7k59g5y04318z42/",thumb:"https://img.gamemonetize.com/012l68m1n5x03x10w7k59g5y04318z42/512x384.jpg",description:"Dash through subway tracks, dodge trains, and collect shiny gold cyber coins."},
    {id:"fb8",title:"Cyber Highway Speed",category:"Hypercasual",url:"https://html5.gamemonetize.co/w2x4k9912061p210x3v78m12k0132l40/",thumb:"https://img.gamemonetize.com/w2x4k9912061p210x3v78m12k0132l40/512x384.jpg",description:"Navigate futuristic neon traffic at breakneck supersonic velocities."}
  ];

  // ── Application State ──
  let state = {
    user: null,
    currentView: "discover",
    allGames: [],
    filteredGames: [],
    displayCount: 24,
    currentCat: "all",
    searchQuery: "",
    activeGame: null,
    sessionStart: 0,
    sessionCoins: 0,
    miningTimer: null,
    idleTimer: null,
    lastActivity: Date.now(),
    isIdle: false,
    firestoreUnsubLeaderboard: null,
    firestoreUnsubUser: null,
    isExpanded: false
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

  // ── Toast Notification System ──
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

  // ── Local Storage Helpers ──
  function getCachedUser(){
    try {
      const u = localStorage.getItem("nx_user");
      return u ? JSON.parse(u) : null;
    } catch(e){ return null; }
  }

  function setCachedUser(user){
    try {
      localStorage.setItem("nx_user", JSON.stringify(user));
    } catch(e){}
  }

  function getLocalLogs(){
    try {
      return JSON.parse(localStorage.getItem("nx_wallet_logs") || "[]");
    } catch(e){ return []; }
  }

  function saveLocalLog(entry){
    try {
      const logs = getLocalLogs();
      logs.unshift({
        id: "log_" + Date.now(),
        created_at: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'}),
        ...entry
      });
      if(logs.length > 50) logs.pop();
      localStorage.setItem("nx_wallet_logs", JSON.stringify(logs));
    } catch(e){}
  }

  // ── UI Updates ──
  function updateCoinsDisplay(coins){
    const safeCoins = typeof coins === "number" ? coins : 0;
    ["#sidebar-coins", "#hud-coins", "#wallet-coins"].forEach(sel => {
      const el = $(sel);
      if(el) el.textContent = safeCoins.toLocaleString();
    });
    const inrEl = $("#wallet-inr");
    if(inrEl) inrEl.textContent = `= ₹${(safeCoins / COINS_PER_INR).toFixed(2)} INR (1000 Coins = ₹1)`;
  }

  function updateUserDisplay(){
    if(!state.user) return;
    const av = state.user.avatar || "⚡";
    const name = state.user.username || "Gamer";
    const hudUser = $("#hud-user");
    if(hudUser) hudUser.textContent = `${av} ${name}`;
    updateCoinsDisplay(state.user.coins || 0);
  }

  function renderProfileView(){
    if(!state.user) return;
    const av = state.user.avatar || "⚡";
    const name = state.user.username || "Gamer";
    const hudUser = $("#hud-user");
    if(hudUser) hudUser.textContent = `${av} ${name}`;
    const avDisplay = $("#avatar-display");
    if(avDisplay) avDisplay.textContent = av;
    const profUser = $("#profile-username");
    if(profUser) profUser.value = name;
    const profEmail = $("#profile-email");
    if(profEmail) profEmail.value = state.user.email || (state.user.is_guest ? "Guest Account (Local Session)" : "Google / Cloud Account");

    // Dynamically render avatar options with user's current avatar active
    const avOpts = $("#avatar-options");
    if(avOpts){
      avOpts.innerHTML = "";
      AVATARS.forEach(a => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "avatar-opt" + (a === av ? " active" : "");
        btn.textContent = a;
        btn.addEventListener("click", () => {
          $$(".avatar-opt").forEach(x => x.classList.remove("active"));
          btn.classList.add("active");
          if(avDisplay) avDisplay.textContent = a;
          state.user.avatar = a;
          setCachedUser(state.user);
          if(hudUser) hudUser.textContent = `${a} ${state.user.username}`;
          if(db && state.user.uid){
            try {
              db.collection("users").doc(state.user.uid).set({ avatar: a }, { merge: true });
              db.collection("leaderboard").doc(state.user.uid).set({ avatar: a }, { merge: true });
            } catch(e){}
          }
        });
        avOpts.appendChild(btn);
      });
    }
    updateCoinsDisplay(state.user.coins || 0);
  }

  // ── Firestore Sync & Coin Transactions ──
  async function syncCoinsToFirestore(delta, reason = "Game Mining", gameTitle = ""){
    if(!state.user) return;
    state.user.coins = Math.max(0, (state.user.coins || 0) + delta);
    setCachedUser(state.user);
    try { localStorage.setItem("nx_coins", String(state.user.coins)); } catch(e){}
    updateCoinsDisplay(state.user.coins);

    saveLocalLog({
      game_title: gameTitle || reason,
      coins_earned: Math.abs(delta),
      type: delta >= 0 ? "reward" : "withdrawal"
    });

    // Sync to Firestore if available
    if(db && state.user.uid){
      try {
        const userRef = db.collection("users").doc(state.user.uid);
        await userRef.set({
          uid: state.user.uid,
          username: state.user.username || "Gamer",
          avatar: state.user.avatar || "⚡",
          coins: state.user.coins,
          email: state.user.email || "",
          last_active: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        // Update real-time Esports Leaderboard
        const lbRef = db.collection("leaderboard").doc(state.user.uid);
        await lbRef.set({
          uid: state.user.uid,
          username: state.user.username || "Gamer",
          avatar: state.user.avatar || "⚡",
          coins: state.user.coins,
          hours: Number(Math.max(0.5, state.user.coins / 120).toFixed(1)),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      } catch(err){
        console.warn("Firestore sync saved to offline cache:", err.message);
      }
    }
  }

  // ── Authentication Management (Google, Guest & Email) ──
  function showAuthGate(msg = ""){
    $("#auth-gate").classList.remove("hidden");
    $("#app").style.display = "none";
    if(msg){
      const err = $("#auth-error");
      if(err){
        err.textContent = msg;
        err.style.display = "block";
      }
    }
  }

  function hideAuthGate(){
    $("#auth-gate").classList.add("hidden");
    $("#app").style.display = "flex";
  }

  async function initAuth(){
    // Setup listener on Firebase Auth state
    if(auth){
      auth.onAuthStateChanged(async (fbUser) => {
        if(fbUser){
          await handleUserAuthenticated(fbUser);
        } else {
          // Check cached local user session
          const cached = getCachedUser();
          if(cached && cached.is_guest){
            state.user = cached;
            enterArcade();
          } else {
            showAuthGate();
          }
        }
      });
    } else {
      // Fallback if Firebase SDK is unavailable (pure offline)
      const cached = getCachedUser();
      if(cached){
        state.user = cached;
        enterArcade();
      } else {
        showAuthGate();
      }
    }
  }

  async function handleUserAuthenticated(fbUser){
    const cached = getCachedUser();
    const cachedCoins = cached ? (typeof cached.coins === "number" ? cached.coins : 100) : 100;

    let profileData = {
      uid: fbUser.uid,
      email: fbUser.email || "",
      username: fbUser.displayName || (fbUser.isAnonymous ? "Guest_" + fbUser.uid.slice(0, 5) : (fbUser.email ? fbUser.email.split("@")[0] : "CyberGamer")),
      avatar: "⚡",
      coins: cachedCoins,
      is_guest: fbUser.isAnonymous
    };

    // Attempt to fetch existing Firestore profile and sync
    if(db){
      try {
        const docRef = db.collection("users").doc(fbUser.uid);
        const docSnap = await docRef.get();
        if(docSnap.exists){
          const d = docSnap.data();
          profileData.username = d.username || profileData.username;
          profileData.avatar = d.avatar || profileData.avatar;
          // Keep the highest between Firestore and local session to avoid coin loss
          profileData.coins = Math.max(typeof d.coins === "number" ? d.coins : 0, cachedCoins);
          if(profileData.coins > (d.coins || 0)){
            await docRef.set({ coins: profileData.coins }, { merge: true });
          }
        } else {
          await docRef.set({
            ...profileData,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        }

        // Real-time listener for user coin changes
        if(state.firestoreUnsubUser) state.firestoreUnsubUser();
        state.firestoreUnsubUser = docRef.onSnapshot(doc => {
          if(doc && doc.exists){
            const data = doc.data();
            if(typeof data.coins === "number" && data.coins !== state.user.coins){
              state.user.coins = data.coins;
              setCachedUser(state.user);
              updateCoinsDisplay(state.user.coins);
            }
          }
        }, err => console.warn("User onSnapshot:", err));

      } catch(e){
        console.warn("Using offline profile state:", e.message);
      }
    }

    state.user = profileData;
    setCachedUser(state.user);
    enterArcade();
  }

  function enterArcade(){
    hideAuthGate();
    updateUserDisplay();
    switchView("discover");
    loadGames();
    initLeaderboardRealtime();
    renderAnalytics();
  }

  // 1. Google Sign-In
  async function signInWithGoogle(){
    const errEl = $("#auth-error");
    if(errEl) errEl.style.display = "none";
    if(!auth){
      showToast("Firebase Auth not loaded. Playing as Guest.", "⚠️");
      signInAsGuest();
      return;
    }
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope("profile");
    provider.addScope("email");

    try {
      await auth.signInWithPopup(provider);
      showToast("Signed in with Google! Cloud profile connected.", "✓");
    } catch(err){
      console.warn("Google popup error, trying redirect:", err.message);
      if(err.code === "auth/popup-blocked" || err.code === "auth/cancelled-popup-request"){
        try {
          await auth.signInWithRedirect(provider);
        } catch(redirErr){
          if(errEl){
            errEl.textContent = redirErr.message;
            errEl.style.display = "block";
          }
        }
      } else {
        if(errEl){
          errEl.textContent = err.message;
          errEl.style.display = "block";
        }
      }
    }
  }

  // 2. Guest Mode (Instant 1-Click Access)
  async function signInAsGuest(){
    const errEl = $("#auth-error");
    if(errEl) errEl.style.display = "none";
    if(auth){
      try {
        await auth.signInAnonymously();
        showToast("Welcome! Signed in as Guest. +100 Coins credited.", "🚀");
        return;
      } catch(err){
        console.warn("Anonymous auth restricted in console, using local guest fallback:", err.message);
      }
    }

    // Local Guest Fallback
    const randId = Math.floor(1000 + Math.random() * 9000);
    state.user = {
      uid: "guest_" + Date.now(),
      username: "Guest_" + randId,
      avatar: "🎮",
      coins: 100,
      is_guest: true
    };
    setCachedUser(state.user);
    enterArcade();
    showToast("Guest Session started! Instant play active.", "🚀");
  }

  // 3. Email & Password Authentication
  let emailAuthMode = "login";
  async function handleEmailAuth(e){
    e.preventDefault();
    const errEl = $("#auth-error");
    if(errEl) errEl.style.display = "none";
    const email = $("#email-address").value.trim();
    const password = $("#email-password").value;
    const username = $("#email-username") ? $("#email-username").value.trim() : "";

    if(!auth){
      showToast("Firebase auth unavailable. Logging in as guest.", "⚠️");
      signInAsGuest();
      return;
    }

    try {
      if(emailAuthMode === "register"){
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        if(username && cred.user){
          await cred.user.updateProfile({ displayName: username });
        }
        showToast("Account created successfully! Welcome to NexPlay.", "✓");
      } else {
        await auth.signInWithEmailAndPassword(email, password);
        showToast("Signed in successfully!", "✓");
      }
    } catch(err){
      if(errEl){
        errEl.textContent = err.message;
        errEl.style.display = "block";
      }
    }
  }

  async function handleSignOut(){
    if(state.firestoreUnsubLeaderboard){
      try { state.firestoreUnsubLeaderboard(); } catch(e){}
      state.firestoreUnsubLeaderboard = null;
    }
    if(auth){
      try { await auth.signOut(); } catch(e){}
    }
    localStorage.removeItem("nx_user");
    state.user = null;
    showAuthGate("You have been signed out. Sign in to resume progress.");
    showToast("Signed out successfully.", "↩");
  }

  // ── SPA Routing & View Management ──
  function switchView(name){
    if(state.currentView === "theater" && name !== "theater"){
      endMiningSession();
      const frame = $("#game-iframe");
      if(frame) frame.src = "";
      $("#view-theater").classList.remove("expanded");
    }

    $$(".view").forEach(v => v.classList.remove("active"));
    const el = $("#view-" + name);
    if(el) el.classList.add("active");

    $$(".nav-item, .mob-nav-item").forEach(b => {
      b.classList.toggle("active", b.dataset.view === name);
    });

    const titles = {
      discover: "Discover 1,000+ Games",
      analytics: "Live Analytics & Network Telemetry",
      leaderboard: "Global Esports Rankings",
      wallet: "Cloud Wallet & Vault",
      profile: "Profile & Cloud Settings",
      theater: "Now Playing in Arcade"
    };
    $("#view-title").textContent = titles[name] || "NexPlay Arcade";
    state.currentView = name;

    // Close mobile navigation drawer if open
    const sidebar = $("#sidebar");
    if(sidebar) sidebar.classList.remove("open");
    const instDrawer = $("#game-instructions-drawer");
    if(instDrawer) instDrawer.style.display = "none";

    if(name === "wallet") loadWallet();
    if(name === "leaderboard") loadLeaderboardFallbackIfEmpty();
    if(name === "analytics") renderAnalytics();
    if(name === "profile") renderProfileView();

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ── GameMonetize API Integration & Catalog ──
  async function loadGames(){
    if(state.allGames.length > 0) return;
    renderSkeletonLoader();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6500);
      const res = await fetch(FEED_URL, { signal: controller.signal });
      clearTimeout(timeoutId);

      if(!res.ok) throw new Error("Feed HTTP Status: " + res.status);
      const raw = await res.json();
      state.allGames = (Array.isArray(raw) && raw.length > 0) ? raw : FALLBACK_GAMES;
    } catch(err){
      console.warn("Direct GameMonetize feed fetch fallback:", err.message);
      state.allGames = FALLBACK_GAMES;
    }

    // Dynamically augment category buttons with discovered categories
    extractDynamicCategories();
    applyFiltersAndRender();
  }

  function extractDynamicCategories(){
    const catBar = $("#category-bar");
    if(!catBar) return;
    const existing = new Set(Array.from(catBar.querySelectorAll(".cat-pill")).map(p => p.dataset.cat.toLowerCase()));
    const discovered = new Set();

    state.allGames.forEach(g => {
      if(g.category && typeof g.category === "string"){
        const c = g.category.trim();
        if(c && !existing.has(c.toLowerCase()) && !discovered.has(c)){
          discovered.add(c);
        }
      }
    });

    discovered.forEach(cat => {
      const btn = document.createElement("button");
      btn.className = "cat-pill";
      btn.dataset.cat = cat.toLowerCase();
      btn.textContent = cat;
      btn.addEventListener("click", () => {
        $$(".cat-pill").forEach(p => p.classList.remove("active"));
        btn.classList.add("active");
        state.currentCat = cat.toLowerCase();
        state.displayCount = 24;
        applyFiltersAndRender();
      });
      catBar.appendChild(btn);
    });
  }

  function applyFiltersAndRender(){
    const q = state.searchQuery.toLowerCase().trim();
    const cat = state.currentCat.toLowerCase();

    state.filteredGames = state.allGames.filter(g => {
      const matchCat = cat === "all" || (g.category && g.category.toLowerCase().includes(cat));
      const matchSearch = !q ||
        (g.title && g.title.toLowerCase().includes(q)) ||
        (g.category && g.category.toLowerCase().includes(q)) ||
        (g.tags && g.tags.toLowerCase().includes(q)) ||
        (g.description && g.description.toLowerCase().includes(q));
      return matchCat && matchSearch;
    });

    const searchCountEl = $("#search-count");
    if(searchCountEl){
      searchCountEl.textContent = `${state.filteredGames.length} Games Found`;
    }

    renderGameGrid();
  }

  function renderGameGrid(){
    const grid = $("#game-grid");
    if(!grid) return;
    grid.innerHTML = "";

    const visibleGames = state.filteredGames.slice(0, state.displayCount);
    if(visibleGames.length === 0){
      grid.innerHTML = `
        <div style="grid-column: 1/-1; padding: 60px 20px; text-align: center; color: var(--text-muted);">
          <div style="font-size: 2.5rem; margin-bottom: 12px;">🔍</div>
          <h3 style="color: var(--text-white); font-family: var(--font-head); margin-bottom: 8px;">No Games Found</h3>
          <p style="font-size: 0.9rem;">Try selecting "All Games" or searching with a different keyword.</p>
        </div>`;
      $("#load-more").style.display = "none";
      return;
    }

    const frag = document.createDocumentFragment();
    visibleGames.forEach((game, idx) => {
      const card = document.createElement("div");
      card.className = "game-card";
      card.setAttribute("tabindex", "0");

      const thumbUrl = game.thumb || "https://img.gamemonetize.com/placeholder.jpg";
      const catName = game.category || "Arcade";

      card.innerHTML = `
        <div class="game-thumb-wrap">
          <img class="game-thumb" src="${escapeHtml(thumbUrl)}" alt="${escapeHtml(game.title)}" loading="lazy" decoding="async">
          <div class="game-play-overlay">
            <span class="game-play-btn">▶ PLAY</span>
          </div>
          <span class="game-badge-cat">${escapeHtml(catName)}</span>
        </div>
        <div class="game-info">
          <h3 class="game-title" title="${escapeHtml(game.title)}">${escapeHtml(game.title)}</h3>
          <div class="game-meta-row">
            <span class="game-rating">★ 4.${(8 + (idx % 2)).toFixed(0)}</span>
            <span class="game-reward-tag">+10 ⚡/min</span>
          </div>
        </div>
      `;

      card.addEventListener("click", () => launchGame(game));
      card.addEventListener("keydown", (e) => {
        if(e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          launchGame(game);
        }
      });
      frag.appendChild(card);
    });

    grid.appendChild(frag);

    const loadMoreBtn = $("#load-more");
    if(loadMoreBtn){
      loadMoreBtn.style.display = state.displayCount < state.filteredGames.length ? "inline-flex" : "none";
    }
  }

  function renderSkeletonLoader(){
    const grid = $("#game-grid");
    if(!grid) return;
    grid.innerHTML = `
      <div class="skeleton-grid" id="skeleton-loader">
        ${Array.from({length: 12}).map(() => '<div class="skeleton-card"></div>').join('')}
      </div>
    `;
  }

  // ── Active Game Theater Player & Direct Touch Engine ──
  function launchGame(game){
    state.activeGame = game;
    switchView("theater");

    let url = game.url || game.game_url || "";
    if(url.startsWith("http://")) url = url.replace("http://", "https://");

    const frame = $("#game-iframe");
    const popout = $("#theater-popout");
    const loader = $("#game-loader-overlay");
    const container = $("#game-container");
    if(container) container.scrollTop = 0;

    if(loader){
      loader.classList.remove("hidden");
      loader.classList.add("active");
      loader.style.display = "flex";
      loader.style.opacity = "1";
      loader.style.pointerEvents = "auto";
    }
    if(popout) popout.href = url;

    frame.src = url;
    $("#theater-title").textContent = game.title || "Arcade Play";
    $("#game-instructions-text").textContent = game.instructions || game.description || "Use touch screen, arrow keys, or mouse to play.";

    const hideLoader = () => {
      if(!loader) return;
      loader.style.opacity = "0";
      loader.style.pointerEvents = "none";
      loader.classList.remove("active");
      loader.classList.add("hidden");
      setTimeout(() => {
        if(loader.classList.contains("hidden")){
          loader.style.display = "none";
        }
      }, 300);
      // Ensure iframe receives direct touch focus
      if(frame && frame.contentWindow){
        try { frame.contentWindow.focus(); } catch(e){}
      }
    };

    frame.onload = hideLoader;
    setTimeout(hideLoader, 3500);

    startMiningSession(game);
  }

  function startMiningSession(game){
    endMiningSession();
    state.sessionStart = Date.now();
    state.sessionCoins = 0;
    state.isIdle = false;
    state.lastActivity = Date.now();

    $("#miner-hud").style.display = "inline-flex";
    $("#theater-session-coins").textContent = "+0 ⚡";
    $("#theater-session-time").textContent = "0:00";

    const resetActivity = () => {
      state.lastActivity = Date.now();
      if(state.isIdle){
        state.isIdle = false;
        $("#idle-overlay").style.display = "none";
      }
    };

    ["mousemove", "keydown", "touchstart", "click"].forEach(evt => {
      document.addEventListener(evt, resetActivity, { passive: true });
    });

    // Mining Loop (every 30s = +5 Coins)
    state.miningTimer = setInterval(async () => {
      if(state.isIdle) return;
      const elapsedSec = Math.floor((Date.now() - state.sessionStart) / 1000);
      const mins = Math.floor(elapsedSec / 60);
      const secs = (elapsedSec % 60).toString().padStart(2, "0");
      $("#theater-session-time").textContent = `${mins}:${secs}`;

      state.sessionCoins += COINS_PER_30S;
      $("#theater-session-coins").textContent = `+${state.sessionCoins} ⚡`;

      // Reward coins and sync to Firestore
      await syncCoinsToFirestore(COINS_PER_30S, "Active Gameplay Mining", game.title || "Arcade Session");
      showToast(`+${COINS_PER_30S} Coins mined! Session total: ${state.sessionCoins} ⚡`, "⚡");
    }, MINING_INTERVAL_MS);

    // Idle Check Loop
    state.idleTimer = setInterval(() => {
      if(Date.now() - state.lastActivity > IDLE_TIMEOUT_MS && !state.isIdle){
        state.isIdle = true;
        $("#idle-overlay").style.display = "flex";
      }
    }, 5000);
  }

  function endMiningSession(){
    if(state.miningTimer) clearInterval(state.miningTimer);
    if(state.idleTimer) clearInterval(state.idleTimer);
    state.miningTimer = null;
    state.idleTimer = null;
    $("#miner-hud").style.display = "none";
  }

  // ── Real-Time Esports Leaderboard (Firebase Firestore onSnapshot) ──
  function initLeaderboardRealtime(){
    if(!db) {
      loadLeaderboardFallbackIfEmpty();
      return;
    }

    try {
      if(state.firestoreUnsubLeaderboard) state.firestoreUnsubLeaderboard();
      state.firestoreUnsubLeaderboard = db.collection("leaderboard")
        .orderBy("coins", "desc")
        .limit(25)
        .onSnapshot(snapshot => {
          const list = [];
          snapshot.forEach(doc => {
            list.push({ id: doc.id, ...doc.data() });
          });
          if(list.length > 0){
            renderLeaderboardList(list);
          } else {
            loadLeaderboardFallbackIfEmpty();
          }
        }, err => {
          console.warn("Leaderboard onSnapshot fallback:", err.message);
          loadLeaderboardFallbackIfEmpty();
        });
    } catch(e){
      loadLeaderboardFallbackIfEmpty();
    }
  }

  function renderLeaderboardList(list){
    list.forEach((p, idx) => {
      p.rank = idx + 1;
      p.hours = p.hours || Math.max(0.5, ((p.coins || 100) / 120)).toFixed(1);
      p.tier = p.coins >= 8000 ? "Cyber Apex" : p.coins >= 4000 ? "Gold" : p.coins >= 1000 ? "Silver" : "Bronze";
    });

    // Render Top 3 Podium Cards
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
          <div class="podium-name">${escapeHtml(p.username || "Gamer")}</div>
          <div class="podium-coins">${(p.coins || 0).toLocaleString()} ⚡</div>
          <span class="podium-tier tier-${meta.cls}">${meta.label}</span>
          <span style="font-size:0.78rem; color:var(--text-muted); font-family:var(--font-mono);">Est. Pool Share: ~₹${((p.coins||0) / COINS_PER_INR * 0.1).toFixed(2)}</span>
        `;
        podium.appendChild(card);
      });
    }

    // Render Leaderboard Rows
    const body = $("#leaderboard-body");
    if(body){
      body.innerHTML = "";
      const frag = document.createDocumentFragment();
      list.forEach(p => {
        const isCurUser = state.user && (p.uid === state.user.uid || p.id === state.user.uid);
        const tierCls = p.tier.toLowerCase().includes("apex") ? "tier-cyber" : p.tier.toLowerCase().includes("gold") ? "tier-gold" : p.tier.toLowerCase().includes("pink") ? "tier-pink" : p.tier.toLowerCase().includes("silver") ? "tier-silver" : "tier-bronze";
        const row = document.createElement("div");
        row.className = "lb-row" + (isCurUser ? " lb-highlight" : "");
        row.innerHTML = `
          <span class="lb-rank">#${p.rank}</span>
          <span class="lb-name">${escapeHtml(p.username || "Gamer")}${isCurUser ? ' <strong style="color:var(--neon-cyan);">(You)</strong>' : ''}</span>
          <span class="lb-coins">${(p.coins || 0).toLocaleString()} ⚡</span>
          <span class="lb-hours">${p.hours || 1}h</span>
          <span class="lb-tier ${tierCls}">${escapeHtml(p.tier)}</span>
          <span class="lb-reward">~₹${((p.coins || 0) / COINS_PER_INR * 0.1).toFixed(2)}</span>
        `;
        frag.appendChild(row);
      });
      body.appendChild(frag);
    }
  }

  function loadLeaderboardFallbackIfEmpty(){
    const fallbackRoster = [
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
      const userCoins = typeof state.user.coins === "number" ? state.user.coins : 100;
      fallbackRoster.push({
        rank: 10,
        username: state.user.username + " (You)",
        coins: userCoins,
        hours: Math.max(0.5, (userCoins / 120)).toFixed(1),
        tier: userCoins >= 8000 ? "Cyber Apex" : userCoins >= 4000 ? "Gold" : userCoins >= 1000 ? "Silver" : "Bronze",
        avatar: state.user.avatar || "⚡",
        uid: state.user.uid
      });
      fallbackRoster.sort((a,b) => (b.coins || 0) - (a.coins || 0));
    }
    renderLeaderboardList(fallbackRoster);
  }

  // ── Cloud Wallet, Bonus & Instant Currency Converter ──
  function loadWallet(){
    const coins = (state.user && typeof state.user.coins === "number") ? state.user.coins : 0;
    updateCoinsDisplay(coins);

    const ci = $("#converter-input");
    if(ci && !ci.value){
      ci.value = coins;
      $("#converter-result").textContent = `₹${(coins / COINS_PER_INR).toFixed(2)}`;
    }

    const minGoal = 1000;
    const pct = Math.min(100, Math.round((coins / minGoal) * 100));
    const progressFill = $("#redeem-progress-fill");
    const redeemStatus = $("#redeem-status");
    if(progressFill) progressFill.style.width = pct + "%";
    if(redeemStatus) redeemStatus.textContent = `${coins.toLocaleString()} / 1,000 Coins (${pct}% to Payout)`;

    // Render Transaction Logs
    const logsContainer = $("#wallet-logs");
    if(logsContainer){
      logsContainer.innerHTML = "";
      const logs = getLocalLogs();
      if(logs.length === 0){
        logsContainer.innerHTML = `<p style="color:var(--text-muted); font-size:0.86rem; padding:18px; text-align:center;">No transaction records yet. Claim daily bonus or mine in games to stack coins!</p>`;
      } else {
        const frag = document.createDocumentFragment();
        logs.forEach(l => {
          const row = document.createElement("div");
          row.className = "log-row";
          const coinText = l.type === "withdrawal" ? `-${l.coins_earned || l.coins} ⚡` : `+${l.coins_earned || l.coins} ⚡`;
          const coinCls = l.type === "withdrawal" ? "color:var(--hyper-pink);" : "color:var(--cyber-green);";
          row.innerHTML = `
            <span class="log-game">${escapeHtml(l.game_title || "Arcade Reward")}</span>
            <span class="log-coins" style="${coinCls}">${coinText}</span>
            <span class="log-time">${l.type || "session"}</span>
            <span class="log-date">${escapeHtml(l.created_at || "")}</span>
          `;
          frag.appendChild(row);
        });
        logsContainer.appendChild(frag);
      }
    }
  }

  // ── Live Analytics & CSS Activity Bars ──
  function renderAnalytics(){
    const userCoins = (state.user && typeof state.user.coins === "number") ? state.user.coins : 0;
    const localLogs = getLocalLogs();
    const gamesPlayed = localLogs.length > 0 ? localLogs.length : 18;
    const totalMins = Math.max(35, Math.floor(userCoins / 10));

    const commPool = 4850;
    const platReserve = 43650;

    const elGames = $("#stat-games-played");
    const elMins = $("#stat-minutes-spent");
    const elCoins = $("#stat-coins-earned");
    const elPool = $("#stat-pool");
    const elComm = $("#stat-community-pool");
    const elReserve = $("#stat-platform-reserve");

    if(elGames) elGames.textContent = gamesPlayed.toLocaleString();
    if(elMins) elMins.textContent = totalMins + "m";
    if(elCoins) elCoins.textContent = userCoins.toLocaleString() + " ⚡";
    if(elPool) elPool.textContent = "₹" + (commPool / COINS_PER_INR).toFixed(2);
    if(elComm) elComm.textContent = "₹" + (commPool / COINS_PER_INR).toFixed(2);
    if(elReserve) elReserve.textContent = "₹" + (platReserve / COINS_PER_INR).toFixed(2);

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

  // ── Event Listeners & Interactive Controls ──
  function setupEventListeners(){
    // Auth Gate Actions
    $("#google-signin-btn").addEventListener("click", signInWithGoogle);
    $("#guest-signin-btn").addEventListener("click", signInAsGuest);
    $("#email-toggle-btn").addEventListener("click", () => {
      const form = $("#email-auth-form");
      form.style.display = form.style.display === "none" ? "flex" : "none";
    });

    $$(".email-auth-tabs .tab-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        $$(".email-auth-tabs .tab-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        emailAuthMode = btn.dataset.tab;
        $("#username-input-wrap").style.display = emailAuthMode === "register" ? "block" : "none";
        $("#email-submit-btn").textContent = emailAuthMode === "register" ? "Create Account" : "Sign In";
      });
    });

    $("#email-auth-form").addEventListener("submit", handleEmailAuth);
    $("#sidebar-logout-btn").addEventListener("click", handleSignOut);
    $("#profile-logout-btn").addEventListener("click", handleSignOut);

    // Sidebar & Mobile Navigation
    $$(".nav-item, .mob-nav-item").forEach(btn => {
      btn.addEventListener("click", () => {
        if(btn.dataset.view) switchView(btn.dataset.view);
        $("#sidebar").classList.remove("open");
      });
    });
    $("#sidebar-toggle").addEventListener("click", () => $("#sidebar").classList.toggle("open"));

    // Quick HUD Click Navigation
    const coinHud = $("#hud-coin-badge");
    if(coinHud){
      coinHud.style.cursor = "pointer";
      coinHud.addEventListener("click", () => switchView("wallet"));
    }
    const sideCoinBox = $("#sidebar-coin-box");
    if(sideCoinBox){
      sideCoinBox.style.cursor = "pointer";
      sideCoinBox.addEventListener("click", () => switchView("wallet"));
    }
    const hudUser = $("#hud-user");
    if(hudUser){
      hudUser.style.cursor = "pointer";
      hudUser.addEventListener("click", () => switchView("profile"));
    }

    // Category Filter Selection
    $$(".cat-pill").forEach(pill => {
      pill.addEventListener("click", () => {
        $$(".cat-pill").forEach(p => p.classList.remove("active"));
        pill.classList.add("active");
        state.currentCat = pill.dataset.cat;
        state.displayCount = 24;
        applyFiltersAndRender();
      });
    });

    // Live Instant Search Filter
    let searchTimer = null;
    const searchInput = $("#game-search");
    if(searchInput){
      searchInput.addEventListener("input", () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
          state.searchQuery = searchInput.value;
          state.displayCount = 24;
          applyFiltersAndRender();
        }, 120);
      });
    }

    $("#load-more").addEventListener("click", () => {
      state.displayCount += 24;
      applyFiltersAndRender();
    });

    // Active Theater Controls
    $("#theater-back").addEventListener("click", () => {
      endMiningSession();
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
      state.isExpanded = theater.classList.contains("expanded");
      showToast(state.isExpanded ? "Edge-to-Edge Theater Fit Active" : "Standard Theater Fit Active", "🗖");
    });

    $("#theater-info").addEventListener("click", () => {
      const d = $("#game-instructions-drawer");
      d.style.display = d.style.display === "none" ? "block" : "none";
    });

    $("#resume-btn").addEventListener("click", () => {
      state.isIdle = false;
      state.lastActivity = Date.now();
      $("#idle-overlay").style.display = "none";
    });

    // Converter Input Live Math
    $("#converter-input").addEventListener("input", () => {
      const v = parseInt($("#converter-input").value) || 0;
      $("#converter-result").textContent = `₹${(v / COINS_PER_INR).toFixed(2)}`;
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
        $("#converter-result").textContent = `₹${(v / COINS_PER_INR).toFixed(2)}`;
      });
    });

    // Claim Daily Bonus (+100 Coins)
    const claimBonusBtn = $("#claim-bonus-btn");
    if(claimBonusBtn){
      claimBonusBtn.addEventListener("click", async () => {
        const lastClaim = localStorage.getItem("nx_last_bonus_time");
        const now = Date.now();
        const cooldownMs = 12 * 60 * 60 * 1000; // 12 hours cooldown
        if(lastClaim && (now - parseInt(lastClaim)) < cooldownMs){
          const remainingMins = Math.ceil((cooldownMs - (now - parseInt(lastClaim))) / (60 * 1000));
          showToast(`Daily bonus on cooldown! Next bonus in ${remainingMins}m.`, "⏳");
          return;
        }
        const bonusAmount = 100;
        localStorage.setItem("nx_last_bonus_time", String(now));
        await syncCoinsToFirestore(bonusAmount, "Daily Login Bonus");
        loadWallet();
        showToast(`Claimed +${bonusAmount} Coins! Synced to Firestore vault.`, "🎁");
      });
    }

    // Withdraw / Redeem Payout (UPI / Amazon Pay)
    const withdrawBtn = $("#withdraw-btn");
    if(withdrawBtn){
      withdrawBtn.addEventListener("click", async () => {
        const coins = (state.user && typeof state.user.coins === "number") ? state.user.coins : 0;
        if(coins < 1000){
          const needed = 1000 - coins;
          showToast(`Minimum payout is 1,000 Coins (₹1.00). Mine ${needed} more coins!`, "⚠️");
          return;
        }
        const inrValue = (coins / COINS_PER_INR).toFixed(2);
        const upiPrompt = prompt(`Redeem ₹${inrValue} (${coins.toLocaleString()} Coins)\nEnter your UPI ID (GPay / PhonePe / Paytm) or Amazon Pay phone number:`, "gamer@okaxis");
        if(upiPrompt === null) return;
        const upi = upiPrompt.trim() || "gamer@upi";

        await syncCoinsToFirestore(-coins, `Redeem Payout (UPI: ${upi})`);
        loadWallet();
        showToast(`Payout request of ₹${inrValue} submitted to ${upi}! Verification takes ~15 mins.`, "🚀");
      });
    }

    // Clear Logs
    const clearLogsBtn = $("#clear-logs-btn");
    if(clearLogsBtn){
      clearLogsBtn.addEventListener("click", () => {
        localStorage.removeItem("nx_wallet_logs");
        loadWallet();
        showToast("Transaction history cleared.", "🗑️");
      });
    }

    // Profile View Initialization
    renderProfileView();

    $("#save-profile").addEventListener("click", async () => {
      const newName = $("#profile-username").value.trim();
      const selAv = document.querySelector(".avatar-opt.active");
      const newAv = selAv ? selAv.textContent : (state.user ? state.user.avatar : "⚡");

      if(state.user){
        state.user.username = newName || state.user.username;
        state.user.avatar = newAv;
        setCachedUser(state.user);
        updateUserDisplay();

        if(db && state.user.uid){
          try {
            await db.collection("users").doc(state.user.uid).set({
              username: state.user.username,
              avatar: state.user.avatar
            }, { merge: true });
            await db.collection("leaderboard").doc(state.user.uid).set({
              username: state.user.username,
              avatar: state.user.avatar
            }, { merge: true });
          } catch(e){}
        }
      }

      showToast("Profile changes saved!", "✓");
    });

    $("#profile-lowspec").addEventListener("change", (e) => {
      if(e.target.checked) document.body.classList.add("low-spec");
      else document.body.classList.remove("low-spec");
    });

    
    // Touch focus forwarding: tapping game area focuses the iframe
    const gameCont = $("#game-container");
    if(gameCont){
      gameCont.addEventListener("touchstart", () => {
        const f = $("#game-iframe");
        if(f && f.contentWindow){
          try { f.contentWindow.focus(); } catch(err){}
        }
      }, { passive: true });
    }

    // Auto-save coins on tab close or backgrounding
    window.addEventListener("beforeunload", () => {
      if(state.user){
        setCachedUser(state.user);
        if(db && state.user.uid){
          try {
            db.collection("users").doc(state.user.uid).set({
              coins: state.user.coins,
              last_active: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
          } catch(e){}
        }
      }
    });

    document.addEventListener("visibilitychange", () => {
      if(document.visibilityState === "hidden" && state.user){
        setCachedUser(state.user);
        if(db && state.user.uid){
          try {
            db.collection("users").doc(state.user.uid).set({
              coins: state.user.coins
            }, { merge: true });
          } catch(e){}
        }
      }
    });

    // Keyboard Shortcuts: ESC exits edge-to-edge expanded fit
    document.addEventListener("keydown", (e) => {
      if(e.key === "Escape"){
        const theater = $("#view-theater");
        if(theater && theater.classList.contains("expanded")){
          theater.classList.remove("expanded");
          showToast("Standard Theater Fit Active", "🗖");
        }
      }
    });
  }

  // ── Bootstrap Application ──
  document.addEventListener("DOMContentLoaded", () => {
    setupEventListeners();
    initAuth();
  });

})();
