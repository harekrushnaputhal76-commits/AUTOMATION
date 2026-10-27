# NexPlay Arcade — Cloud HTML5 Gaming Portal & Play-to-Earn Points Ecosystem

A flagship, commercial-grade gaming portal inspired by Steam Deck UI, Razer Axon, and CrazyGames Pro.
100+ live HTML5 games from GameMonetize, coin mining anti-cheat engine, 10% prize pool, live chat, and full admin panel.

## Tech Stack
- **Frontend:** Semantic HTML5 + Bespoke CSS3 + Vanilla ES6+ JavaScript
- **Backend:** Python FastAPI + SQLite3 + WebSockets
- **Mobile:** Capacitor.js (Android APK ready)
- **Charts:** Chart.js (CDN)
- **Fonts:** Space Grotesk, Chakra Petch, JetBrains Mono (Google Fonts)

## Features
- 100+ live games from GameMonetize with 15-min server cache
- 15 offline fallback games
- Anti-cheat heartbeat coin miner (2 coins/min, server-verified)
- Idle detection with auto-pause after 60s
- 100 Coins = ₹1 economy with Season 1 payout tracking
- 10% Community Prize Pool engine
- Global leaderboard with tier badges (Bronze/Silver/Gold/Cyber Apex)
- Live WebSocket chat with profanity filter & rate limiting
- Admin panel: ads.txt editor, AdSense toggle, user management
- Responsive: 4K → Mobile with bottom nav
- Low-Spec PC mode (disables blur/animations)
- Capacitor-ready for Android APK

## Local Development
```bash
# Install Python dependencies
pip install -r requirements.txt

# Run the server
python main.py
# or
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Open http://localhost:8000
```

## Deploy to Render
1. Create a new **Web Service** on [render.com](https://render.com)
2. Connect this repo
3. Build Command: `pip install -r requirements.txt`
4. Start Command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Add environment variables from `.env.example`

## Build Android APK (Capacitor)
```bash
npm install
npx cap add android
npx cap sync
npx cap open android
# Build APK in Android Studio
```

## Project Structure
```
├── main.py                 # FastAPI backend
├── requirements.txt        # Python dependencies
├── package.json            # Node/Capacitor config
├── capacitor.config.json   # Capacitor settings
├── .env.example            # Environment variables template
├── .gitignore
├── README.md
└── public/
    ├── index.html          # SPA frontend
    ├── ads.txt             # Ad verification
    ├── css/style.css       # Bespoke design system
    └── js/app.js           # Application logic
```

## Environment Variables
| Variable | Default | Description |
|----------|---------|-------------|
| ADMIN_PASSWORD | changeme_admin_2025 | Admin panel password |
| COIN_PER_MINUTE | 2 | Coins earned per verified minute |
| HEARTBEAT_INTERVAL | 30 | Heartbeat interval in seconds |
| IDLE_TIMEOUT | 60 | Idle timeout in seconds |

## License
Private — All rights reserved.
