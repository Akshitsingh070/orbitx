# ORBITx — GitHub Tech Stack Peek (Chrome Extension)

Popup extension in the ORBITx theme (navy `#1B2559`, orange `#FF7A00`, light bg `#F4F7FE`).

## What it does
- On a **GitHub repo page** → shows that repo's tech stack (language breakdown with bars), stars/forks/language count.
- On a **GitHub profile page** → shows the user's aggregate stack across their (non-forked) repos, plus repos/followers.
- Anywhere else → friendly hint to open a GitHub tab.
- **"Full Analysis on ORBITx ↗"** button → opens https://orbitx-indol.vercel.app/ (passes `?github=<username>` for context).

## Preview server (no install needed)
```bash
cd extension
node preview-server.js
```
- http://localhost:4173/ — live preview (real GitHub API, default `vercel/next.js`; change with `?url=https://github.com/owner/repo`)
- http://localhost:4173/popup.html?mock=repo — mock repo data (works offline)
- http://localhost:4173/popup.html?mock=user — mock profile data

## Install in Chrome
1. `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select this `extension/` folder
3. Open any github.com repo/profile, click the ORBITx icon in the toolbar

## Notes
- Uses GitHub's public REST API unauthenticated (60 req/hr per IP); rate-limit errors are handled gracefully.
- Permissions are minimal: `activeTab` + `api.github.com` only.
