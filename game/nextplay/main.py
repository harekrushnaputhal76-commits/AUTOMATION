import os, time, json, sqlite3, hashlib, hmac, secrets, html, re, asyncio, unicodedata
from datetime import datetime, timedelta
from contextlib import asynccontextmanager
from typing import Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends, Query, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, PlainTextResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from pydantic import BaseModel, validator
import aiohttp
from dotenv import load_dotenv

load_dotenv()

# ── Config (ALL secrets from .env) ──
SECRET_KEY = os.getenv("SECRET_KEY", secrets.token_hex(32))
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "changeme_admin_2025")
COIN_PER_MINUTE = int(os.getenv("COIN_PER_MINUTE", "2"))
HEARTBEAT_INTERVAL = int(os.getenv("HEARTBEAT_INTERVAL", "30"))
IDLE_TIMEOUT = int(os.getenv("IDLE_TIMEOUT", "60"))
TOKEN_TTL = int(os.getenv("TOKEN_TTL", "3600"))
MAX_USERNAME_LEN = 24
DB_PATH = "gaming_portal.db"
GAME_CACHE = {"data": None, "ts": 0, "ttl": 900}
USERNAME_RE = re.compile(r"^[A-Za-z0-9_]{3,24}$")

FALLBACK_GAMES = [
    {"id":f"fb{i}","title":t,"description":d,"url":u,"thumb":"","category":c,"instructions":"Use keyboard/mouse to play."}
    for i,(t,d,u,c) in enumerate([
        ("Stack Tower","Stack blocks as high as you can!","https://html5.gamemonetize.com/StackTower/","Arcade"),
        ("Flappy Bird Clone","Tap to fly through pipes","https://html5.gamemonetize.com/FlappyBird/","Arcade"),
        ("Color Switch","Time your taps perfectly","https://html5.gamemonetize.com/ColorSwitch/","Puzzle"),
        ("2048","Slide tiles to reach 2048","https://html5.gamemonetize.com/2048/","Puzzle"),
        ("Knife Hit","Throw knives at the spinning log","https://html5.gamemonetize.com/KnifeHit/","Action"),
        ("Basketball Stars","Shoot hoops against opponents","https://html5.gamemonetize.com/BasketballStars/","Sports"),
        ("Tank Stars","Aim and destroy enemy tanks","https://html5.gamemonetize.com/TankStars/","Shooting"),
        ("Drift Boss","Drift as far as you can","https://html5.gamemonetize.com/DriftBoss/","Racing"),
        ("Temple Run 2 Online","Run and dodge obstacles","https://html5.gamemonetize.com/TempleRun2/","Action"),
        ("Candy Crush Clone","Match 3 candies","https://html5.gamemonetize.com/CandyCrush/","Puzzle"),
        ("Slither.io Clone","Eat and grow your snake","https://html5.gamemonetize.com/Slither/","Multiplayer"),
        ("Moto X3M","Ride through crazy tracks","https://html5.gamemonetize.com/MotoX3M/","Racing"),
        ("Zombie Shooter","Survive zombie waves","https://html5.gamemonetize.com/ZombieShooter/","Shooting"),
        ("Soccer Skills","Score goals with style","https://html5.gamemonetize.com/SoccerSkills/","Sports"),
        ("Tetris Classic","Classic block stacking","https://html5.gamemonetize.com/Tetris/","Arcade"),
    ],1)
]

# ── Sanitization Helper ──
CONTROL_CHAR_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
PROFANITY = {"fuck","shit","ass","bitch","damn","dick","bastard","crap"}

def sanitize(text: str, max_len: int = 200) -> str:
    text = text.strip()[:max_len]
    text = CONTROL_CHAR_RE.sub("", text)
    text = html.escape(text, quote=True)
    text = unicodedata.normalize("NFC", text)
    return text

def sanitize_profanity(text: str) -> str:
    words = text.split()
    return " ".join("***" if w.lower().strip(".,!?;:") in PROFANITY else w for w in words)

# ── Database ──
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn

def init_db():
    db = get_db()
    db.executescript("""
        CREATE TABLE IF NOT EXISTS Users (
            id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL, avatar TEXT DEFAULT 'default',
            coins INTEGER DEFAULT 0, total_playtime INTEGER DEFAULT 0,
            is_admin INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')),
            sound_enabled INTEGER DEFAULT 1, low_spec_mode INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS Sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
            game_id TEXT, started_at REAL, last_heartbeat REAL, is_active INTEGER DEFAULT 1,
            coins_earned INTEGER DEFAULT 0, total_seconds INTEGER DEFAULT 0,
            FOREIGN KEY(user_id) REFERENCES Users(id)
        );
        CREATE TABLE IF NOT EXISTS PlayLogs (
            id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
            game_id TEXT, game_title TEXT, coins_earned INTEGER, playtime_seconds INTEGER,
            created_at TEXT DEFAULT (datetime('now')), FOREIGN KEY(user_id) REFERENCES Users(id)
        );
        CREATE TABLE IF NOT EXISTS ChatMessages (
            id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, username TEXT,
            message TEXT, created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS PlatformSettings (
            key TEXT PRIMARY KEY, value TEXT
        );
        INSERT OR IGNORE INTO PlatformSettings VALUES ('ads_txt','# Add your ads.txt lines here');
        INSERT OR IGNORE INTO PlatformSettings VALUES ('adsense_enabled','false');
        INSERT OR IGNORE INTO PlatformSettings VALUES ('adsense_header','');
        INSERT OR IGNORE INTO PlatformSettings VALUES ('adsense_sidebar','');
        INSERT OR IGNORE INTO PlatformSettings VALUES ('adsense_below_player','');
        INSERT OR IGNORE INTO PlatformSettings VALUES ('total_impressions','0');
    """)
    db.commit()
    db.close()

# ── Security Headers Middleware ──
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; "
            "style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; "
            "font-src 'self' https://fonts.gstatic.com; "
            "frame-src https://html5.gamemonetize.com https://*.gamemonetize.com; "
            "img-src 'self' https: data:; "
            "connect-src 'self' wss: ws:; "
        )
        return response

# ── Lifespan ──
@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield

app = FastAPI(title="NexPlay Arcade API", lifespan=lifespan)
app.add_middleware(SecurityHeadersMiddleware)

# ── HMAC Auth with TTL ──
def hash_pw(pw: str) -> str:
    return hashlib.sha256(pw.encode()).hexdigest()

def gen_token(uid: int) -> str:
    payload = f"{uid}:{time.time()}"
    sig = hmac.new(SECRET_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}:{sig}"

TOKEN_STORE: dict[str, dict] = {}

def validate_token(token: str) -> Optional[int]:
    parts = token.split(":")
    if len(parts) != 3:
        return None
    uid_str, ts_str, sig = parts
    expected = hmac.new(SECRET_KEY.encode(), f"{uid_str}:{ts_str}".encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected):
        return None
    if (time.time() - float(ts_str)) > TOKEN_TTL:
        return None
    return int(uid_str)

def get_current_user(request: Request):
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    uid = validate_token(token)
    if uid is None:
        raise HTTPException(401, "Unauthorized or token expired")
    db = get_db()
    user = db.execute("SELECT * FROM Users WHERE id=?", (uid,)).fetchone()
    db.close()
    if not user:
        raise HTTPException(401, "User not found")
    return dict(user)

# ── Rate Limiters ──
SESSION_RATE: dict[int, float] = {}
SESSION_RATE_LIMIT = 5  # max 1 session start per 5s

chat_rate: dict[int, float] = {}
CHAT_RATE_LIMIT = 3

# ── Models with Validation ──
class AuthModel(BaseModel):
    username: str
    password: str

    @validator("username")
    def valid_username(cls, v):
        v = v.strip()
        if not USERNAME_RE.match(v):
            raise ValueError("Username: 3-24 chars, letters/numbers/underscores only")
        return v

    @validator("password")
    def valid_password(cls, v):
        if len(v) < 4 or len(v) > 128:
            raise ValueError("Password must be 4-128 characters")
        return v

class HeartbeatModel(BaseModel):
    session_id: int

class ChatInput(BaseModel):
    message: str

    @validator("message")
    def valid_message(cls, v):
        v = v.strip()
        if not v or len(v) > 200:
            raise ValueError("Message must be 1-200 characters")
        return v

class AdminSettingModel(BaseModel):
    key: str
    value: str

class ProfileUpdate(BaseModel):
    avatar: Optional[str] = None
    username: Optional[str] = None
    sound_enabled: Optional[bool] = None
    low_spec_mode: Optional[bool] = None

    @validator("username")
    def valid_username(cls, v):
        if v is None:
            return v
        v = v.strip()
        if not USERNAME_RE.match(v):
            raise ValueError("Username: 3-24 chars, letters/numbers/underscores only")
        return v

    @validator("avatar")
    def valid_avatar(cls, v):
        if v is None:
            return v
        allowed = {"default","👤","🎮","🕹️","🏆","⚡","🔥","💎","🦊","🐉","🤖","👾","🎯"}
        if v not in allowed:
            raise ValueError("Invalid avatar selection")
        return v

# ── Auth Routes ──
@app.post("/api/auth/register")
async def register(body: AuthModel):
    db = get_db()
    if db.execute("SELECT id FROM Users WHERE username=?", (body.username,)).fetchone():
        db.close(); raise HTTPException(409, "Username taken")
    cur = db.execute("INSERT INTO Users (username, password_hash) VALUES (?,?)",
                     (body.username, hash_pw(body.password)))
    db.commit(); uid = cur.lastrowid; db.close()
    token = gen_token(uid)
    return {"token": token, "user_id": uid, "username": body.username}

@app.post("/api/auth/login")
async def login(body: AuthModel):
    db = get_db()
    user = db.execute("SELECT * FROM Users WHERE username=? AND password_hash=?",
                      (body.username, hash_pw(body.password))).fetchone()
    db.close()
    if not user: raise HTTPException(401, "Invalid credentials")
    token = gen_token(user["id"])
    return {"token": token, "user_id": user["id"], "username": user["username"],
            "coins": user["coins"], "is_admin": bool(user["is_admin"]),
            "avatar": user["avatar"], "sound_enabled": bool(user["sound_enabled"]),
            "low_spec_mode": bool(user["low_spec_mode"])}

# ── Games Proxy ──
@app.get("/api/games")
async def get_games(page: int = 1, category: str = "all", search: str = ""):
    page = max(1, min(page, 50))
    search = sanitize(search, 60)
    now = time.time()
    if GAME_CACHE["data"] and (now - GAME_CACHE["ts"]) < GAME_CACHE["ttl"] and GAME_CACHE.get("page") == page:
        games = GAME_CACHE["data"]
    else:
        url = f"https://gamemonetize.com/feed.php?format=0&num=100&page={page}"
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, timeout=aiohttp.ClientTimeout(total=8)) as resp:
                    raw = await resp.json(content_type=None)
                    games = raw if isinstance(raw, list) else FALLBACK_GAMES
        except Exception:
            games = FALLBACK_GAMES
        GAME_CACHE.update({"data": games, "ts": now, "page": page})
    if category != "all":
        cat = sanitize(category, 30).lower()
        games = [g for g in games if cat in g.get("category", "").lower()]
    if search:
        s = html.unescape(search).lower()
        games = [g for g in games if s in g.get("title","").lower() or s in g.get("description","").lower()]
    return {"games": games, "total": len(games), "page": page}

# ── Session & Anti-Cheat ──
@app.post("/api/session/start")
async def session_start(game_id: str = Query(..., max_length=120), user=Depends(get_current_user)):
    now = time.time()
    uid = user["id"]
    if uid in SESSION_RATE and (now - SESSION_RATE[uid]) < SESSION_RATE_LIMIT:
        raise HTTPException(429, "Too many session starts, wait a few seconds")
    SESSION_RATE[uid] = now
    game_id = sanitize(game_id, 120)
    db = get_db()
    db.execute("UPDATE Sessions SET is_active=0 WHERE user_id=? AND is_active=1", (uid,))
    cur = db.execute("INSERT INTO Sessions (user_id,game_id,started_at,last_heartbeat) VALUES (?,?,?,?)",
                     (uid, game_id, now, now))
    db.commit(); sid = cur.lastrowid; db.close()
    return {"session_id": sid, "started_at": now}

@app.post("/api/session/heartbeat")
async def session_heartbeat(body: HeartbeatModel, user=Depends(get_current_user)):
    db = get_db()
    sess = db.execute("SELECT * FROM Sessions WHERE id=? AND user_id=? AND is_active=1",
                      (body.session_id, user["id"])).fetchone()
    if not sess:
        db.close(); raise HTTPException(400, "No active session")
    now = time.time()
    elapsed = now - sess["last_heartbeat"]
    if elapsed < (HEARTBEAT_INTERVAL - 5):
        db.close(); raise HTTPException(429, "Heartbeat too fast — anti-cheat triggered")
    if elapsed > (IDLE_TIMEOUT + 30):
        db.execute("UPDATE Sessions SET is_active=0 WHERE id=?", (body.session_id,))
        db.commit(); db.close()
        return {"status": "expired", "coins_added": 0}
    coins = int((elapsed / 60) * COIN_PER_MINUTE)
    coins = max(0, min(coins, COIN_PER_MINUTE * 2))
    db.execute("UPDATE Sessions SET last_heartbeat=?, coins_earned=coins_earned+?, total_seconds=total_seconds+? WHERE id=?",
               (now, coins, int(elapsed), body.session_id))
    db.execute("UPDATE Users SET coins=coins+?, total_playtime=total_playtime+? WHERE id=?",
               (coins, int(elapsed), user["id"]))
    db.commit(); db.close()
    return {"status": "ok", "coins_added": coins, "elapsed": int(elapsed)}

@app.post("/api/session/end")
async def session_end(body: HeartbeatModel, user=Depends(get_current_user)):
    db = get_db()
    sess = db.execute("SELECT * FROM Sessions WHERE id=? AND user_id=?",
                      (body.session_id, user["id"])).fetchone()
    if sess:
        db.execute("UPDATE Sessions SET is_active=0 WHERE id=?", (body.session_id,))
        db.execute("INSERT INTO PlayLogs (user_id,game_id,game_title,coins_earned,playtime_seconds) VALUES (?,?,?,?,?)",
                   (user["id"], sess["game_id"], sess["game_id"], sess["coins_earned"], sess["total_seconds"]))
        db.commit()
    db.close()
    return {"status": "ended"}

# ── Wallet & Profile ──
@app.get("/api/wallet")
async def get_wallet(user=Depends(get_current_user)):
    db = get_db()
    logs = [dict(r) for r in db.execute(
        "SELECT * FROM PlayLogs WHERE user_id=? ORDER BY created_at DESC LIMIT 50", (user["id"],)).fetchall()]
    db.close()
    return {"coins": user["coins"], "total_playtime": user["total_playtime"],
            "inr_value": round(user["coins"] / 100, 2), "logs": logs,
            "min_redeem": 1000, "min_redeem_inr": 10.0,
            "payout_status": "Season 1 Coin Stacking Active — UPI & Voucher Payouts Unlock in Upcoming v2.0 Update!"}

@app.get("/api/profile")
async def get_profile(user=Depends(get_current_user)):
    return {"id": user["id"], "username": user["username"], "avatar": user["avatar"],
            "coins": user["coins"], "total_playtime": user["total_playtime"],
            "sound_enabled": bool(user["sound_enabled"]), "low_spec_mode": bool(user["low_spec_mode"])}

@app.put("/api/profile")
async def update_profile(body: ProfileUpdate, user=Depends(get_current_user)):
    db = get_db()
    if body.username:
        existing = db.execute("SELECT id FROM Users WHERE username=? AND id!=?", (body.username, user["id"])).fetchone()
        if existing: db.close(); raise HTTPException(409, "Username taken")
        db.execute("UPDATE Users SET username=? WHERE id=?", (body.username, user["id"]))
    if body.avatar:
        db.execute("UPDATE Users SET avatar=? WHERE id=?", (body.avatar, user["id"]))
    if body.sound_enabled is not None:
        db.execute("UPDATE Users SET sound_enabled=? WHERE id=?", (int(body.sound_enabled), user["id"]))
    if body.low_spec_mode is not None:
        db.execute("UPDATE Users SET low_spec_mode=? WHERE id=?", (int(body.low_spec_mode), user["id"]))
    db.commit(); db.close()
    return {"status": "updated"}

# ── Leaderboard & Analytics ──
@app.get("/api/leaderboard")
async def leaderboard():
    db = get_db()
    rows = [dict(r) for r in db.execute(
        "SELECT id,username,avatar,coins,total_playtime FROM Users ORDER BY coins DESC LIMIT 50").fetchall()]
    db.close()
    for i, r in enumerate(rows):
        hrs = r["total_playtime"] / 3600
        r["rank"] = i + 1
        r["hours"] = round(hrs, 1)
        r["tier"] = "Cyber Apex" if r["coins"] >= 10000 else "Gold" if r["coins"] >= 5000 else "Silver" if r["coins"] >= 1000 else "Bronze"
    return {"leaderboard": rows}

@app.get("/api/analytics")
async def analytics():
    db = get_db()
    total_users = db.execute("SELECT COUNT(*) c FROM Users").fetchone()["c"]
    total_coins = db.execute("SELECT COALESCE(SUM(coins),0) c FROM Users").fetchone()["c"]
    active_sessions = db.execute("SELECT COUNT(*) c FROM Sessions WHERE is_active=1").fetchone()["c"]
    impressions = int(db.execute("SELECT value FROM PlatformSettings WHERE key='total_impressions'").fetchone()["value"])
    db.close()
    pool_total = total_coins
    platform_share = round(pool_total * 0.9, 2)
    community_share = round(pool_total * 0.1, 2)
    return {"total_users": total_users, "total_coins_mined": total_coins,
            "active_gamers": active_sessions, "estimated_impressions": impressions,
            "platform_reserve": platform_share, "community_prize_pool": community_share}

# ── Admin ──
def admin_guard(user=Depends(get_current_user)):
    if not user["is_admin"]:
        raise HTTPException(403, "Admin only")
    return user

@app.post("/api/admin/login")
async def admin_login(password: str = Query(...)):
    if not hmac.compare_digest(password, ADMIN_PASSWORD):
        raise HTTPException(401, "Wrong admin password")
    return {"status": "ok"}

@app.post("/api/admin/promote")
async def admin_promote(user_id: int = Query(...), password: str = Query(...)):
    if not hmac.compare_digest(password, ADMIN_PASSWORD):
        raise HTTPException(401, "Wrong admin password")
    db = get_db(); db.execute("UPDATE Users SET is_admin=1 WHERE id=?", (user_id,)); db.commit(); db.close()
    return {"status": "promoted"}

@app.get("/api/admin/settings")
async def admin_get_settings(user=Depends(admin_guard)):
    db = get_db()
    settings = {r["key"]: r["value"] for r in db.execute("SELECT * FROM PlatformSettings").fetchall()}
    users = [dict(r) for r in db.execute("SELECT id,username,coins,total_playtime,is_admin,created_at FROM Users").fetchall()]
    db.close()
    return {"settings": settings, "users": users, "coin_per_minute": COIN_PER_MINUTE}

@app.put("/api/admin/settings")
async def admin_update_setting(body: AdminSettingModel, user=Depends(admin_guard)):
    db = get_db()
    db.execute("INSERT OR REPLACE INTO PlatformSettings (key,value) VALUES (?,?)", (body.key, sanitize(body.value, 5000)))
    db.commit(); db.close()
    return {"status": "updated"}

# ── ads.txt Route ──
@app.get("/ads.txt", response_class=PlainTextResponse)
async def ads_txt():
    db = get_db()
    content = db.execute("SELECT value FROM PlatformSettings WHERE key='ads_txt'").fetchone()
    db.close()
    return content["value"] if content else ""

@app.get("/api/adsense-config")
async def adsense_config():
    db = get_db()
    settings = {r["key"]: r["value"] for r in db.execute("SELECT * FROM PlatformSettings").fetchall()}
    db.close()
    return {"enabled": settings.get("adsense_enabled","false") == "true",
            "header_slot": settings.get("adsense_header",""),
            "sidebar_slot": settings.get("adsense_sidebar",""),
            "below_player_slot": settings.get("adsense_below_player","")}

# ── WebSocket Chat (sanitized) ──
chat_connections: list[dict] = []

@app.websocket("/ws/chat")
async def websocket_chat(websocket: WebSocket):
    await websocket.accept()
    user_info = None
    try:
        auth = await websocket.receive_text()
        data = json.loads(auth)
        token = data.get("token", "")
        uid = validate_token(token)
        if uid:
            db = get_db()
            u = db.execute("SELECT id,username,coins FROM Users WHERE id=?", (uid,)).fetchone()
            db.close()
            if u:
                user_info = dict(u)
                tier = "Cyber Apex" if u["coins"]>=10000 else "Gold" if u["coins"]>=5000 else "Silver" if u["coins"]>=1000 else "Bronze"
                user_info["tier"] = tier
                chat_connections.append({"ws": websocket, "user": user_info})
                recent = get_db()
                msgs = [dict(r) for r in recent.execute(
                    "SELECT username,message,created_at FROM ChatMessages ORDER BY id DESC LIMIT 30").fetchall()]
                recent.close()
                await websocket.send_text(json.dumps({"type":"history","messages":list(reversed(msgs))}))
        if not user_info:
            await websocket.close(code=4001); return
        while True:
            raw = await websocket.receive_text()
            msg_data = json.loads(raw)
            text = sanitize(msg_data.get("message",""), 200)
            if not text: continue
            now = time.time()
            if user_info["id"] in chat_rate and (now - chat_rate[user_info["id"]]) < CHAT_RATE_LIMIT:
                await websocket.send_text(json.dumps({"type":"error","message":"Slow down! 1 msg per 3s"}))
                continue
            chat_rate[user_info["id"]] = now
            text = sanitize_profanity(text)
            db = get_db()
            db.execute("INSERT INTO ChatMessages (user_id,username,message) VALUES (?,?,?)",
                       (user_info["id"], user_info["username"], text))
            db.commit(); db.close()
            broadcast = json.dumps({"type":"message","username":user_info["username"],
                                    "tier":user_info["tier"],"message":text,
                                    "created_at":datetime.utcnow().isoformat()})
            for conn in chat_connections:
                try: await conn["ws"].send_text(broadcast)
                except: pass
    except WebSocketDisconnect:
        pass
    finally:
        chat_connections[:] = [c for c in chat_connections if c["ws"] != websocket]

# ── Chat Fallback (polling, sanitized) ──
@app.get("/api/chat/messages")
async def get_chat_messages(user=Depends(get_current_user)):
    db = get_db()
    msgs = [dict(r) for r in db.execute(
        "SELECT username,message,created_at FROM ChatMessages ORDER BY id DESC LIMIT 50").fetchall()]
    db.close()
    return {"messages": list(reversed(msgs))}

@app.post("/api/chat/send")
async def send_chat_message(body: ChatInput, user=Depends(get_current_user)):
    now = time.time()
    uid = user["id"]
    if uid in chat_rate and (now - chat_rate[uid]) < CHAT_RATE_LIMIT:
        raise HTTPException(429, "Rate limit: 1 message per 3 seconds")
    chat_rate[uid] = now
    text = sanitize(body.message, 200)
    if not text: raise HTTPException(400, "Empty message after sanitization")
    text = sanitize_profanity(text)
    db = get_db()
    db.execute("INSERT INTO ChatMessages (user_id,username,message) VALUES (?,?,?)",
               (uid, user["username"], text))
    db.commit(); db.close()
    return {"status": "sent"}

# ── Static Files & SPA fallback ──
app.mount("/", StaticFiles(directory="public", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
