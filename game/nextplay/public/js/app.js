(function(){
"use strict";
const API = "";
const AVATARS = ["👤","🎮","🕹️","🏆","⚡","🔥","💎","🦊","🐉","🤖","👾","🎯"];
const HEARTBEAT_MS = 30000;
const IDLE_MS = 60000;

let state = { token:null, user:null, currentView:"discover", gamePage:1, currentCat:"all",
  sessionId:null, sessionCoins:0, sessionStart:0, heartbeatTimer:null, idleTimer:null,
  lastActivity:Date.now(), isIdle:false, ws:null, chartActivity:null, chartPool:null, expanded:false };

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

async function api(path, opts={}){
  const h = {"Content-Type":"application/json"};
  if(state.token) h["Authorization"] = "Bearer "+state.token;
  const r = await fetch(API+path, {...opts, headers:{...h,...(opts.headers||{})}});
  if(!r.ok){ const e = await r.json().catch(()=>({})); throw new Error(e.detail||r.statusText); }
  return r.json();
}

function updateCoins(c){
  ["#sidebar-coins","#hud-coins"].forEach(s=>{const e=$(s);if(e)e.textContent=c.toLocaleString();});
}

function switchView(name){
  $$(".view").forEach(v=>v.classList.remove("active"));
  const el = $("#view-"+name);
  if(el) el.classList.add("active");
  $$(".nav-item,.mob-nav-item").forEach(b=>{
    b.classList.toggle("active",b.dataset.view===name);
  });
  const titles = {discover:"Discover",analytics:"Analytics & Prize Pool",leaderboard:"Global Rankings",
    wallet:"Wallet & Vault",profile:"Profile & Settings",admin:"Admin Center",theater:"Now Playing"};
  $("#view-title").textContent = titles[name]||name;
  state.currentView = name;
  if(name==="analytics") loadAnalytics();
  if(name==="leaderboard") loadLeaderboard();
  if(name==="wallet") loadWallet();
  if(name==="profile") loadProfile();
}

// ── Auth ──
let authMode = "login";
$$(".modal-tab").forEach(t=>t.addEventListener("click",()=>{
  authMode = t.dataset.tab;
  $$(".modal-tab").forEach(x=>x.classList.remove("active"));
  t.classList.add("active");
  $("#auth-submit").textContent = authMode==="login"?"Sign In":"Create Account";
  $("#auth-error").textContent = "";
}));

$("#auth-form").addEventListener("submit",async(e)=>{
  e.preventDefault();
  const u=$("#auth-username").value.trim(), p=$("#auth-password").value;
  if(!u||!p) return;
  try{
    const d = await api("/api/auth/"+(authMode==="login"?"login":"register"),{method:"POST",body:JSON.stringify({username:u,password:p})});
    state.token=d.token; state.user={id:d.user_id,username:d.username||u,coins:d.coins||0,
      is_admin:d.is_admin||false,avatar:d.avatar||"default",sound_enabled:d.sound_enabled!==false,
      low_spec_mode:d.low_spec_mode||false};
    localStorage.setItem("nx_token",d.token);
    localStorage.setItem("nx_user",JSON.stringify(state.user));
    enterApp();
  }catch(err){ $("#auth-error").textContent=err.message; }
});

function enterApp(){
  $("#auth-modal").style.display="none";
  $("#app").style.display="flex";
  $("#hud-user").textContent=state.user.username;
  updateCoins(state.user.coins);
  if(state.user.is_admin) $("#admin-nav").style.display="";
  if(state.user.low_spec_mode) document.body.classList.add("low-spec");
  loadGames();
  initChat();
}

// ── Auto-login ──
(function(){
  const t=localStorage.getItem("nx_token"), u=localStorage.getItem("nx_user");
  if(t&&u){ state.token=t; state.user=JSON.parse(u); enterApp(); }
})();

// ── Logout ──
$("#logout-btn").addEventListener("click",()=>{
  localStorage.removeItem("nx_token"); localStorage.removeItem("nx_user");
  state.token=null; state.user=null;
  $("#app").style.display="none"; $("#auth-modal").style.display="flex";
});

// ── Navigation ──
$$(".nav-item,.mob-nav-item").forEach(b=>b.addEventListener("click",()=>{
  if(b.dataset.view) switchView(b.dataset.view);
  $("#sidebar").classList.remove("open");
}));
$("#sidebar-toggle").addEventListener("click",()=>$("#sidebar").classList.toggle("open"));

// ── Games ──
async function loadGames(append=false){
  const search = ($("#game-search")||{}).value||"";
  try{
    const d = await api(`/api/games?page=${state.gamePage}&category=${state.currentCat}&search=${encodeURIComponent(search)}`);
    const grid = $("#game-grid");
    const skel = $("#skeleton-loader");
    if(skel) skel.remove();
    if(!append) grid.innerHTML="";
    d.games.forEach((g,i)=>{
      const card = document.createElement("div");
      card.className="game-card";
      const thumb = g.thumb || g.asset || g.image || "";
      card.innerHTML=`
        ${i<3&&state.gamePage===1?'<span class="game-card-badge">HOT</span>':""}
        <img class="game-card-thumb" src="${thumb}" alt="${g.title||""}" loading="lazy" onerror="this.style.display='none'">
        <div class="game-card-body">
          <div class="game-card-title">${g.title||"Untitled"}</div>
          <div class="game-card-cat">${g.category||"Game"}</div>
        </div>`;
      card.addEventListener("click",()=>openTheater(g));
      grid.appendChild(card);
    });
  }catch(e){ console.error(e); }
}

$$(".cat-pill").forEach(p=>p.addEventListener("click",()=>{
  $$(".cat-pill").forEach(x=>x.classList.remove("active"));
  p.classList.add("active");
  state.currentCat=p.dataset.cat; state.gamePage=1; loadGames();
}));

let searchTimer;
($("#game-search")||{}).addEventListener&&$("#game-search").addEventListener("input",()=>{
  clearTimeout(searchTimer);
  searchTimer=setTimeout(()=>{state.gamePage=1;loadGames();},300);
});

$("#load-more").addEventListener("click",()=>{ state.gamePage++; loadGames(true); });

// ── Theater ──
function openTheater(game){
  switchView("theater");
  const url = game.url || game.game_url || "";
  $("#game-iframe").src = url;
  $("#theater-title").textContent = game.title || "Game";
  $("#game-instructions-text").textContent = game.instructions || game.description || "Use keyboard/mouse.";
  startSession(game.id || game.title || "unknown");
}

$("#theater-back").addEventListener("click",()=>{
  endSession();
  $("#game-iframe").src="";
  switchView("discover");
});
$("#theater-fullscreen").addEventListener("click",()=>{
  const f=$("#game-iframe");
  if(f.requestFullscreen)f.requestFullscreen();
  else if(f.webkitRequestFullscreen)f.webkitRequestFullscreen();
});
$("#theater-expand").addEventListener("click",()=>{
  state.expanded=!state.expanded;
  $(".theater-hud").style.display=state.expanded?"none":"";
  $(".theater-miner-bar").style.display=state.expanded?"none":"";
});
let isMuted=false;
$("#theater-mute").addEventListener("click",()=>{
  isMuted=!isMuted;
  $("#theater-mute").textContent=isMuted?"🔇":"🔊";
});
$("#theater-info").addEventListener("click",()=>{
  const d=$("#game-instructions-drawer");
  d.style.display=d.style.display==="none"?"block":"none";
});

// ── Anti-Cheat Session ──
async function startSession(gameId){
  try{
    const d=await api(`/api/session/start?game_id=${encodeURIComponent(gameId)}`,{method:"POST"});
    state.sessionId=d.session_id; state.sessionCoins=0; state.sessionStart=Date.now();
    state.lastActivity=Date.now(); state.isIdle=false;
    $("#miner-hud").style.display="flex";
    $("#idle-overlay").style.display="none";
    startHeartbeat();
    startIdleDetection();
  }catch(e){ console.error(e); }
}

function startHeartbeat(){
  clearInterval(state.heartbeatTimer);
  state.heartbeatTimer = setInterval(async()=>{
    if(state.isIdle||!state.sessionId) return;
    try{
      const d=await api("/api/session/heartbeat",{method:"POST",body:JSON.stringify({session_id:state.sessionId})});
      if(d.status==="ok"){
        state.sessionCoins+=d.coins_added;
        state.user.coins+=d.coins_added;
        updateCoins(state.user.coins);
        $("#theater-session-coins").textContent=`+${state.sessionCoins} ⬡`;
        $("#miner-coins-rate").textContent=`+${d.coins_added}`;
      }else if(d.status==="expired"){ clearInterval(state.heartbeatTimer); }
    }catch(e){}
    const elapsed=Math.floor((Date.now()-state.sessionStart)/1000);
    const m=Math.floor(elapsed/60),s=elapsed%60;
    $("#theater-session-time").textContent=`${m}:${String(s).padStart(2,"0")}`;
  },HEARTBEAT_MS);
}

function startIdleDetection(){
  const events=["mousemove","mousedown","keydown","touchstart","scroll"];
  const resetIdle=()=>{
    state.lastActivity=Date.now();
    if(state.isIdle){ state.isIdle=false; $("#idle-overlay").style.display="none"; startHeartbeat(); }
  };
  events.forEach(e=>document.addEventListener(e,resetIdle,{passive:true}));
  clearInterval(state.idleTimer);
  state.idleTimer=setInterval(()=>{
    if(Date.now()-state.lastActivity>IDLE_MS&&!state.isIdle){
      state.isIdle=true; clearInterval(state.heartbeatTimer);
      $("#idle-overlay").style.display="flex";
    }
  },5000);
}

$("#resume-btn").addEventListener("click",()=>{
  state.isIdle=false; state.lastActivity=Date.now();
  $("#idle-overlay").style.display="none"; startHeartbeat();
});

async function endSession(){
  if(!state.sessionId) return;
  clearInterval(state.heartbeatTimer); clearInterval(state.idleTimer);
  try{ await api("/api/session/end",{method:"POST",body:JSON.stringify({session_id:state.sessionId})}); }catch(e){}
  state.sessionId=null; $("#miner-hud").style.display="none";
  localStorage.setItem("nx_user",JSON.stringify(state.user));
}

// ── Analytics ──
async function loadAnalytics(){
  try{
    const d=await api("/api/analytics");
    $("#stat-users").textContent=d.total_users.toLocaleString();
    $("#stat-coins").textContent=d.total_coins_mined.toLocaleString();
    $("#stat-active").textContent=d.active_gamers;
    $("#stat-pool").textContent="₹"+(d.community_prize_pool/100).toFixed(2);
    renderCharts(d);
  }catch(e){}
}

function renderCharts(d){
  const actCtx=$("#chart-activity");
  const poolCtx=$("#chart-pool");
  if(!actCtx||!poolCtx) return;
  if(state.chartActivity){state.chartActivity.destroy();}
  if(state.chartPool){state.chartPool.destroy();}
  const labels=["12am","4am","8am","12pm","4pm","8pm","Now"];
  const fakeActive=labels.map((_,i)=>Math.max(0,d.active_gamers+Math.floor(Math.random()*5-2)));
  const fakeCoins=labels.map((_,i)=>Math.floor(d.total_coins_mined*(i+1)/labels.length));
  state.chartActivity=new Chart(actCtx,{type:"line",data:{labels,datasets:[
    {label:"Active Gamers",data:fakeActive,borderColor:"#CCFF00",backgroundColor:"rgba(204,255,0,0.08)",fill:true,tension:.4},
    {label:"Coins Mined",data:fakeCoins,borderColor:"#FFB800",backgroundColor:"rgba(255,184,0,0.06)",fill:true,tension:.4,yAxisID:"y1"}
  ]},options:{responsive:true,plugins:{legend:{labels:{color:"#8E95A5"}}},scales:{
    x:{ticks:{color:"#8E95A5"},grid:{color:"#1F2433"}},
    y:{ticks:{color:"#8E95A5"},grid:{color:"#1F2433"}},
    y1:{position:"right",ticks:{color:"#FFB800"},grid:{display:false}}
  }}});
  state.chartPool=new Chart(poolCtx,{type:"doughnut",data:{
    labels:["Platform Reserve (90%)","Community Prize Pool (10%)"],
    datasets:[{data:[d.platform_reserve,d.community_prize_pool],
      backgroundColor:["#1F2433","#CCFF00"],borderColor:["#12151E","#12151E"],borderWidth:2}]
  },options:{responsive:true,plugins:{legend:{labels:{color:"#8E95A5"}}}}});
}

// ── Leaderboard ──
async function loadLeaderboard(){
  try{
    const d=await api("/api/leaderboard");
    const body=$("#leaderboard-body"); body.innerHTML="";
    d.leaderboard.forEach(p=>{
      const tierCls = p.tier==="Cyber Apex"?"tier-cyber":p.tier==="Gold"?"tier-gold":p.tier==="Silver"?"tier-silver":"tier-bronze";
      const row=document.createElement("div");
      row.className="lb-row"+(p.rank<=3?" top-3":"");
      row.innerHTML=`<span class="lb-rank">#${p.rank}</span>
        <span class="lb-name">${p.username}</span>
        <span class="lb-coins">${p.coins.toLocaleString()} ⬡</span>
        <span class="lb-hours">${p.hours}h</span>
        <span class="lb-tier ${tierCls}">${p.tier}</span>
        <span class="lb-reward">~₹${(p.coins/100*0.1).toFixed(2)}</span>`;
      body.appendChild(row);
    });
  }catch(e){}
}

// ── Wallet ──
async function loadWallet(){
  try{
    const d=await api("/api/wallet");
    state.user.coins=d.coins; updateCoins(d.coins);
    $("#wallet-coins").textContent=d.coins.toLocaleString();
    $("#wallet-inr").textContent=`= ₹${d.inr_value.toFixed(2)}`;
    const pct=Math.min(100,d.coins/d.min_redeem*100);
    $("#redeem-progress-fill").style.width=pct+"%";
    $("#redeem-status").textContent=`${d.coins} / ${d.min_redeem} Coins (${pct.toFixed(0)}%)`;
    $("#payout-badge").textContent=d.payout_status;
    const logs=$("#wallet-logs"); logs.innerHTML="";
    d.logs.forEach(l=>{
      const row=document.createElement("div"); row.className="log-row";
      const mins=Math.floor((l.playtime_seconds||0)/60);
      row.innerHTML=`<span class="log-game">${l.game_title||l.game_id}</span>
        <span class="log-coins">+${l.coins_earned} ⬡</span>
        <span class="log-time">${mins}m</span>
        <span class="log-date">${l.created_at||""}</span>`;
      logs.appendChild(row);
    });
  }catch(e){}
}

$("#converter-input").addEventListener("input",()=>{
  const v=parseInt($("#converter-input").value)||0;
  $("#converter-result").textContent=`= ₹${(v/100).toFixed(2)}`;
});

// ── Profile ──
async function loadProfile(){
  try{
    const d=await api("/api/profile");
    state.user={...state.user,...d};
    $("#profile-username").value=d.username;
    $("#profile-sound").checked=d.sound_enabled;
    $("#profile-lowspec").checked=d.low_spec_mode;
    const cur=$("#avatar-display");
    const av=AVATARS.find(a=>a===d.avatar)||"👤";
    cur.textContent=av;
    const opts=$("#avatar-options"); opts.innerHTML="";
    AVATARS.forEach(a=>{
      const el=document.createElement("div"); el.className="avatar-opt"+(a===d.avatar?" active":"");
      el.textContent=a; el.addEventListener("click",()=>{
        $$(".avatar-opt").forEach(x=>x.classList.remove("active"));
        el.classList.add("active"); cur.textContent=a;
      }); opts.appendChild(el);
    });
  }catch(e){}
}

$("#save-profile").addEventListener("click",async()=>{
  const sel=document.querySelector(".avatar-opt.active");
  const body={username:$("#profile-username").value,avatar:sel?sel.textContent:undefined,
    sound_enabled:$("#profile-sound").checked,low_spec_mode:$("#profile-lowspec").checked};
  try{
    await api("/api/profile",{method:"PUT",body:JSON.stringify(body)});
    state.user={...state.user,...body};
    localStorage.setItem("nx_user",JSON.stringify(state.user));
    if(body.low_spec_mode) document.body.classList.add("low-spec");
    else document.body.classList.remove("low-spec");
    $("#hud-user").textContent=body.username;
  }catch(e){ alert(e.message); }
});

// ── Admin ──
let adminUnlocked=false;
$("#admin-login-btn").addEventListener("click",async()=>{
  try{
    await api(`/api/admin/login?password=${encodeURIComponent($("#admin-pw").value)}`,{method:"POST"});
    adminUnlocked=true;
    $("#admin-login-gate").style.display="none";
    $("#admin-panel").style.display="flex";
    loadAdminPanel();
  }catch(e){ alert(e.message); }
});

async function loadAdminPanel(){
  try{
    const d=await api("/api/admin/settings");
    $("#admin-adstxt").value=d.settings.ads_txt||"";
    $("#admin-adsense-enabled").checked=d.settings.adsense_enabled==="true";
    $("#admin-adsense-header").value=d.settings.adsense_header||"";
    $("#admin-adsense-sidebar").value=d.settings.adsense_sidebar||"";
    $("#admin-adsense-below").value=d.settings.adsense_below_player||"";
    $("#admin-coin-rate").textContent=d.coin_per_minute;
    const list=$("#admin-users-list"); list.innerHTML="";
    d.users.forEach(u=>{
      const row=document.createElement("div"); row.className="admin-user-row";
      row.innerHTML=`<span>${u.id}</span><span>${u.username}</span>
        <span>${u.coins} ⬡</span><span>${Math.floor(u.total_playtime/60)}m</span>
        <span>${u.is_admin?"Admin":"User"}</span>`;
      list.appendChild(row);
    });
  }catch(e){}
}

$("#save-adstxt").addEventListener("click",async()=>{
  await api("/api/admin/settings",{method:"PUT",body:JSON.stringify({key:"ads_txt",value:$("#admin-adstxt").value})});
});

$("#save-adsense").addEventListener("click",async()=>{
  const pairs=[["adsense_enabled",$("#admin-adsense-enabled").checked?"true":"false"],
    ["adsense_header",$("#admin-adsense-header").value],
    ["adsense_sidebar",$("#admin-adsense-sidebar").value],
    ["adsense_below_player",$("#admin-adsense-below").value]];
  for(const [k,v] of pairs){
    await api("/api/admin/settings",{method:"PUT",body:JSON.stringify({key:k,value:v})});
  }
});

// ── Chat ──
function initChat(){
  const proto=location.protocol==="https:"?"wss:":"ws:";
  try{
    state.ws=new WebSocket(`${proto}//${location.host}/ws/chat`);
    state.ws.onopen=()=>state.ws.send(JSON.stringify({token:state.token}));
    state.ws.onmessage=(e)=>{
      const d=JSON.parse(e.data);
      if(d.type==="history") d.messages.forEach(m=>appendChat(m));
      else if(d.type==="message") appendChat(d);
      else if(d.type==="error") appendChat({username:"System",message:d.message,tier:""});
    };
    state.ws.onerror=()=>pollChat();
    state.ws.onclose=()=>setTimeout(()=>pollChat(),2000);
  }catch(e){ pollChat(); }
}

function appendChat(msg){
  const box=$("#chat-messages");
  const el=document.createElement("div"); el.className="chat-msg";
  el.innerHTML=`<span class="chat-msg-user">${msg.username||""}<span class="chat-msg-tier">${msg.tier||""}</span></span>
    <div class="chat-msg-text">${msg.message||""}</div>
    <div class="chat-msg-time">${msg.created_at?new Date(msg.created_at).toLocaleTimeString():""}</div>`;
  box.appendChild(el);
  box.scrollTop=box.scrollHeight;
}

async function pollChat(){
  try{
    const d=await api("/api/chat/messages");
    const box=$("#chat-messages"); box.innerHTML="";
    d.messages.forEach(m=>appendChat(m));
  }catch(e){}
}

function sendChat(){
  const input=$("#chat-input");
  const msg=input.value.trim();
  if(!msg) return;
  if(state.ws&&state.ws.readyState===WebSocket.OPEN){
    state.ws.send(JSON.stringify({message:msg}));
  }else{
    api("/api/chat/send",{method:"POST",body:JSON.stringify({message:msg})}).then(()=>pollChat()).catch(()=>{});
  }
  input.value="";
}

$("#chat-send").addEventListener("click",sendChat);
$("#chat-input").addEventListener("keydown",(e)=>{if(e.key==="Enter")sendChat();});
$("#chat-toggle").addEventListener("click",()=>$("#chat-drawer").classList.toggle("open"));
$("#chat-close").addEventListener("click",()=>$("#chat-drawer").classList.remove("open"));

})();