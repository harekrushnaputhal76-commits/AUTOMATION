# NexPlay Arcade & Cloud Gaming Portal

A commercial-grade, high-performance HTML5 gaming portal and play-to-earn ecosystem inspired by Steam Deck UI and Razer.

---

## ⚡ Quick Start

### 1. Run with 1-Click (Windows)
Double-click `game/run.bat` or run:
```powershell
cd game\nextplay
python main.py
```

### 2. Manual Startup
```bash
cd game/nextplay
pip install -r requirements.txt
python main.py
```
Open **[http://localhost:8000](http://localhost:8000)** in your browser.

---

## ✨ Features
- **Direct Edge Fetch:** 100+ live HTML5 games fetched directly from GameMonetize.
- **Hardware-Accelerated 60FPS UI:** Deep Void (`#05050A`), Neon Cyan (`#00F0FF`), and Hyper Pink (`#FF007A`) aesthetic.
- **Instant Home Page:** Direct access without mandatory login barriers; seamless guest account provisioning.
- **Bento Grid:** High-performance grid with `loading="lazy"`, `decoding="async"`, and `DocumentFragment` batch DOM rendering.
- **Anti-Cheat Coin Miner:** Server-verified heartbeat with idle auto-pause.
- **Ranks & Leaderboard:** Top-3 podium view with tier badges (Cyber Apex, Gold, Silver, Bronze).
- **Wallet & Vault:** Live coin-to-INR conversions and transaction history.
- **Admin Control Panel:** Live ads.txt editor, AdSense slots, and user management.
- **Mobile APK Ready:** Pre-configured with Capacitor for Android deployment.

---

## 📁 Repository Structure

```
├── README.md
└── game/
    ├── run.bat
    └── nextplay/
        ├── main.py                 # FastAPI backend with CORS & security headers
        ├── requirements.txt        # Python dependencies
        ├── package.json            # Capacitor mobile configuration
        ├── capacitor.config.json   # Android APK settings
        ├── .env.example            # Environment variables template
        ├── .gitignore
        ├── README.md
        └── public/
            ├── index.html          # Bento-grid gaming portal
            ├── favicon.svg         # Arcade branding icon
            ├── ads.txt             # Verified GameMonetize & AdSense ads.txt
            ├── css/style.css       # Deep Void 60FPS bespoke design system
            └── js/app.js           # Direct feed fetch & DocumentFragment rendering
```
