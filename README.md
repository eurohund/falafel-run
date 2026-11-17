# Falafel Run

A two-player runner for a TV. The game runs on the big screen, phones are the controllers.

- `index.html` is the TV screen: the game plus two QR codes, GO and JUMP.
- `pad.html` is the phone controller: one full-screen button. `?k=go` or `?k=jump`.
- `game.js` is the game itself.
- `firebase-config.js` holds the Firebase web config. Fill it in.
- `database.rules.json` holds the Realtime Database rules. Paste them in the Firebase console.

## How it plays

- One player holds GO to move the character forward, the other taps JUMP.
- Scanning a code that is already taken steals that button.
- If a role is free, a bot plays it, so one person can play alone.
- A giant falafel rolls behind and speeds up. Caught means game over.

## Setup

1. Firebase console: create a project, add a Realtime Database, paste `database.rules.json` into Rules.
2. Add a Web app in Project settings and copy its config into `firebase-config.js`.
3. Host the folder over https (GitHub Pages works) and open `index.html` on the TV.

Without Firebase the TV page still runs with a keyboard: Right arrow moves, Space or Enter jumps.
