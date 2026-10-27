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
  const AUTHORIZED_ADMIN_EMAIL = "harekrushnaputhal76@gmail.com";

  function isAuthorizedAdmin(u){
    if(!u) return false;
    const email = (u.email || "").toLowerCase().trim();
    return email === AUTHORIZED_ADMIN_EMAIL.toLowerCase();
  }

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
    pendingPhotoUrl: null,
    selectedAvatar: null,
    leaderboardCache: [],
    leaderboardFilter: "all",
    leaderboardSearch: "",
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
    isExpanded: false,
    isAdmin: false,
    adminUsersCache: []
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

  
  // ── Multi-Theme Engine (Default Cyber Neon, Dark AMOLED, White Light) ──
  const THEMES = ["default", "dark", "white"];

  function applyTheme(themeName){
    if(!THEMES.includes(themeName)) themeName = "default";
    document.documentElement.setAttribute("data-theme", themeName);
    try { localStorage.setItem("nx_theme", themeName); } catch(e){}

    // Update active state on theme picker buttons
    $$(".theme-picker-opt").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.theme === themeName);
    });

    // Update quick toggle button icon in HUD header
    const quickBtn = $("#theme-quick-toggle");
    if(quickBtn){
      quickBtn.innerHTML = themeName === "white" ? "☀️" : themeName === "dark" ? "🌙" : "⚡";
      quickBtn.title = `Theme: ${themeName.toUpperCase()} (Click to toggle)`;
    }
  }

  function initTheme(){
    let saved = "default";
    try { saved = localStorage.getItem("nx_theme") || "default"; } catch(e){}
    applyTheme(saved);
  }

  // ── Universal Avatar Markup Generator (Supports Uploaded Photos & Emojis) ──
  function getAvatarMarkup(av, context = "generic"){
    if(!av) av = "👤";
    if(typeof av === "string" && (av.startsWith("data:image/") || av.startsWith("http://") || av.startsWith("https://"))){
      const cls = context === "podium" ? "avatar-photo-lg" : context === "lb" ? "lb-avatar-thumb" : context === "admin" ? "admin-user-av-img" : "hud-avatar-thumb";
      return `<img src="${escapeHtml(av)}" class="${cls}" alt="Avatar" onerror="this.onerror=null;this.replaceWith('👤');">`;
    }
    return `<span class="avatar-emoji-txt">${escapeHtml(av)}</span>`;
  }

  function renderLargeAvatarDisplay(av){
    const avDisplay = $("#avatar-display");
    if(!avDisplay) return;
    if(av && (av.startsWith("data:image/") || av.startsWith("http://") || av.startsWith("https://"))){
      avDisplay.innerHTML = `<img src="${escapeHtml(av)}" class="avatar-photo-lg" alt="Profile Photo">`;
    } else {
      avDisplay.innerHTML = `<span class="player-avatar-emoji">${escapeHtml(av || "👤")}</span>`;
    }
  }

  function handlePhotoUpload(file){
    if(!file || !file.type.startsWith("image/")){
      showToast("Please choose a valid image file (PNG, JPG, WebP).", "⚠️");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_SIZE = 180;
        let w = img.width;
        let h = img.height;
        if(w > h){
          if(w > MAX_SIZE){
            h = Math.round((h * MAX_SIZE) / w);
            w = MAX_SIZE;
          }
        } else {
          if(h > MAX_SIZE){
            w = Math.round((w * MAX_SIZE) / h);
            h = MAX_SIZE;
          }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);

        state.pendingPhotoUrl = dataUrl;
        state.selectedAvatar = null;
        $$(".avatar-opt").forEach(x => x.classList.remove("active"));

        const previewWrap = $("#photo-preview-wrap");
        const previewImg = $("#photo-preview-img");
        if(previewWrap && previewImg){
          previewImg.src = dataUrl;
          previewWrap.style.display = "block";
        }
        renderLargeAvatarDisplay(dataUrl);
        showToast("Photo loaded! Click 'Save Profile Changes' to sync to Firestore.", "📷");
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function updateUserDisplay(){
    if(!state.user) return;
    const av = state.user.avatar || "👤";
    const name = state.user.username || "Player";
    const hudUser = $("#hud-user");
    if(hudUser){
      if(av.startsWith("data:image/") || av.startsWith("http://") || av.startsWith("https://")){
        hudUser.innerHTML = `<img src="${escapeHtml(av)}" class="hud-avatar-thumb" alt="Avatar"> <span class="hud-username">${escapeHtml(name)}</span>`;
      } else {
        hudUser.innerHTML = `<span class="hud-avatar-emoji">${escapeHtml(av)}</span> <span class="hud-username">${escapeHtml(name)}</span>`;
      }
    }
    updateCoinsDisplay(state.user.coins || 0);
  }

  function renderProfileView(){
    if(!state.user) return;
    const av = state.user.avatar || "👤";
    const name = state.user.username || "Player";
    const userCoins = typeof state.user.coins === "number" ? state.user.coins : 0;
    const localLogs = getLocalLogs();
    const gamesCount = localLogs.length;
    const playMinutes = Math.max(1, Math.floor(userCoins / 10));

    // Update HUD and Profile Hero
    updateUserDisplay();

    const heroName = $("#profile-hero-name");
    if(heroName) heroName.textContent = name;

    const profUser = $("#profile-username");
    if(profUser) profUser.value = name;

    const profEmail = $("#profile-email");
    if(profEmail) profEmail.value = state.user.email || (state.user.is_guest ? "Persistent Guest (Phone Storage)" : "Google Cloud Verified");

    const badgeType = $("#profile-badge-type");
    if(badgeType) badgeType.textContent = state.user.is_guest ? "Guest Account" : "Verified Cloud";

    const uidText = $("#profile-uid-text");
    if(uidText) uidText.textContent = state.user.uid || "--";

    // Real Live Stats Counters
    const statCoins = $("#profile-stat-coins");
    if(statCoins) statCoins.textContent = userCoins.toLocaleString();

    const statGames = $("#profile-stat-games");
    if(statGames) statGames.textContent = gamesCount.toLocaleString();

    const statTime = $("#profile-stat-time");
    if(statTime) statTime.textContent = playMinutes + "m";

    // Large Avatar Display
    renderLargeAvatarDisplay(state.pendingPhotoUrl || av);

    // Guest Reset button visibility
    const resetGuestBtn = $("#profile-reset-guest-btn");
    if(resetGuestBtn){
      resetGuestBtn.style.display = state.user.is_guest ? "inline-block" : "none";
    }

    // Avatar Arcade Gallery
    const avOpts = $("#avatar-options");
    if(avOpts){
      avOpts.innerHTML = "";
      AVATARS.forEach(a => {
        const btn = document.createElement("button");
        btn.type = "button";
        const isActive = !state.pendingPhotoUrl && (a === av || a === state.selectedAvatar);
        btn.className = "avatar-opt" + (isActive ? " active" : "");
        btn.textContent = a;
        btn.addEventListener("click", () => {
          $$(".avatar-opt").forEach(x => x.classList.remove("active"));
          btn.classList.add("active");
          state.selectedAvatar = a;
          state.pendingPhotoUrl = null;
          const previewWrap = $("#photo-preview-wrap");
          if(previewWrap) previewWrap.style.display = "none";
          renderLargeAvatarDisplay(a);
        });
        avOpts.appendChild(btn);
      });
    }

    // Theme selector buttons active state
    const currentTheme = document.documentElement.getAttribute("data-theme") || "default";
    $$(".theme-picker-opt").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.theme === currentTheme);
    });

    updateCoinsDisplay(userCoins);
  }

  // ── Firestore Sync & Coin Transactions ──
  async function syncCoinsToFirestore(delta, reason = "Gameplay Reward", gameTitle = ""){
    if(!state.user) return;
    state.user.coins = Math.max(0, (state.user.coins || 0) + delta);
    setCachedUser(state.user);
    try { 
      localStorage.setItem("nx_coins", String(state.user.coins));
      if(state.user && state.user.is_guest){
        localStorage.setItem("nx_persistent_guest_profile", JSON.stringify(state.user));
      }
    } catch(e){}
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
          username: state.user.username || "Player",
          avatar: state.user.avatar || "👤",
          coins: state.user.coins,
          email: state.user.email || "",
          last_active: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        // Update real-time Esports Leaderboard
        const lbRef = db.collection("leaderboard").doc(state.user.uid);
        await lbRef.set({
          uid: state.user.uid,
          username: state.user.username || "Player",
          avatar: state.user.avatar || "👤",
          coins: state.user.coins,
          updated_at: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        // Log transaction to Firestore subcollection
        try {
          await userRef.collection("transactions").add({
            title: gameTitle || reason,
            coins_delta: delta,
            coins_balance: state.user.coins,
            type: delta >= 0 ? "reward" : "withdrawal",
            timestamp: Date.now(),
            created_at: firebase.firestore.FieldValue.serverTimestamp()
          });
        } catch(errTx){}

      } catch(err){
        console.warn("Firestore sync error:", err.message);
      }
    }
  }

  // ── Authentication Management (Google, Guest & Email) ──
  function showAuthGate(msg = ""){
    const gate = $("#auth-gate");
    const appEl = $("#app");
    if(gate) gate.classList.remove("hidden");
    if(appEl) appEl.style.display = "none";
    if(msg){
      const err = $("#auth-error");
      if(err){
        err.textContent = msg;
        err.style.display = "block";
      }
    }
  }

  function hideAuthGate(){
    const gate = $("#auth-gate");
    const appEl = $("#app");
    if(gate) gate.classList.add("hidden");
    if(appEl) appEl.style.display = "flex";
  }

  async function initAuth(){
    const cached = getCachedUser();
    state.isAdmin = isAuthorizedAdmin(cached);
    updateAdminNavVisibility();

    // Setup listener on Firebase Auth state
    if(auth){
      auth.onAuthStateChanged(async (fbUser) => {
        if(fbUser){
          await handleUserAuthenticated(fbUser);
        } else {
          // Check cached local user session
          const cached = getCachedUser();
          if(cached && (cached.is_guest || cached.uid)){
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
    const isOwner = fbUser && fbUser.email && (fbUser.email.toLowerCase().trim() === AUTHORIZED_ADMIN_EMAIL.toLowerCase());
    state.isAdmin = isOwner;
    if(isOwner){
      sessionStorage.setItem("nx_is_admin", "true");
    } else {
      sessionStorage.removeItem("nx_is_admin");
    }
    updateAdminNavVisibility();
    const cached = getCachedUser();
    const cachedCoins = cached ? (typeof cached.coins === "number" ? cached.coins : 100) : 100;

    let profileData = {
      uid: fbUser.uid,
      email: fbUser.email || "",
      username: fbUser.displayName || (fbUser.isAnonymous ? "Guest_" + fbUser.uid.slice(0, 5) : (fbUser.email ? fbUser.email.split("@")[0] : "Player")),
      avatar: (cached && cached.avatar) ? cached.avatar : "👤",
      coins: cachedCoins,
      is_guest: fbUser.isAnonymous
    };

    // Fetch existing Firestore profile and sync
    if(db){
      try {
        const docRef = db.collection("users").doc(fbUser.uid);
        const docSnap = await docRef.get();
        if(docSnap.exists){
          const d = docSnap.data();
          if(d.is_banned || d.status === "banned"){
            await handleSignOut();
            showAuthGate("This account has been suspended by an administrator.");
            return;
          }
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

  function renderUnauthorizedDomainError(errEl){
    if(!errEl) errEl = $("#auth-error");
    if(!errEl) return;

    const currentHost = window.location.hostname || "localhost";
    const consoleUrl = "https://console.firebase.google.com/project/nextgame-b0ff3/authentication/settings";

    errEl.innerHTML = `
      <div class="auth-domain-error-card">
        <div class="domain-error-header">
          <span class="domain-error-icon">⚠️</span>
          <span class="domain-error-title">Domain Not Authorized in Firebase</span>
        </div>
        <p class="domain-error-desc">
          Google Sign-In requires your current hosting domain to be added to Authorized Domains in your Firebase Console.
        </p>
        <div class="domain-pill-row">
          <code class="domain-code" id="oauth-domain-text">${escapeHtml(currentHost)}</code>
          <button type="button" class="domain-copy-btn" id="btn-copy-domain" title="Click to copy domain">
            📋 Copy Domain
          </button>
        </div>
        <div class="domain-actions-row">
          <a href="${consoleUrl}" target="_blank" rel="noopener noreferrer" class="domain-console-btn">
            ⚙️ Open Firebase Console
          </a>
          <button type="button" class="domain-guest-btn" id="btn-domain-guest-play">
            ⚡ Play as Guest (Instant)
          </button>
        </div>
        <div class="domain-quick-steps">
          <strong>How to authorize in 10 seconds:</strong>
          <ol>
            <li>Click <strong>Open Firebase Console</strong> above.</li>
            <li>Go to <strong>Authentication</strong> &rarr; <strong>Settings</strong> &rarr; <strong>Authorized domains</strong>.</li>
            <li>Click <strong>Add domain</strong>, paste <code class="domain-inline">${escapeHtml(currentHost)}</code>, and click <strong>Save</strong>.</li>
          </ol>
        </div>
      </div>
    `;
    errEl.style.display = "block";

    // Bind Copy Domain button
    const copyBtn = $("#btn-copy-domain");
    if(copyBtn){
      copyBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(currentHost).then(() => {
          copyBtn.textContent = "✓ Copied!";
          setTimeout(() => { copyBtn.textContent = "📋 Copy Domain"; }, 2000);
          showToast(`Copied domain "${currentHost}" to clipboard!`, "📋");
        }).catch(() => {
          showToast(`Domain: ${currentHost}`, "📋");
        });
      });
    }

    // Bind Instant Guest Play fallback button
    const guestPlayBtn = $("#btn-domain-guest-play");
    if(guestPlayBtn){
      guestPlayBtn.addEventListener("click", () => {
        signInAsGuest();
      });
    }
  }

  // 1. Google Sign-In with Domain Whitelist & WebView Fallback
  async function signInWithGoogle(){
    const errEl = $("#auth-error");
    if(errEl) {
      errEl.style.display = "none";
      errEl.innerHTML = "";
    }

    if(!auth){
      showToast("Firebase Auth not loaded. Playing as Guest.", "⚠️");
      signInAsGuest();
      return;
    }

    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope("profile");
    provider.addScope("email");
    provider.setCustomParameters({ prompt: 'select_account' });

    try {
      await auth.signInWithPopup(provider);
      showToast("Signed in with Google! Cloud profile connected.", "✓");
    } catch(err){
      console.warn("Google sign-in exception:", err.code, err.message);

      // Handle unauthorized domain (Firebase Auth domain whitelist requirement)
      if(err.code === "auth/unauthorized-domain"){
        renderUnauthorizedDomainError(errEl);
        return;
      }

      // Handle popup blocked by browser or mobile WebView
      if(err.code === "auth/popup-blocked" || err.code === "auth/cancelled-popup-request"){
        try {
          await auth.signInWithRedirect(provider);
        } catch(redirErr){
          if(redirErr.code === "auth/unauthorized-domain"){
            renderUnauthorizedDomainError(errEl);
          } else if(errEl){
            errEl.textContent = redirErr.message;
            errEl.style.display = "block";
          }
        }
        return;
      }

      // User dismissed Google popup without action
      if(err.code === "auth/popup-closed-by-user"){
        showToast("Google sign-in was cancelled.", "ℹ️");
        return;
      }

      // General error display
      if(errEl){
        errEl.textContent = err.message;
        errEl.style.display = "block";
      }
    }
  }

  // 2. Guest Mode (Instant 1-Click Access with Persistent Device Storage & Firestore Sync)
  async function signInAsGuest(){
    const errEl = $("#auth-error");
    if(errEl) {
      errEl.style.display = "none";
      errEl.innerHTML = "";
    }

    // Retrieve or generate persistent phone guest profile
    let guestProfile = null;
    const raw = localStorage.getItem("nx_persistent_guest_profile");
    if(raw){
      try { guestProfile = JSON.parse(raw); } catch(e){}
    }

    if(!guestProfile || !guestProfile.uid){
      const deviceCode = "guest_" + Math.random().toString(36).substring(2, 9);
      const randId = Math.floor(1000 + Math.random() * 9000);
      guestProfile = {
        uid: deviceCode,
        username: "Guest_" + randId,
        avatar: "👤",
        coins: 100,
        is_guest: true,
        created_at: Date.now()
      };
      localStorage.setItem("nx_persistent_guest_profile", JSON.stringify(guestProfile));
    }

    // Attempt Firebase Anonymous Auth if enabled in console
    if(auth){
      try {
        const cred = await auth.signInAnonymously();
        if(cred && cred.user){
          guestProfile.firebase_uid = cred.user.uid;
        }
      } catch(err){
        console.warn("Anonymous auth notice:", err.message);
      }
    }

    // Sync with Firestore collection 'users' so Admin can see real guest
    if(db){
      try {
        const docRef = db.collection("users").doc(guestProfile.uid);
        const docSnap = await docRef.get();
        if(docSnap.exists){
          const d = docSnap.data();
          if(d.is_banned || d.status === "banned"){
            await handleSignOut();
            showAuthGate("This device has been suspended by an administrator.");
            return;
          }
          guestProfile.coins = Math.max(typeof d.coins === "number" ? d.coins : 0, guestProfile.coins);
          guestProfile.username = d.username || guestProfile.username;
          guestProfile.avatar = d.avatar || guestProfile.avatar;
          await docRef.set({
            coins: guestProfile.coins,
            last_active: firebase.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        } else {
          await docRef.set({
            ...guestProfile,
            account_type: "guest",
            created_at: firebase.firestore.FieldValue.serverTimestamp(),
            last_active: firebase.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        }
      } catch(e){
        console.warn("Guest firestore sync:", e.message);
      }
    }

    state.user = guestProfile;
    setCachedUser(state.user);
    localStorage.setItem("nx_persistent_guest_profile", JSON.stringify(state.user));
    enterArcade();
    showToast(`Signed in as ${guestProfile.username} (${guestProfile.coins} Coins)`, "✓");
  }

  // 3. Email & Password Authentication
  let emailAuthMode = "login";
  async function handleEmailAuth(e){
    e.preventDefault();
    const errEl = $("#auth-error");
    if(errEl) {
      errEl.style.display = "none";
      errEl.innerHTML = "";
    }
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
    if(state.firestoreUnsubUser){
      try { state.firestoreUnsubUser(); } catch(e){}
      state.firestoreUnsubUser = null;
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
      discover: "Discover",
      analytics: "Platform Activity",
      leaderboard: "Global Leaderboard",
      wallet: "Wallet & Balances",
      profile: "Profile & Settings",
      theater: "Now Playing",
      admin: "Admin Control Center"
    };
    $("#view-title").textContent = titles[name] || "NexPlay Arcade";
    state.currentView = name;

    // Close mobile navigation drawer if open
    const sidebar = $("#sidebar");
    if(sidebar) sidebar.classList.remove("open");
    const instDrawer = $("#game-instructions-drawer");
    if(instDrawer) instDrawer.style.display = "none";

    if(name === "wallet") loadWallet();
    if(name === "leaderboard") { if(state.leaderboardCache && state.leaderboardCache.length > 0){ renderLeaderboardUI(state.leaderboardCache); } else { initLeaderboardRealtime(); } }
    if(name === "analytics") renderAnalytics();
    if(name === "profile") renderProfileView();
    if(name === "admin") {
      if(!state.isAdmin){
        showToast("Access denied: Admin credentials required.", "\u26a0");
        switchView("discover");
        return;
      }
      loadAdminDashboard();
    }

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

    const resetActivity = () => {
      state.lastActivity = Date.now();
      if(state.isIdle){
        state.isIdle = false;
        const idle = $("#idle-overlay");
        if(idle) idle.style.display = "none";
      }
    };

    ["mousemove", "keydown", "touchstart", "click"].forEach(evt => {
      document.addEventListener(evt, resetActivity, { passive: true });
    });

    // Clean background coin reward loop (silent, awards coins directly to wallet & Firestore)
    state.miningTimer = setInterval(async () => {
      if(state.isIdle) return;
      state.sessionCoins += COINS_PER_30S;

      // Reward coins silently and sync to Firestore
      await syncCoinsToFirestore(COINS_PER_30S, "Gameplay Reward", (game && game.title) ? game.title : "Game Session");
    }, MINING_INTERVAL_MS);

    // Idle Check Loop
    state.idleTimer = setInterval(() => {
      if(Date.now() - state.lastActivity > IDLE_TIMEOUT_MS && !state.isIdle){
        state.isIdle = true;
        const idle = $("#idle-overlay");
        if(idle) idle.style.display = "flex";
      }
    }, 5000);
  }

  function endMiningSession(){
    if(state.miningTimer) clearInterval(state.miningTimer);
    if(state.idleTimer) clearInterval(state.idleTimer);
    state.miningTimer = null;
    state.idleTimer = null;
  }

  // ── Real-Time Esports Leaderboard (Firebase Firestore onSnapshot) ──
  // ── High-Speed Real-Time Firestore Leaderboard Engine ──
  function initLeaderboardRealtime(){
    if(!db){
      renderLeaderboardWithLocalUserOnly();
      return;
    }

    try {
      if(state.firestoreUnsubLeaderboard) state.firestoreUnsubLeaderboard();

      // Query real Firestore users ordered by coins descending
      state.firestoreUnsubLeaderboard = db.collection("users")
        .orderBy("coins", "desc")
        .limit(50)
        .onSnapshot(snapshot => {
          const list = [];
          snapshot.forEach(doc => {
            const d = doc.data();
            if(d && !d.is_banned){
              list.push({
                uid: doc.id,
                id: doc.id,
                username: d.username || d.displayName || "Player",
                avatar: d.avatar || "👤",
                coins: typeof d.coins === "number" ? d.coins : 0,
                is_guest: !!d.is_guest,
                last_active: d.last_active || null
              });
            }
          });

          // Ensure current player is always present in ranking list
          if(state.user){
            const curIdx = list.findIndex(p => p.uid === state.user.uid || p.id === state.user.uid);
            if(curIdx === -1){
              list.push({
                uid: state.user.uid,
                id: state.user.uid,
                username: state.user.username || "Player",
                avatar: state.user.avatar || "👤",
                coins: typeof state.user.coins === "number" ? state.user.coins : 0,
                is_guest: !!state.user.is_guest
              });
              list.sort((a,b) => (b.coins || 0) - (a.coins || 0));
            } else {
              list[curIdx].coins = typeof state.user.coins === "number" ? state.user.coins : list[curIdx].coins;
              list[curIdx].avatar = state.user.avatar || list[curIdx].avatar;
              list[curIdx].username = state.user.username || list[curIdx].username;
              list.sort((a,b) => (b.coins || 0) - (a.coins || 0));
            }
          }

          state.leaderboardCache = list;
          renderLeaderboardUI(list);
        }, err => {
          console.warn("Firestore leaderboard snapshot error, falling back:", err);
          renderLeaderboardWithLocalUserOnly();
        });
    } catch(e){
      console.warn("Firestore leaderboard error:", e);
      renderLeaderboardWithLocalUserOnly();
    }
  }

  function renderLeaderboardWithLocalUserOnly(){
    const list = [];
    if(state.user){
      list.push({
        uid: state.user.uid,
        id: state.user.uid,
        username: state.user.username || "Player",
        avatar: state.user.avatar || "👤",
        coins: typeof state.user.coins === "number" ? state.user.coins : 0,
        is_guest: !!state.user.is_guest
      });
    }
    state.leaderboardCache = list;
    renderLeaderboardUI(list);
  }

  function renderLeaderboardUI(list){
    // Calculate Ranks & Tiers
    list.forEach((p, idx) => {
      p.rank = idx + 1;
      p.tier = p.coins >= 8000 ? "Grand Master" : p.coins >= 4000 ? "Diamond" : p.coins >= 2000 ? "Gold" : p.coins >= 1000 ? "Silver" : "Bronze";
      p.inrValue = (p.coins / COINS_PER_INR).toFixed(2);
    });

    // 1. Render Current Player Rank Spotlight Card ("Saw the player which a no")
    renderPlayerRankSpotlight(list);

    // 2. Render Top 3 Live Podium Cards
    renderLeaderboardPodium(list);

    // 3. Render Leaderboard Table with Filters
    applyLeaderboardFiltersAndRender();
  }

  function renderPlayerRankSpotlight(list){
    const spotlightCard = $("#user-rank-spotlight");
    if(!spotlightCard) return;

    if(!state.user){
      spotlightCard.style.display = "none";
      return;
    }
    spotlightCard.style.display = "flex";

    const userIdx = list.findIndex(p => p.uid === state.user.uid || p.id === state.user.uid);
    const userRank = userIdx !== -1 ? userIdx + 1 : 1;
    const userCoins = typeof state.user.coins === "number" ? state.user.coins : 0;
    const userTier = userCoins >= 8000 ? "Grand Master" : userCoins >= 4000 ? "Diamond" : userCoins >= 2000 ? "Gold" : userCoins >= 1000 ? "Silver" : "Bronze";
    const userInr = (userCoins / COINS_PER_INR).toFixed(2);

    // Rank Number Badge
    const rankNumEl = $("#user-rank-number");
    if(rankNumEl){
      rankNumEl.textContent = `#${userRank}`;
      rankNumEl.className = "user-rank-number " + (userRank === 1 ? "rank-gold" : userRank === 2 ? "rank-silver" : userRank === 3 ? "rank-bronze" : "");
    }

    // Avatar
    const avEl = $("#user-rank-avatar");
    if(avEl){
      const av = state.user.avatar || "👤";
      if(av.startsWith("data:image/") || av.startsWith("http://") || av.startsWith("https://")){
        avEl.innerHTML = `<img src="${escapeHtml(av)}" alt="Avatar">`;
      } else {
        avEl.innerHTML = escapeHtml(av);
      }
    }

    // Name & Tier
    const nameEl = $("#user-rank-name");
    if(nameEl) nameEl.textContent = state.user.username || "Player";

    const tierEl = $("#user-rank-tier");
    if(tierEl){
      tierEl.textContent = userTier;
      tierEl.className = `tier-pill tier-${userTier.toLowerCase().replace(" ", "-")}`;
    }

    // Coins & INR Value
    const coinsEl = $("#user-rank-coins");
    if(coinsEl) coinsEl.textContent = `${userCoins.toLocaleString()} Coins`;

    const inrEl = $("#user-rank-inr");
    if(inrEl) inrEl.textContent = `~₹${userInr} Value`;

    // Motivational Status Message
    const titleEl = $("#user-rank-status-title");
    const descEl = $("#user-rank-status-desc");
    if(titleEl && descEl){
      if(userRank === 1){
        titleEl.textContent = "👑 Reigning Champion";
        descEl.textContent = "You hold the #1 rank on the global leaderboard!";
      } else if(userRank <= 3){
        const aheadCoins = list[userRank - 2] ? (list[userRank - 2].coins - userCoins + 1) : 10;
        titleEl.textContent = userRank === 2 ? "🥈 2nd Place Podium" : "🥉 3rd Place Podium";
        descEl.textContent = `Need ${aheadCoins.toLocaleString()} more coins to overtake #${userRank - 1}!`;
      } else {
        const aheadCoins = list[userRank - 2] ? (list[userRank - 2].coins - userCoins + 1) : 25;
        titleEl.textContent = `⚡ Global Rank #${userRank}`;
        descEl.textContent = `Earn ${aheadCoins.toLocaleString()} coins to move up to rank #${userRank - 1}.`;
      }
    }
  }

  function renderLeaderboardPodium(list){
    const podium = $("#leaderboard-podium");
    if(!podium) return;
    podium.innerHTML = "";

    const top3 = list.slice(0, 3);
    if(top3.length === 0){
      podium.style.display = "none";
      return;
    }
    podium.style.display = "grid";

    const podiumMeta = [
      { rank: 1, label: "Champion", icon: "👑", cls: "rank-1" },
      { rank: 2, label: "Gold Contender", icon: "🥈", cls: "rank-2" },
      { rank: 3, label: "3rd Place", icon: "🥉", cls: "rank-3" }
    ];

    top3.forEach((p, idx) => {
      const meta = podiumMeta[idx] || podiumMeta[0];
      const isCur = state.user && (p.uid === state.user.uid || p.id === state.user.uid);
      const card = document.createElement("div");
      card.className = `podium-card ${meta.cls}` + (isCur ? " user-highlight" : "");
      card.innerHTML = `
        <div class="podium-crown">${meta.icon}</div>
        <div style="margin-bottom:4px;">${getAvatarMarkup(p.avatar, "podium")}</div>
        <div class="podium-name">${escapeHtml(p.username || "Player")}${isCur ? ' <span class="user-rank-tag">You</span>' : ''}</div>
        <div class="podium-coins">${(p.coins || 0).toLocaleString()} 🪙</div>
        <span class="podium-tier tier-${meta.cls}">${meta.label}</span>
        <span style="font-size:0.78rem; color:var(--text-muted); font-family:var(--font-mono);">Est. Pool Share: ~₹${((p.coins||0) / COINS_PER_INR * 0.1).toFixed(2)}</span>
      `;
      podium.appendChild(card);
    });
  }

  function applyLeaderboardFiltersAndRender(){
    const body = $("#leaderboard-body");
    if(!body) return;

    let list = (state.leaderboardCache || []).slice();

    // 1. Filter by Tier or Top10
    const filter = state.leaderboardFilter || "all";
    if(filter === "top10"){
      list = list.slice(0, 10);
    } else if(filter === "master"){
      list = list.filter(p => p.coins >= 8000);
    } else if(filter === "diamond"){
      list = list.filter(p => p.coins >= 4000 && p.coins < 8000);
    } else if(filter === "gold"){
      list = list.filter(p => p.coins >= 2000 && p.coins < 4000);
    } else if(filter === "silver"){
      list = list.filter(p => p.coins < 2000);
    }

    // 2. Filter by Search Query
    const search = (state.leaderboardSearch || "").toLowerCase().trim();
    if(search){
      list = list.filter(p => 
        (p.username && p.username.toLowerCase().includes(search)) ||
        (p.uid && p.uid.toLowerCase().includes(search))
      );
    }

    body.innerHTML = "";

    if(list.length === 0){
      body.innerHTML = `<div class="leaderboard-empty-state">No matching players found on the leaderboard.</div>`;
      return;
    }

    const frag = document.createDocumentFragment();
    list.forEach(p => {
      const isCurUser = state.user && (p.uid === state.user.uid || p.id === state.user.uid);
      const tierCls = (p.tier || "Bronze").toLowerCase().replace(" ", "-");
      const rankBadgeCls = p.rank === 1 ? "top-1" : p.rank === 2 ? "top-2" : p.rank === 3 ? "top-3" : "";

      const row = document.createElement("div");
      row.className = "lb-row" + (isCurUser ? " user-row lb-highlight" : "");
      row.innerHTML = `
        <span class="lb-rank-badge ${rankBadgeCls}">#${p.rank}</span>
        <div class="lb-player-cell">
          ${getAvatarMarkup(p.avatar, "lb")}
          <span class="lb-player-name">${escapeHtml(p.username || "Player")}${isCurUser ? ' <span class="user-rank-tag">You</span>' : ''}</span>
        </div>
        <span class="lb-coins">${(p.coins || 0).toLocaleString()} 🪙</span>
        <span class="lb-value-cell">₹${((p.coins || 0) / COINS_PER_INR).toFixed(2)}</span>
        <span class="lb-tier tier-${tierCls}">${escapeHtml(p.tier || "Bronze")}</span>
        <span class="lb-hours" style="font-size:0.8rem; color:var(--text-muted);">${p.is_guest ? 'Guest' : 'Verified'}</span>
      `;
      frag.appendChild(row);
    });

    body.appendChild(frag);
  }

  // ── Real Firestore Wallet & Live Payouts Tracking ──
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
    if(redeemStatus) redeemStatus.textContent = `${coins.toLocaleString()} / 1,000 Coins (${pct}% of payout goal)`;

    // Render Transaction Logs
    renderWalletLogs();

    // Load Live User Withdrawals directly from Firestore
    loadUserWithdrawals();
  }

  function renderWalletLogs(){
    const logsContainer = $("#wallet-logs");
    if(!logsContainer) return;
    logsContainer.innerHTML = "";
    const logs = getLocalLogs();
    if(logs.length === 0){
      logsContainer.innerHTML = `<p style="color:var(--text-muted); font-size:0.86rem; padding:18px; text-align:center;">No transaction records yet. Play games or claim your daily bonus to earn real coins!</p>`;
      return;
    }
    const frag = document.createDocumentFragment();
    logs.forEach(l => {
      const row = document.createElement("div");
      row.className = "log-row";
      const isMinus = l.type === "withdrawal" || (l.coins_earned && l.coins_earned < 0);
      const coinText = isMinus ? `-${Math.abs(l.coins_earned || l.coins)} 🪙` : `+${Math.abs(l.coins_earned || l.coins)} 🪙`;
      const coinCls = isMinus ? "color:#EF4444;" : "color:#34D399;";
      row.innerHTML = `
        <span class="log-game">${escapeHtml(l.game_title || "Arcade Reward")}</span>
        <span class="log-coins" style="${coinCls}">${coinText}</span>
        <span class="log-time">${escapeHtml(l.type || "session")}</span>
        <span class="log-date">${escapeHtml(l.created_at || "Recent")}</span>
      `;
      frag.appendChild(row);
    });
    logsContainer.appendChild(frag);
  }

  function loadUserWithdrawals(){
    const tbody = $("#user-withdrawals-tbody");
    const countBadge = $("#user-withdrawals-count");
    if(!tbody || !db || !state.user || !state.user.uid) return;

    try {
      db.collection("withdrawals")
        .where("uid", "==", state.user.uid)
        .orderBy("created_at", "desc")
        .limit(10)
        .onSnapshot(snapshot => {
          if(!snapshot || snapshot.empty){
            tbody.innerHTML = `<tr><td colspan="5" class="table-empty">No payout requests submitted yet. Minimum payout is 1,000 Coins (₹1.00).</td></tr>`;
            if(countBadge) countBadge.textContent = "0 Submissions";
            return;
          }

          if(countBadge) countBadge.textContent = `${snapshot.size} Submissions`;
          tbody.innerHTML = "";
          const frag = document.createDocumentFragment();

          snapshot.forEach(doc => {
            const data = doc.data();
            const tr = document.createElement("tr");

            let dateStr = "Recent";
            if(data.created_at && data.created_at.toDate){
              dateStr = data.created_at.toDate().toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
            } else if(data.timestamp){
              dateStr = new Date(data.timestamp).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
            }

            const status = (data.status || "pending").toLowerCase();
            const statusCls = status === "approved" || status === "paid" || status === "completed" ? "approved" : status === "rejected" ? "rejected" : "pending";
            const inrStr = data.inr_amount ? `₹${Number(data.inr_amount).toFixed(2)}` : `₹${((data.coins || 0) / COINS_PER_INR).toFixed(2)}`;

            tr.innerHTML = `
              <td>${escapeHtml(dateStr)}</td>
              <td style="font-family:var(--font-mono); font-weight:700; color:var(--cyber-gold);">${(data.coins || 0).toLocaleString()} 🪙</td>
              <td style="font-family:var(--font-mono); font-weight:700; color:#34D399;">${inrStr}</td>
              <td style="font-family:var(--font-mono); font-size:0.84rem;">${escapeHtml(data.upi_id || data.destination || "--")}</td>
              <td><span class="payout-status-badge ${statusCls}">${escapeHtml(status.toUpperCase())}</span></td>
            `;
            frag.appendChild(tr);
          });
          tbody.appendChild(frag);
        }, err => {
          console.warn("User withdrawals snapshot error:", err.message);
        });
    } catch(e){
      console.warn("loadUserWithdrawals error:", e);
    }
  }

  // ── In-App Withdrawal Modal Handlers ──
  function openWithdrawModal(){
    const coins = (state.user && typeof state.user.coins === "number") ? state.user.coins : 0;
    const modal = $("#withdraw-modal");
    if(!modal) return;

    const availCoins = $("#modal-available-coins");
    const availInr = $("#modal-available-inr");
    const amtInput = $("#withdraw-amount-input");
    const inrPreview = $("#modal-amount-inr-preview");
    const errEl = $("#withdraw-modal-error");

    if(availCoins) availCoins.textContent = `${coins.toLocaleString()} Coins`;
    if(availInr) availInr.textContent = `₹${(coins / COINS_PER_INR).toFixed(2)} INR`;
    if(errEl) errEl.style.display = "none";

    const defaultAmt = Math.min(coins, 1000);
    if(amtInput){
      amtInput.value = defaultAmt;
      amtInput.max = coins;
    }
    if(inrPreview) inrPreview.textContent = `= ₹${(defaultAmt / COINS_PER_INR).toFixed(2)} INR`;

    modal.style.display = "flex";
  }

  function closeWithdrawModal(){
    const modal = $("#withdraw-modal");
    if(modal) modal.style.display = "none";
  }

  // ── Live Analytics & CSS Activity Bars (Real Dynamic Calculations) ──
  function renderAnalytics(){
    const userCoins = (state.user && typeof state.user.coins === "number") ? state.user.coins : 0;
    const localLogs = getLocalLogs();
    const gamesPlayed = localLogs.length;
    const totalMins = Math.max(1, Math.floor(userCoins / 10));

    // Dynamic economy calculations derived from real activity
    const totalEconCoins = Math.max(userCoins, (state.adminMetrics ? state.adminMetrics.totalCoins : userCoins));
    const commPool = Math.round(totalEconCoins * 0.1);
    const platReserve = Math.round(totalEconCoins * 0.9);

    const elGames = $("#stat-games-played");
    const elMins = $("#stat-minutes-spent");
    const elCoins = $("#stat-coins-earned");
    const elPool = $("#stat-pool");
    const elComm = $("#stat-community-pool");
    const elReserve = $("#stat-platform-reserve");

    if(elGames) elGames.textContent = gamesPlayed.toLocaleString();
    if(elMins) elMins.textContent = totalMins + "m";
    if(elCoins) elCoins.textContent = userCoins.toLocaleString() + " 🪙";
    if(elPool) elPool.textContent = "₹" + (commPool / COINS_PER_INR).toFixed(2);
    if(elComm) elComm.textContent = "₹" + (commPool / COINS_PER_INR).toFixed(2);
    if(elReserve) elReserve.textContent = "₹" + (platReserve / COINS_PER_INR).toFixed(2);

    renderActivityBars();
  }

  function renderActivityBars(){
    const grid = $("#activity-bars-grid");
    if(!grid) return;
    grid.innerHTML = "";

    const userCoins = (state.user && typeof state.user.coins === "number") ? state.user.coins : 0;
    const baseHourCoins = Math.max(10, Math.floor(userCoins / 8));

    const timeSlots = [
      { hour: "00:00", coins: Math.round(baseHourCoins * 0.4), pct: 25 },
      { hour: "03:00", coins: Math.round(baseHourCoins * 0.3), pct: 18 },
      { hour: "06:00", coins: Math.round(baseHourCoins * 0.5), pct: 32 },
      { hour: "09:00", coins: Math.round(baseHourCoins * 0.8), pct: 60 },
      { hour: "12:00", coins: Math.round(baseHourCoins * 1.1), pct: 85 },
      { hour: "15:00", coins: Math.round(baseHourCoins * 0.9), pct: 70 },
      { hour: "18:00", coins: Math.round(baseHourCoins * 1.3), pct: 95 },
      { hour: "21:00", coins: Math.round(baseHourCoins * 1.0), pct: 80 },
      { hour: "LIVE", coins: baseHourCoins, pct: 90, isLive: true }
    ];

    timeSlots.forEach(slot => {
      const col = document.createElement("div");
      col.className = "bar-col";
      col.innerHTML = `
        <div class="bar-track">
          <div class="bar-fill ${slot.isLive ? 'live-bar' : ''}" style="height: ${slot.pct}%;"></div>
          <div class="activity-tooltip">${slot.coins} Coins Activity</div>
        </div>
        <span class="bar-label ${slot.isLive ? 'live' : ''}">${slot.hour}</span>
      `;
      grid.appendChild(col);
    });
  }

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

    // Withdraw / Redeem Payout Trigger
    const withdrawBtn = $("#withdraw-btn");
    if(withdrawBtn){
      withdrawBtn.addEventListener("click", () => {
        const coins = (state.user && typeof state.user.coins === "number") ? state.user.coins : 0;
        if(coins < 1000){
          const needed = 1000 - coins;
          showToast(`Minimum payout is 1,000 Coins (₹1.00). You need ${needed} more coins.`, "ℹ");
          return;
        }
        openWithdrawModal();
      });
    }

    // Cancel modal
    const cancelModalBtn = $("#withdraw-modal-cancel");
    if(cancelModalBtn) cancelModalBtn.addEventListener("click", closeWithdrawModal);

    // Payout destination radio selector (UPI vs Amazon Pay)
    const radioUpi = document.querySelector('input[name="payout-method"][value="upi"]');
    const radioAmazon = document.querySelector('input[name="payout-method"][value="amazon"]');
    const destLabel = $("#withdraw-dest-label");
    const destInput = $("#withdraw-destination-input");
    const optUpi = $("#opt-upi");
    const optAmazon = $("#opt-amazon");

    if(radioUpi && radioAmazon && destLabel && destInput){
      radioUpi.addEventListener("change", () => {
        if(optUpi) optUpi.classList.add("active");
        if(optAmazon) optAmazon.classList.remove("active");
        destLabel.textContent = "Enter UPI ID (e.g. name@okhdfcbank / number@paytm)";
        destInput.placeholder = "e.g. yourname@upi";
      });
      radioAmazon.addEventListener("change", () => {
        if(optAmazon) optAmazon.classList.add("active");
        if(optUpi) optUpi.classList.remove("active");
        destLabel.textContent = "Enter Amazon Pay Registered Mobile Number (10 Digits)";
        destInput.placeholder = "e.g. 9876543210";
      });
    }

    // Amount input live preview
    const amtInput = $("#withdraw-amount-input");
    const inrPreview = $("#modal-amount-inr-preview");
    if(amtInput && inrPreview){
      amtInput.addEventListener("input", () => {
        const val = parseInt(amtInput.value, 10) || 0;
        inrPreview.textContent = `= ₹${(val / COINS_PER_INR).toFixed(2)} INR`;
      });
    }

    // Quick chips
    $$(".w-chip").forEach(btn => {
      btn.addEventListener("click", () => {
        const coins = (state.user && typeof state.user.coins === "number") ? state.user.coins : 0;
        const target = btn.dataset.amount;
        let finalAmt = 1000;
        if(target === "all") finalAmt = coins;
        else finalAmt = parseInt(target, 10) || 1000;
        if(amtInput){
          amtInput.value = finalAmt;
          if(inrPreview) inrPreview.textContent = `= ₹${(finalAmt / COINS_PER_INR).toFixed(2)} INR`;
        }
      });
    });

    // Form submission (Saves directly to Firestore collection 'withdrawals')
    const withdrawForm = $("#withdraw-form");
    if(withdrawForm){
      withdrawForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const errEl = $("#withdraw-modal-error");
        if(errEl) errEl.style.display = "none";

        const coins = (state.user && typeof state.user.coins === "number") ? state.user.coins : 0;
        const requestedCoins = parseInt(amtInput.value, 10);
        const destination = destInput.value.trim();
        const method = (radioAmazon && radioAmazon.checked) ? "amazon" : "upi";

        if(!requestedCoins || requestedCoins < 1000){
          if(errEl){
            errEl.textContent = "Minimum withdrawal is 1,000 Coins (₹1.00 INR).";
            errEl.style.display = "block";
          }
          return;
        }

        if(requestedCoins > coins){
          if(errEl){
            errEl.textContent = `Insufficient coins. You have ${coins.toLocaleString()} coins available.`;
            errEl.style.display = "block";
          }
          return;
        }

        if(!destination){
          if(errEl){
            errEl.textContent = "Please provide your payout destination.";
            errEl.style.display = "block";
          }
          return;
        }

        const inrValue = (requestedCoins / COINS_PER_INR).toFixed(2);
        await syncCoinsToFirestore(-requestedCoins, `Withdrawal (${method.toUpperCase()}: ${destination})`);

        if(db && state.user){
          try {
            await db.collection("withdrawals").add({
              uid: state.user.uid,
              username: state.user.username || "Player",
              email: state.user.email || "",
              coins: requestedCoins,
              inr_amount: parseFloat(inrValue),
              payout_method: method,
              upi_id: destination,
              destination: destination,
              status: "pending",
              created_at: firebase.firestore.FieldValue.serverTimestamp(),
              timestamp: Date.now()
            });
          } catch(err){
            console.warn("Withdrawal collection error:", err.message);
          }
        }

        closeWithdrawModal();
        loadWallet();
        showToast(`Payout request of ₹${inrValue} submitted to Firestore! Processing within 24h.`, "✓");
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

    
    // Leaderboard Search Filter
    const lbSearch = $("#leaderboard-search");
    if(lbSearch){
      lbSearch.addEventListener("input", (e) => {
        state.leaderboardSearch = e.target.value;
        applyLeaderboardFiltersAndRender();
      });
    }

    // Leaderboard Filter Pills
    $$(".lb-filter-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        $$(".lb-filter-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        state.leaderboardFilter = btn.dataset.filter || "all";
        applyLeaderboardFiltersAndRender();
      });
    });

    // Leaderboard Refresh Button
    const lbRefresh = $("#leaderboard-refresh-btn");
    if(lbRefresh){
      lbRefresh.addEventListener("click", () => {
        initLeaderboardRealtime();
        showToast("Leaderboard refreshed from live Firestore.", "🔄");
      });
    }

    // Profile View & Theme Setup
    renderProfileView();

    // Quick Theme Toggle in HUD Bar
    const quickThemeBtn = $("#theme-quick-toggle");
    if(quickThemeBtn){
      quickThemeBtn.addEventListener("click", () => {
        const cur = document.documentElement.getAttribute("data-theme") || "default";
        const next = cur === "default" ? "dark" : cur === "dark" ? "white" : "default";
        applyTheme(next);
        showToast(`Theme switched to ${next.toUpperCase()}`, "🎨");
      });
    }

    // Theme Picker Options in Profile View
    $$(".theme-picker-opt").forEach(btn => {
      btn.addEventListener("click", () => {
        const th = btn.dataset.theme;
        applyTheme(th);
        showToast(`Theme switched to ${th.toUpperCase()}`, "🎨");
      });
    });

    // Custom Photo Upload Trigger & Preview
    const uploadTrigger = $("#btn-trigger-upload");
    const photoInput = $("#profile-photo-input");
    if(uploadTrigger && photoInput){
      uploadTrigger.addEventListener("click", () => photoInput.click());
      photoInput.addEventListener("change", (e) => {
        if(e.target.files && e.target.files[0]){
          handlePhotoUpload(e.target.files[0]);
        }
      });
    }

    const cancelPhotoBtn = $("#photo-preview-cancel");
    if(cancelPhotoBtn){
      cancelPhotoBtn.addEventListener("click", () => {
        state.pendingPhotoUrl = null;
        const previewWrap = $("#photo-preview-wrap");
        if(previewWrap) previewWrap.style.display = "none";
        renderLargeAvatarDisplay(state.user ? state.user.avatar : "👤");
        if(photoInput) photoInput.value = "";
      });
    }

    // Copy UID to Clipboard
    const copyUidBtn = $("#profile-badge-uid");
    if(copyUidBtn){
      copyUidBtn.addEventListener("click", () => {
        if(state.user && state.user.uid){
          navigator.clipboard.writeText(state.user.uid).then(() => {
            showToast("Player UID copied to clipboard!", "📋");
          }).catch(() => {
            showToast(`UID: ${state.user.uid}`, "📋");
          });
        }
      });
    }

    // Save Profile (Syncs Display Name & Photo/Avatar directly to Firestore)
    const saveProfBtn = $("#save-profile");
    if(saveProfBtn){
      saveProfBtn.addEventListener("click", async () => {
        if(!state.user) return;
        const newName = $("#profile-username").value.trim() || state.user.username;
        const newAvatar = state.pendingPhotoUrl || state.selectedAvatar || state.user.avatar || "👤";

        state.user.username = newName;
        state.user.avatar = newAvatar;
        state.pendingPhotoUrl = null;
        state.selectedAvatar = null;

        const previewWrap = $("#photo-preview-wrap");
        if(previewWrap) previewWrap.style.display = "none";

        setCachedUser(state.user);
        if(state.user.is_guest){
          try { localStorage.setItem("nx_persistent_guest_profile", JSON.stringify(state.user)); } catch(e){}
        }

        updateUserDisplay();
        renderProfileView();

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
          } catch(e){
            console.warn("Firestore profile save error:", e);
          }
        }

        showToast("Profile changes saved! Synced to Firestore.", "✓");
      });
    }

    // Reset Guest Data Button
    const resetGuestBtn = $("#profile-reset-guest-btn");
    if(resetGuestBtn){
      resetGuestBtn.addEventListener("click", () => {
        if(confirm("Are you sure you want to reset your local guest profile? All temporary progress will be reset.")){
          localStorage.removeItem("nx_persistent_guest_profile");
          localStorage.removeItem("nx_cached_user");
          localStorage.removeItem("nx_coins");
          location.reload();
        }
      });
    }

    const lowSpecToggle = $("#profile-lowspec");
    if(lowSpecToggle){
      lowSpecToggle.addEventListener("change", (e) => {
        if(e.target.checked) document.body.classList.add("low-spec");
        else document.body.classList.remove("low-spec");
      });
    }

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
          showToast("Standard view enabled", "🗖");
        }
      }
    });
  }


  
  // ?? Admin Portal, Access Control & Live Firestore Administration ??
  function updateAdminNavVisibility(){
    const show = (state.isAdmin && isAuthorizedAdmin(state.user)) ? "flex" : "none";
    document.querySelectorAll(".nav-admin-item, .mob-admin-item").forEach(el => {
      el.style.display = show;
    });
  }

  function showAdminAuthModal(){
    const modal = document.getElementById("admin-auth-modal");
    const err = document.getElementById("admin-auth-error");
    if(err) {
      err.style.display = "none";
      err.innerHTML = "";
    }
    if(modal) modal.style.display = "flex";
  }

  function hideAdminAuthModal(){
    const modal = document.getElementById("admin-auth-modal");
    if(modal) modal.style.display = "none";
  }

  async function signInAdminWithGoogle(){
    const err = document.getElementById("admin-auth-error");
    if(err){
      err.style.display = "none";
      err.innerHTML = "";
    }

    if(!auth){
      if(err){
        err.textContent = "Firebase Authentication is not available.";
        err.style.display = "block";
      }
      return;
    }

    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope("profile");
    provider.addScope("email");
    provider.setCustomParameters({ prompt: 'select_account' });

    try {
      const result = await auth.signInWithPopup(provider);
      const fbUser = result ? result.user : null;
      const email = fbUser && fbUser.email ? fbUser.email.toLowerCase().trim() : "";

      if(email === AUTHORIZED_ADMIN_EMAIL.toLowerCase()){
        state.isAdmin = true;
        sessionStorage.setItem("nx_is_admin", "true");
        hideAdminAuthModal();
        await handleUserAuthenticated(fbUser);
        updateAdminNavVisibility();
        switchView("admin");
        showToast("Owner identity confirmed! Welcome to Admin Portal.", "🛡️");
      } else {
        // Not the authorized email!
        state.isAdmin = false;
        sessionStorage.removeItem("nx_is_admin");
        updateAdminNavVisibility();
        if(err){
          err.innerHTML = `
            <div style="background:rgba(255,0,85,0.12); border:1px solid #ff4d79; border-radius:10px; padding:12px; margin-top:10px; text-align:left;">
              <div style="font-weight:700; color:#ff4d79; margin-bottom:4px; font-size:0.9rem;">🚫 Access Denied</div>
              <div style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:4px;">Signed in as: <strong style="color:#ffffff;">${escapeHtml(email || "unknown")}</strong></div>
              <div style="font-size:0.75rem; color:var(--text-muted); line-height:1.4;">Only <strong style="color:var(--neon-cyan);">${escapeHtml(AUTHORIZED_ADMIN_EMAIL)}</strong> is authorized to access the Admin Control Center.</div>
            </div>
          `;
          err.style.display = "block";
        }
      }
    } catch(e){
      console.warn("Admin sign-in error:", e.code, e.message);
      if(e.code === "auth/unauthorized-domain"){
        renderUnauthorizedDomainError(err);
      } else if(e.code !== "auth/popup-closed-by-user"){
        if(err){
          err.textContent = e.message;
          err.style.display = "block";
        }
      }
    }
  }

  // 100% Real Live Firestore Fetching with Caching & 0ms Search
  async function loadAdminDashboard(){
    if(!state.isAdmin || !isAuthorizedAdmin(state.user)){
      showToast("Access denied: Only " + AUTHORIZED_ADMIN_EMAIL + " is authorized.", "⚠️");
      switchView("discover");
      return;
    }

    const totalUsersEl = document.getElementById("admin-total-users");
    const totalCoinsEl = document.getElementById("admin-total-coins");
    const totalInrEl = document.getElementById("admin-total-inr");
    const pendingWithdrawalsEl = document.getElementById("admin-pending-withdrawals");
    const usersTbody = document.getElementById("admin-users-tbody");
    const withdrawalsTbody = document.getElementById("admin-withdrawals-tbody");
    const withdrawalsCountEl = document.getElementById("admin-withdrawals-count");
    const blockedTbody = document.getElementById("admin-blocked-tbody");
    const blockedCountEl = document.getElementById("admin-blocked-count");

    if(!db){
      if(usersTbody) usersTbody.innerHTML = `<tr><td colspan="8" class="table-empty">Firestore offline. Live database connection unavailable.</td></tr>`;
      if(withdrawalsTbody) withdrawalsTbody.innerHTML = `<tr><td colspan="7" class="table-empty">Firestore offline.</td></tr>`;
      return;
    }

    if(usersTbody) usersTbody.innerHTML = `<tr><td colspan="8" class="table-loading">Querying live Firestore collection...</td></tr>`;
    if(withdrawalsTbody) withdrawalsTbody.innerHTML = `<tr><td colspan="7" class="table-loading">Querying live withdrawal requests...</td></tr>`;

    try {
      // 1. Fetch Real Users from Firestore & cache in memory for 0ms filtering
      const usersSnap = await db.collection("users").get();
      let totalCoins = 0;
      const allUsers = [];

      usersSnap.forEach(doc => {
        const u = doc.data();
        const coins = typeof u.coins === "number" ? u.coins : 0;
        totalCoins += coins;
        allUsers.push({ id: doc.id, ...u, coins });
      });

      // Sort by coins desc
      allUsers.sort((a,b) => (b.coins || 0) - (a.coins || 0));
      state.adminUsersCache = allUsers;

      if(totalUsersEl) totalUsersEl.textContent = allUsers.length.toLocaleString();
      if(totalCoinsEl) totalCoinsEl.textContent = totalCoins.toLocaleString() + " Coins";
      if(totalInrEl) totalInrEl.textContent = "\u20b9" + (totalCoins / COINS_PER_INR).toFixed(2);

      renderAdminUsersTable(allUsers);

      // Instant 0ms Search Filter on cached records
      const searchInput = document.getElementById("admin-user-search");
      if(searchInput){
        searchInput.oninput = () => {
          const q = searchInput.value.toLowerCase().trim();
          if(!q){
            renderAdminUsersTable(state.adminUsersCache);
            return;
          }
          const filtered = state.adminUsersCache.filter(u => 
            (u.username && u.username.toLowerCase().includes(q)) ||
            (u.email && u.email.toLowerCase().includes(q)) ||
            (u.id && u.id.toLowerCase().includes(q))
          );
          renderAdminUsersTable(filtered);
        };
      }

      // 2. Fetch Real Moderation / Suspended Accounts
      let blockedTargets = [];
      try {
        const modDoc = await db.collection("settings").doc("moderation").get();
        if(modDoc.exists && Array.isArray(modDoc.data().banned_targets)){
          blockedTargets = modDoc.data().banned_targets;
        }
      } catch(e){}

      // Also gather any users with is_banned: true
      allUsers.forEach(u => {
        if(u.is_banned && !blockedTargets.some(b => (typeof b === "string" ? b === u.id : b.target === u.id || b.target === u.email))){
          blockedTargets.push({ target: u.email || u.id, reason: u.banned_reason || "Direct suspension", date: "Active" });
        }
      });

      if(blockedCountEl) blockedCountEl.textContent = `${blockedTargets.length} Suspended`;
      renderAdminBlockedTable(blockedTargets);

      // 3. Fetch Real Withdrawals from Firestore
      let withdrawalsSnap;
      try {
        withdrawalsSnap = await db.collection("withdrawals").orderBy("created_at", "desc").limit(50).get();
      } catch(e){
        withdrawalsSnap = await db.collection("withdrawals").limit(50).get();
      }

      const allWithdrawals = [];
      let pendingCount = 0;
      withdrawalsSnap.forEach(doc => {
        const w = doc.data();
        if(w.status === "pending") pendingCount++;
        allWithdrawals.push({ id: doc.id, ...w });
      });

      if(pendingWithdrawalsEl) pendingWithdrawalsEl.textContent = pendingCount;
      if(withdrawalsCountEl) withdrawalsCountEl.textContent = `${allWithdrawals.length} Total (${pendingCount} Pending)`;

      renderAdminWithdrawalsTable(allWithdrawals);

    } catch(err){
      console.error("Admin dashboard fetch error:", err);
      showToast("Error loading Firestore records: " + err.message, "\u26a0");
    }
  }

  function renderAdminUsersTable(list){
    const tbody = document.getElementById("admin-users-tbody");
    if(!tbody) return;
    if(list.length === 0){
      tbody.innerHTML = `<tr><td colspan="8" class="table-empty">No matching players in database.</td></tr>`;
      return;
    }

    const frag = document.createDocumentFragment();
    list.forEach(u => {
      const tr = document.createElement("tr");
      const inr = ((u.coins || 0) / COINS_PER_INR).toFixed(2);
      let dateStr = "Recently";
      if(u.last_active && u.last_active.toDate){
        dateStr = u.last_active.toDate().toLocaleDateString() + " " + u.last_active.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      } else if(u.created_at){
        dateStr = new Date(u.created_at).toLocaleDateString();
      }
      const type = u.is_guest || (u.id && u.id.startsWith("guest_")) ? "Guest" : (u.email ? "Email" : "Google");
      const typeBadge = type === "Guest" ? '<span class="badge-type guest">Guest</span>' : '<span class="badge-type member">Verified</span>';
      const statusBadge = u.is_banned ? '<span class="badge-status banned">Banned</span>' : '<span class="badge-status active">Active</span>';

      const banBtn = u.is_banned 
        ? `<button class="btn-table-action unban" onclick="window.adminToggleBanUser('${escapeHtml(u.id)}', true)">Unblock</button>`
        : `<button class="btn-table-action ban" onclick="window.adminToggleBanUser('${escapeHtml(u.id)}', false)">Block</button>`;

      tr.innerHTML = `
        <td>
          <div class="admin-user-cell">
            <span class="admin-user-av">${escapeHtml(u.avatar || "👤")}</span>
            <div>
              <div class="admin-user-name">${escapeHtml(u.username || "Player")}</div>
              <div class="admin-user-sub">${escapeHtml(u.email || "Device Profile")}</div>
            </div>
          </div>
        </td>
        <td><code class="admin-uid" title="${escapeHtml(u.id)}">${escapeHtml(u.id.substring(0, 10))}...</code></td>
        <td>${typeBadge}</td>
        <td><strong style="color:var(--text-white);">${(u.coins || 0).toLocaleString()}</strong></td>
        <td><span style="color:#34D399; font-weight:600;">\u20b9${inr}</span></td>
        <td>${statusBadge}</td>
        <td><span class="admin-date">${dateStr}</span></td>
        <td>
          <div class="user-action-btns">
            <button class="btn-table-action" onclick="window.adminQuickSelectUser('${escapeHtml(u.id)}')">+ Coins</button>
            <button class="btn-table-action reset" onclick="window.adminResetCoins('${escapeHtml(u.id)}')">0</button>
            ${banBtn}
          </div>
        </td>
      `;
      frag.appendChild(tr);
    });
    tbody.innerHTML = "";
    tbody.appendChild(frag);
  }

  function renderAdminBlockedTable(list){
    const tbody = document.getElementById("admin-blocked-tbody");
    if(!tbody) return;
    if(list.length === 0){
      tbody.innerHTML = `<tr><td colspan="3" class="table-empty">No accounts or emails currently suspended.</td></tr>`;
      return;
    }

    const frag = document.createDocumentFragment();
    list.forEach(b => {
      const tr = document.createElement("tr");
      const targetStr = typeof b === "string" ? b : (b.target || "N/A");
      const reasonStr = typeof b === "string" ? "Suspended" : (b.reason || "Administrative block");

      tr.innerHTML = `
        <td><code class="admin-uid" style="color:#EF4444;">${escapeHtml(targetStr)}</code></td>
        <td><span style="color:var(--text-muted); font-size:0.82rem;">${escapeHtml(reasonStr)}</span></td>
        <td>
          <button class="btn-table-action unban" onclick="window.adminUnblockTarget('${escapeHtml(targetStr)}')">Unblock</button>
        </td>
      `;
      frag.appendChild(tr);
    });
    tbody.innerHTML = "";
    tbody.appendChild(frag);
  }

  function renderAdminWithdrawalsTable(list){
    const tbody = document.getElementById("admin-withdrawals-tbody");
    if(!tbody) return;
    if(list.length === 0){
      tbody.innerHTML = `<tr><td colspan="7" class="table-empty">No withdrawal requests submitted yet.</td></tr>`;
      return;
    }

    const frag = document.createDocumentFragment();
    list.forEach(w => {
      const tr = document.createElement("tr");
      let dateStr = "Today";
      if(w.created_at && w.created_at.toDate){
        dateStr = w.created_at.toDate().toLocaleDateString() + " " + w.created_at.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      }
      const status = w.status || "pending";
      const statusBadge = status === "completed" 
        ? '<span class="status-pill completed">Completed</span>' 
        : status === "rejected" 
        ? '<span class="status-pill rejected">Rejected</span>' 
        : '<span class="status-pill pending">Pending</span>';

      const actions = status === "pending" ? `
        <div class="action-btn-group">
          <button class="btn-sm-action approve" onclick="window.adminUpdateWithdrawal('${escapeHtml(w.id)}', 'completed')">Approve</button>
          <button class="btn-sm-action reject" onclick="window.adminUpdateWithdrawal('${escapeHtml(w.id)}', 'rejected')">Reject</button>
        </div>
      ` : '<span style="color:var(--text-dim); font-size:0.78rem;">Settled</span>';

      tr.innerHTML = `
        <td><span class="admin-date">${dateStr}</span></td>
        <td><strong>${escapeHtml(w.username || "User")}</strong></td>
        <td><code>${escapeHtml(w.upi_id || "N/A")}</code></td>
        <td>${(w.coins || 0).toLocaleString()}</td>
        <td><strong style="color:#34D399;">\u20b9${(w.inr_amount || 0).toFixed(2)}</strong></td>
        <td>${statusBadge}</td>
        <td>${actions}</td>
      `;
      frag.appendChild(tr);
    });
    tbody.innerHTML = "";
    tbody.appendChild(frag);
  }

  window.adminQuickSelectUser = function(uid){
    const input = document.getElementById("admin-adjust-uid");
    if(input){
      input.value = uid;
      input.scrollIntoView({ behavior: "smooth" });
      input.focus();
      showToast(`Selected user: ${uid}`, "\u2139");
    }
  };

  window.adminResetCoins = async function(uid){
    if(!db || !state.isAdmin || !isAuthorizedAdmin(state.user)) return;
    if(!confirm(`Are you sure you want to reset coins to 0 for player ${uid}?`)) return;
    try {
      await db.collection("users").doc(uid).set({ coins: 0 }, { merge: true });
      try { await db.collection("leaderboard").doc(uid).set({ coins: 0 }, { merge: true }); } catch(e){}
      showToast(`Coins reset to 0 for ${uid}.`, "\u2713");
      loadAdminDashboard();
    } catch(err){
      showToast("Reset failed: " + err.message, "\u26a0");
    }
  };

  window.adminToggleBanUser = async function(uid, isCurrentlyBanned){
    if(!db || !state.isAdmin || !isAuthorizedAdmin(state.user)) return;
    try {
      const newStatus = !isCurrentlyBanned;
      await db.collection("users").doc(uid).set({
        is_banned: newStatus,
        banned_reason: newStatus ? "Suspended by administrator" : null,
        banned_at: newStatus ? firebase.firestore.FieldValue.serverTimestamp() : null
      }, { merge: true });

      if(newStatus){
        try { await db.collection("leaderboard").doc(uid).delete(); } catch(e){}
      } else {
        const uDoc = await db.collection("users").doc(uid).get();
        if(uDoc.exists){
          const ud = uDoc.data();
          await db.collection("leaderboard").doc(uid).set({
            uid: uid,
            username: ud.username || "Player",
            coins: ud.coins || 0,
            avatar: ud.avatar || "👤",
            hours: Number(Math.max(0.5, (ud.coins || 0) / 120).toFixed(1)),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        }
      }

      showToast(newStatus ? `Player ${uid} suspended.` : `Player ${uid} unblocked.`, "\u2713");
      loadAdminDashboard();
    } catch(err){
      showToast("Action failed: " + err.message, "\u26a0");
    }
  };

  window.adminUnblockTarget = async function(target){
    if(!db || !state.isAdmin || !isAuthorizedAdmin(state.user)) return;
    try {
      const modRef = db.collection("settings").doc("moderation");
      const modDoc = await modRef.get();
      if(modDoc.exists && Array.isArray(modDoc.data().banned_targets)){
        const list = modDoc.data().banned_targets.filter(item => 
          (typeof item === "string" ? item !== target : item.target !== target)
        );
        await modRef.set({ banned_targets: list }, { merge: true });
      }

      // Also unban in users doc
      try {
        const uDoc = await db.collection("users").doc(target).get();
        if(uDoc.exists){
          await db.collection("users").doc(target).set({ is_banned: false }, { merge: true });
        } else {
          const q = await db.collection("users").where("email", "==", target).get();
          q.forEach(async d => {
            await db.collection("users").doc(d.id).set({ is_banned: false }, { merge: true });
          });
        }
      } catch(e){}

      showToast(`Target ${target} unblocked.`, "\u2713");
      loadAdminDashboard();
    } catch(err){
      showToast("Unblock failed: " + err.message, "\u26a0");
    }
  };

  window.adminUpdateWithdrawal = async function(docId, newStatus){
    if(!db || !state.isAdmin || !isAuthorizedAdmin(state.user)) return;
    try {
      await db.collection("withdrawals").doc(docId).update({
        status: newStatus,
        processed_at: firebase.firestore.FieldValue.serverTimestamp()
      });
      showToast(`Withdrawal marked as ${newStatus}`, "\u2713");
      loadAdminDashboard();
    } catch(err){
      showToast("Error updating withdrawal: " + err.message, "\u26a0");
    }
  };

  async function handleAdminBlockForm(e){
    e.preventDefault();
    if(!db || !state.isAdmin || !isAuthorizedAdmin(state.user)) return;
    const target = document.getElementById("admin-block-target").value.trim();
    const reason = document.getElementById("admin-block-reason").value.trim() || "Administrative suspension";
    if(!target){
      showToast("Please enter an email or UID to block.", "\u26a0");
      return;
    }

    try {
      let foundUid = null;
      const directDoc = await db.collection("users").doc(target).get();
      if(directDoc.exists){
        foundUid = target;
      } else {
        const qSnap = await db.collection("users").where("email", "==", target).get();
        if(!qSnap.empty){
          foundUid = qSnap.docs[0].id;
        }
      }

      if(foundUid){
        await db.collection("users").doc(foundUid).set({
          is_banned: true,
          banned_reason: reason,
          banned_at: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        try { await db.collection("leaderboard").doc(foundUid).delete(); } catch(e){}
      }

      // Save to moderation doc
      const modRef = db.collection("settings").doc("moderation");
      const modDoc = await modRef.get();
      let list = [];
      if(modDoc.exists && Array.isArray(modDoc.data().banned_targets)){
        list = modDoc.data().banned_targets;
      }
      if(!list.some(item => (typeof item === "string" ? item === target : item.target === target))){
        list.push({ target, reason, date: new Date().toISOString() });
        await modRef.set({ banned_targets: list }, { merge: true });
      }

      showToast(`Target ${target} has been suspended.`, "\u2713");
      document.getElementById("admin-block-target").value = "";
      document.getElementById("admin-block-reason").value = "";
      loadAdminDashboard();
    } catch(err){
      showToast("Block action failed: " + err.message, "\u26a0");
    }
  }

  async function handleAdminCoinAdjust(e){
    e.preventDefault();
    if(!db || !state.isAdmin || !isAuthorizedAdmin(state.user)) return;
    const uid = document.getElementById("admin-adjust-uid").value.trim();
    const amount = parseInt(document.getElementById("admin-adjust-amount").value, 10);
    if(!uid || isNaN(amount)){
      showToast("Please enter a valid UID and coin amount.", "\u26a0");
      return;
    }

    try {
      const userRef = db.collection("users").doc(uid);
      const userDoc = await userRef.get();
      if(!userDoc.exists){
        showToast("User not found in Firestore.", "\u26a0");
        return;
      }
      const curCoins = userDoc.data().coins || 0;
      const newCoins = Math.max(0, curCoins + amount);

      await userRef.set({
        coins: newCoins,
        last_admin_adjustment: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      await db.collection("leaderboard").doc(uid).set({
        coins: newCoins
      }, { merge: true });

      if(state.user && state.user.uid === uid){
        state.user.coins = newCoins;
        setCachedUser(state.user);
        updateCoinsDisplay(newCoins);
      }

      showToast(`Updated coins for ${uid} to ${newCoins.toLocaleString()}!`, "\u2713");
      document.getElementById("admin-adjust-amount").value = "";
      loadAdminDashboard();
    } catch(err){
      showToast("Coin update failed: " + err.message, "\u26a0");
    }
  }

  // Fast Client-Side CSV Export Function
  function adminExportUsersCSV(){
    if(!state.adminUsersCache || state.adminUsersCache.length === 0){
      showToast("No user records loaded to export.", "\u26a0");
      return;
    }
    const headers = ["UID", "Username", "Email", "AccountType", "Coins", "INRValue", "Status", "LastActive"];
    const rows = state.adminUsersCache.map(u => {
      const type = u.is_guest || (u.id && u.id.startsWith("guest_")) ? "Guest" : (u.email ? "Email" : "Google");
      const inr = ((u.coins || 0) / COINS_PER_INR).toFixed(2);
      const status = u.is_banned ? "Banned" : "Active";
      let dateStr = "N/A";
      if(u.last_active && u.last_active.toDate) dateStr = u.last_active.toDate().toISOString();
      return [
        `"${u.id}"`,
        `"${(u.username || "Player").replace(/"/g, '""')}"`,
        `"${(u.email || "").replace(/"/g, '""')}"`,
        `"${type}"`,
        u.coins || 0,
        inr,
        status,
        `"${dateStr}"`
      ].join(",");
    });

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `nexplay-users-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Users CSV exported successfully!", "\u2713");
  }

  // Live Announcement Banner Controls
  async function handleAdminAnnouncement(e){
    e.preventDefault();
    if(!db || !state.isAdmin || !isAuthorizedAdmin(state.user)) return;
    const input = document.getElementById("admin-announcement-input");
    const msg = input ? input.value.trim() : "";
    try {
      await db.collection("settings").doc("announcement").set({
        message: msg,
        is_active: Boolean(msg),
        updated_at: firebase.firestore.FieldValue.serverTimestamp()
      });
      showToast(msg ? "Live announcement broadcasted!" : "Announcement cleared.", "\u2713");
    } catch(err){
      showToast("Broadcast failed: " + err.message, "\u26a0");
    }
  }

  function initAnnouncementListener(){
    if(!db) return;
    try {
      db.collection("settings").doc("announcement").onSnapshot(doc => {
        const banner = document.getElementById("global-announcement-banner");
        const textEl = document.getElementById("announcement-text");
        if(!banner || !textEl) return;
        if(doc && doc.exists && doc.data().is_active && doc.data().message){
          textEl.textContent = doc.data().message;
          banner.style.display = "flex";
        } else {
          banner.style.display = "none";
        }
      }, () => {});
    } catch(e){}
  }

  function setupAdminEventListeners(){
    // Admin access entry button
    const accessBtn = document.getElementById("admin-access-btn");
    if(accessBtn){
      accessBtn.addEventListener("click", () => {
        if(state.user && isAuthorizedAdmin(state.user)){
          state.isAdmin = true;
          sessionStorage.setItem("nx_is_admin", "true");
          updateAdminNavVisibility();
          hideAdminAuthModal();
          hideAuthGate();
          switchView("admin");
          showToast("Welcome back, Owner!", "🛡️");
        } else {
          showAdminAuthModal();
        }
      });
    }

    const cancelBtn = document.getElementById("admin-modal-cancel");
    if(cancelBtn) cancelBtn.addEventListener("click", hideAdminAuthModal);

    // Google Sign-In button for Admin verification
    const adminGoogleBtn = document.getElementById("admin-google-signin-btn");
    if(adminGoogleBtn) adminGoogleBtn.addEventListener("click", signInAdminWithGoogle);

    // Refresh, exit & export buttons
    const refreshBtn = document.getElementById("admin-refresh-btn");
    if(refreshBtn) refreshBtn.addEventListener("click", () => {
      loadAdminDashboard();
      showToast("Live data refreshed from Firestore.", "✓");
    });

    const exitBtn = document.getElementById("admin-exit-btn");
    if(exitBtn) exitBtn.addEventListener("click", () => {
      switchView("discover");
      showToast("Exited admin mode.", "ℹ");
    });

    const exportBtn = document.getElementById("admin-export-csv-btn");
    if(exportBtn) exportBtn.addEventListener("click", adminExportUsersCSV);

    // Moderation block form
    const blockForm = document.getElementById("admin-block-form");
    if(blockForm) blockForm.addEventListener("submit", handleAdminBlockForm);

    // Coin adjuster form
    const adjustForm = document.getElementById("admin-coin-adjust-form");
    if(adjustForm) adjustForm.addEventListener("submit", handleAdminCoinAdjust);

    // Announcement form & dismiss
    const annForm = document.getElementById("admin-announcement-form");
    if(annForm) annForm.addEventListener("submit", handleAdminAnnouncement);

    const clearAnnBtn = document.getElementById("admin-clear-announcement-btn");
    if(clearAnnBtn) clearAnnBtn.addEventListener("click", async () => {
      if(!db || !state.isAdmin || !isAuthorizedAdmin(state.user)) return;
      try {
        await db.collection("settings").doc("announcement").set({ is_active: false, message: "" });
        const input = document.getElementById("admin-announcement-input");
        if(input) input.value = "";
        showToast("Announcement cleared.", "\u2713");
      } catch(e){}
    });

    const annDismiss = document.getElementById("announcement-dismiss-btn");
    if(annDismiss){
      annDismiss.addEventListener("click", () => {
        const b = document.getElementById("global-announcement-banner");
        if(b) b.style.display = "none";
      });
    }

    // Listen for live announcements for all users
    initAnnouncementListener();
  }


  // -- Capacitor Android App Detection (Web-Only Filter) --
  function isCapacitorApp(){
    if(typeof window.Capacitor !== "undefined"){
      if(window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()){
        return true;
      }
      if(window.Capacitor.getPlatform && window.Capacitor.getPlatform() !== "web"){
        return true;
      }
    }
    if(window.location.protocol === "capacitor:" || window.location.protocol === "ionic:"){
      return true;
    }
    return false;
  }

  function initApkDownloadWidgets(){
    if(isCapacitorApp()){
      document.body.classList.add("is-native-app");
      const els = document.querySelectorAll(".apk-download-btn, .sidebar-apk-card, .apk-floating-banner");
      els.forEach(el => { el.style.display = "none"; });
      return;
    }

    const REAL_APK_DOWNLOAD_URL = "https://github.com/harekrushnaputhal76-commits/AUTOMATION/releases/latest/download/nexplay-arcade.apk";

    // Web Browser context: bind download feedback & link to real GitHub Release
    const downloadBtns = document.querySelectorAll(".apk-download-btn, .sidebar-apk-card, .btn-apk-banner");
    downloadBtns.forEach(btn => {
      btn.href = REAL_APK_DOWNLOAD_URL;
      btn.setAttribute("download", "nexplay-arcade.apk");
      btn.addEventListener("click", () => {
        showToast("Starting APK download from GitHub Releases...", "⬇️");
      });
    });

    // Dismissible floating banner (shown smoothly after 1.5s if not previously dismissed)
    const banner = document.getElementById("apk-floating-banner");
    const closeBtn = document.getElementById("apk-banner-close");
    const dismissed = localStorage.getItem("nx_apk_banner_dismissed");

    if(banner && !dismissed){
      setTimeout(() => {
        if(!isCapacitorApp() && banner){
          banner.style.display = "block";
        }
      }, 1500);
    }

    if(closeBtn && banner){
      closeBtn.addEventListener("click", () => {
        banner.style.display = "none";
        localStorage.setItem("nx_apk_banner_dismissed", "1");
      });
    }
  }

  // ── Bootstrap Application ──
  document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    setupEventListeners();
    setupAdminEventListeners();
    initAuth();
    initApkDownloadWidgets();
  });

})();
