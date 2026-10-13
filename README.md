# AJAN

A first-person VHS survival-horror game for the browser. Explore a dark house, find the keys, restore the power and escape before Ajan, a gorilla, hears you, catches you and eats you. You can play alone or in co-op with proximity voice chat.

## Deploying on Render

1. Push this repository to GitHub.
2. In the Render dashboard, choose **New → Blueprint** and select the repo/branch. `render.yaml` creates a Node web service. You can also do it by hand: **New → Web Service**, build command `npm ci`, start command `npm start`.
3. Open the service URL. Single-player works immediately. For co-op, one player clicks **MULTIPLAYER → CREATE ROOM** and shares the 5-letter code, and the others join with it.

Notes:
- Render's free plan sleeps when idle, so the first visit after a while can take about 30–60 s to wake up.
- WebSockets (Socket.IO) work on Render web services with no extra configuration.
- **Voice chat** is peer-to-peer WebRTC using Google's public STUN servers, which works for most home connections. Players behind strict corporate or mobile NATs need a TURN relay. Add these environment variables on the Render service:
  - `TURN_URL`: for example `turn:your-turn-host:3478` (comma-separate several)
  - `TURN_USERNAME`
  - `TURN_CREDENTIAL`

  The server hands them to clients through `/api/config`.

## Running locally

```bash
npm install
npm start          # http://localhost:3000
```

Single-player runs entirely in your browser. The server only serves files and relays co-op traffic.

## Controls

| Key | Action |
|---|---|
| WASD / arrows | Move |
| Mouse | Look (click the game to capture the mouse) |
| Shift | Run (limited stamina, loud) |
| C / Ctrl | Crouch (quiet, harder to see) |
| F | Flashlight |
| E | Interact: open, pick up, use, hide or leave, read |
| M | Mute or unmute the microphone |
| Esc | Pause and settings |
| A / D / click | Switch the spectated player (when dead) |

## How a round works

1. Everyone spawns in the same back room after the synchronized `intro.mp4`.
2. Find the **Basement Key**. Its location is randomized between the nightstand drawer, the living-room bookshelf and the hallway table.
3. Unlock the **basement door** in the kitchen and go down the stairs.
4. Find a **Fuse** upstairs (bathroom cabinet, a kitchen drawer or the bedroom desk) and put it in the **fuse box** in the basement. The power comes back: lights, the security door and the cameras.
5. Take the **Front Door Key** from the security room. The monitors there show live, grainy camera feeds, and you can cycle them with E.
6. Unlock the front door in the living room and walk out. That plays `escape.mp4`, with `ajanescape.mp3` at its 5th second.

Locked doors show "You need a [item] for that" (or "You need power for that") for 5 seconds. Notes around the house give hints. Everything can be completed alone.

## Ajan

His AI is a state machine that runs on the host: **dormant → patrol → investigate → chase → search → patrol**, plus **kill** and **drag** (pulling you out of a hiding spot).

- **Hearing:** footsteps (crouch, walk and run are progressively louder), doors, drawers, rattling locked doors, the fuse box, and your **microphone**: speaking makes noise in proportion to how loud you are. Walls and floors reduce how far sound carries. He only gets an approximate position, never your exact one.
- **Sight:** a vision cone with line-of-sight checks against walls and closed doors. You're easier to spot with your flashlight on and harder to spot crouching in the dark.
- **Hiding:** wardrobes, the kitchen pantry and the basement locker. If he loses sight of you, he searches nearby and gives up. If he watches you climb in, he drags you out.
- **Navigation:** A* over a waypoint graph with real collision. He opens doors, which you can hear, and can't pass locked ones.
- **Kill:** grab, lift to the mouth, eat with disintegration (dissolve shader and embers), then `ajan.mp3`. During eating, MAX, MASKED, RIZE, LUCKY and MIDO play their own clip. NONE OF THESE plays nothing. Playable AJAN plays `ajandie.mp3` at the grab. The host coordinates each kill once, so no sound plays twice.

## Multiplayer architecture

- `server.js` (Express + Socket.IO) serves the client and `/assets`, manages rooms and host selection, relays messages, and handles WebRTC signalling.
- The **host's browser is the authority**. It runs Ajan, arbitrates item pickups (so nobody can take the same item twice), doors, kills, escapes, the TV, lightning and blackouts, and the session-level chase-music state. Other clients send requests and apply the host's events.
- **Replicated state:** positions and animation state at 15 Hz, Ajan at 10 Hz, names and clothing colours, speaking indicators, doors, drawers, items, power, the TV, monitor channels, kills, spectators and escapes. The house layout, item spots and painting arrangement come from a shared seed.
- **Host migration:** if the host leaves, the next player takes over Ajan from the last snapshot.
- Rooms hold up to 8 players. Joining after a round has started isn't supported.
- **Voice:** a WebRTC mesh feeds Web Audio HRTF panners with distance falloff, plus low-pass muffling and attenuation for each wall or floor between you. Dead and escaped players can talk to each other but not to the living. Spectators hear the living from the camera position. Name labels appear above heads with a mic icon while someone is actually speaking, based on voice activity rather than whether a mic is plugged in. Labels fade with distance and hide behind walls.

## Assets

Everything lives in `assets/`. These files were found and are used:

| Spec name | File used | Notes |
|---|---|---|
| `ajan.glb`, `player.glb` | same | Static Tripo meshes with no rig and no animations. They're **auto-rigged at runtime** (13-bone skeleton with smooth skin weights) and animated procedurally. |
| `menu.mp4`, `intro.mp4`, `escape.mp4` | same | `menu.webm`, `intro.webm` and `escape.webm` were generated from them and are used **only** by browsers that can't play H.264. |
| `image1.png`…`image5.png` | `1.png`…`5.png` | The uploaded names. The loader accepts either. |
| `MIDO.mp3` | `mido.mp3` | The uploaded name. The loader accepts either. |
| `rot.mp3` | not needed | ROT was removed as a character on request. |
| everything else | same | |

Missing files are reported on screen and in the console, with fallbacks: a box figure for a model, a text card for a video, plain frames for paintings, and silence for audio.

All house textures (wallpaper, floorboards, tiles, concrete, carpet, wood, rust) are generated procedurally at startup, so no extra texture files are needed.

## Settings

Saved to localStorage:
- master, music, SFX and voice volume
- microphone device, live meter, sensitivity, mute, and "hear myself" test
- mouse sensitivity and invert Y
- quality (resolution scale, shadows, light pool size)
- VHS effects (off / subtle / full)
- fullscreen
- your character, colours and name

## Known limitations

- The supplied models have no skeleton or face rig, so animation comes from an automatic rig: walking, running, crouching, turning, reaching, flailing, grabbing and eating are all procedural. Ajan's jaw doesn't open; eating is sold with the lift-to-mouth pose, head bobbing, chewing sounds and the victim disintegrating.
- Voice muffling counts walls and floors between players rather than simulating real acoustics.
- Peer-to-peer voice can fail on restrictive networks without a TURN server (see above).
- The browser can't close its own tab, so **QUIT** shows a goodbye screen.
- Development testing ran in headless Chromium with software rendering. Everything worked, but frame rates there are not representative, and the game hasn't been profiled on real GPUs.
