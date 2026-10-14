# AJAN

A first-person VHS survival-horror game for the browser. Explore a dark house, find the keys, restore the power and escape before Ajan, a gorilla, hears you, catches you and eats you. You can play alone or in co-op with proximity voice chat.

## Deploying on Render

1. Push this repository to GitHub.
2. In the Render dashboard, create a **Web Service** (**New → Web Service**) from the repo/branch, with build command `npm ci` and start command `npm start`. An existing Web Service redeploys from its branch as usual; no Blueprint is needed.
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

## The house

Four levels, connected by real walkable staircases and an elevator:

| Level | Height | Rooms |
|---|---|---|
| **Attic** | +6.8 m | One big room under the roof: the cinema TV and VCR, sofas, crates. **Safe zone.** |
| **Upstairs** | +3.4 m | Master bedroom, upstairs bathroom (the mirror), guest room (the phone), storage room, **Ajan's bedroom**, hallway, nursery, library, music room |
| **Ground floor** | 0 m | Living room (front door), back room (spawn), two bedrooms, bathroom, security room, office, hallway, kitchen, dining room |
| **Basement** | −3.2 m | Main basement (fuse box), boiler room, workshop |

- **Basement stairs:** from the kitchen-side hallway, behind the locked basement door.
- **Grand staircase:** at the east end of the house, from the dining-room side up to the upstairs hallway.
- **Attic stairs:** behind a door in the upstairs hallway.
- **Elevator:** east side, stops on all four floors. It is locked until someone finds the **Elevator Key** in a drawer. The basement stop only works once the basement door is unlocked, or if the rider holds the basement key. It is loud, and Ajan hears it.

### The attic safe zone

Ajan never paths into the attic or onto the upper part of the attic stairs. He can't see, hear, attack or grab anyone there, and if he chases you up the stairs he gives up at the safe line. Noise you make in the attic doesn't count.

## How a round works

1. Everyone spawns in the back room after the synchronized `intro.mp4`.
2. Find the **Office Key** on the ground floor: living-room bookshelf, hallway table or a side cabinet.
3. The **office desk** drawer holds the **Basement Key**. Unlock the basement door.
4. Find the **Bolt Cutters** in the basement workshop or boiler room.
5. Find the **Storage Key** in an upstairs bedroom drawer (master, guest or nursery). The **storage room** holds the **Fuse**.
6. Put the fuse in the **fuse box** in the basement. Power returns: lights, cameras and the security-room door.
7. Take the **Front Door Key** from the security room.
8. **Cut the chain** on the front door with the bolt cutters, unlock it and walk out. That plays `escape.mp4`, with `ajanescape.mp3` at its 5th second.

Optional: the **Elevator Key** is in a ground-floor drawer (kitchen, desk, bathroom or nightstand).

The HUD objective always shows the next step. Locked doors say what they need ("You need an Office Key for that", "You need power for that"). Notes around the house give hints. Item spots are randomized from a shared seed, and everything can be done alone. If someone escapes while carrying items, those items drop inside the front door for everyone else.

## Things in the house

- **Crawl spaces:** beds and tables can be hidden under, as well as closets (eight crawl spaces and eight closets in total). The hiding view sits low and looks out into the room.
- **Radios:** one in the library (upstairs), one in the basement. Turned on, they play muffled music and static for 25 s, and Ajan walks over and switches them off. Use them as a lure.
- **Boombox (music room):** plays a random character's death sound. Ajan can't hear it.
- **Phone (guest room):** while someone is in the room, every 15 s there's a 30 % chance it rings and plays 10 random seconds of `cinema.mp4`'s audio through a telephone filter. Ajan can't hear it.
- **Cinema TV (attic):** press E on the TV to play `cinema.mp4` with its sound, again to pause or resume. Use the VCR to restart. In co-op it is synchronized for everyone, including pause and restart.
- **Mirror (upstairs bathroom):** a blood message that changes each time you come back.
- **Jelly:** a big wobbling `object.glb` stands in a random bedroom (guest, nursery or a ground-floor bedroom). Its base is fixed to the floor and its top half jiggles. Bumping into it makes it bounce with a *boing*. Ajan can't hear it.
- **Creaky floorboards:** 2–3 per dangerous floor (none in the attic), slightly lighter than the boards around them. Stepping on one makes a loud creak, and Ajan comes to that exact spot. Each board has a 2.5 s cooldown, so it can't be spammed.
- **Atmosphere:** separate ambience beds for the basement, ground floor, upstairs and attic; blood trails and splatter; bones in Ajan's room; notes.

## Ajan

His AI is a state machine that runs on the host:
- The main loop is **dormant → patrol → investigate → chase → search → patrol**.
- **kill** and **drag** pull you out of a hiding spot.
- **inspect** checks hiding spots.
- **gotobed → sleep** and **gotochair → sit** are his rests.

- **Patrol:** he works through all of his floors (basement, ground floor, upstairs), preferring the rooms he visited least recently, with a bias toward floors players are on. While patrolling he quietly **whispers** (`ajan.mp3`).
- **Hearing:** footsteps (crouch is almost silent, walking is quiet, running is loud), doors, drawers, locked-door rattles, floorboards, radios, the elevator, and your **microphone** (scaled by your microphone volume).
  - Each wall or closed door between you and him reduces how far a sound carries. Each floor between you reduces it much more, but less so near a staircase.
  - Normal sounds give him an approximate position. Floorboards and radios give him the exact spot.
- **Sight:** a vision cone with line-of-sight checks. Different floors only see each other along a staircase.
- **Losing you:** he searches nearby and then gives up, often with a quiet **laugh** (the first 3 s of `sleep.mp3`).
- **Hiding:** sometimes he walks straight past a quiet hider. Sometimes he walks up to your closet or bed, stares at it and smiles.
  - If he **didn't** see you get in (and you stayed quiet), he leaves laughing.
  - If he **saw** you get in, or you made noise, he opens it, drags you out and eats you.
- **Sleep:** every 3–4 minutes he goes to his bedroom upstairs and naps for about 30 s, lying on his bed and breathing slowly while `sleep.mp3` plays from the bed. While asleep he is blind and hears much less, though a loud enough noise wakes him. He never falls asleep mid-chase.
- **Chair:** now and then he sits in a chair facing the wall for 15–25 s. Noise gets him up.
- **Navigation:** A* over an auto-generated waypoint graph covering every room, the doorways and all staircases, with real collision. He opens doors, which you can hear, and can't pass locked ones. He never uses the elevator or enters the attic.
- **Kill:** grab, lift to the mouth, eat with disintegration (dissolve shader and embers), then `ajan.mp3`.
  - During eating, MAX, MASKED, RIZE, LUCKY and MIDO play their own clip. NONE OF THESE plays nothing.
  - Playable AJAN plays `ajandie.mp3` at the grab.
  - The host coordinates each kill once, so no sound plays twice.

## Multiplayer architecture

- `server.js` (Express + Socket.IO) serves the client and `/assets`, manages rooms and host selection, relays messages, and handles WebRTC signalling.
- The **host's browser is the authority**. It runs Ajan, arbitrates item pickups (so nobody can take the same item twice), doors, kills, escapes, the TV, lightning and blackouts, and the session-level chase-music state. Other clients send requests and apply the host's events.
- **Replicated state:** positions and animation state at 15 Hz, Ajan at 10 Hz, names and clothing colours, speaking indicators, doors, drawers, items, power, the TV, monitor channels, the elevator (car position from server time), the attic cinema (play/pause position from server time), radios, the boombox, the phone, the mirror message, the jelly, kills, spectators and escapes. The house layout, item spots and painting arrangement come from a shared seed.
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
| `cinema.mp4` | same | The attic TV and the phone. Only the H.264 original is used (see limitations). |
| `sleep.mp3` | same | Ajan sleeping (looped from his bed). The first 3 s are his laugh. |
| `object.glb` | same | The jelly. |
| `rot.mp3` | not needed | ROT was removed as a character on request. |
| everything else | same | |

Missing files are reported on screen and in the console, with fallbacks: a box figure for a model, a text card for a video, plain frames for paintings, and silence for audio.

All house textures (wallpaper, floorboards, tiles, concrete, carpet, wood, rust) are generated procedurally at startup, so no extra texture files are needed.

## Settings

Saved to localStorage:
- master, music, SFX and voice volume
- microphone device, live meter, **sensitivity**, **microphone volume**, mute, and "hear myself" test
  - **Sensitivity** only decides *when* you count as speaking: the threshold for voice activity, the speaking icon, and Ajan hearing you.
  - **Microphone volume** (0–200 %, default 100 %) changes *how loud* other players hear you. It is a gain stage on the transmitted voice, followed by a limiter so 200 % doesn't clip. The "Others hear" meter shows the processed signal. It also scales how far Ajan hears you talk.
- mouse sensitivity and invert Y
- quality (resolution scale, shadows, light pool size)
- VHS effects (off / subtle / full)
- fullscreen
- your character, colours and name

## Known limitations

- The supplied models have no skeleton or face rig, so animation comes from an automatic rig: walking, running, crouching, turning, reaching, flailing, grabbing and eating are all procedural. Ajan's jaw doesn't open; eating is sold with the lift-to-mouth pose, head bobbing, chewing sounds and the victim disintegrating.
- Voice muffling counts walls and floors between players rather than simulating real acoustics.
- Peer-to-peer voice can fail on restrictive networks without a TURN server (see above).
- `cinema.mp4` is H.264/AAC, used as delivered with no substitute file. Chrome, Edge, Safari and Firefox play it. A browser build without H.264 support (some Linux Chromium builds, including the headless test browser) shows "VIDEO UNAVAILABLE IN THIS BROWSER" on the attic TV, and the phone stays silent.
- The browser can't close its own tab, so **QUIT** shows a goodbye screen.
- Development testing ran in headless Chromium with software rendering. Everything worked, but frame rates there are not representative, and the game hasn't been profiled on real GPUs.
