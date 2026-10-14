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
| Left click | Fire the revolver (once you have it) |
| W (in the driver's seat) | Drive the car out through the garage door (once it's fixed) |
| 1 / 2 / 3 / 4 | Inside the elevator: basement / ground / upstairs / attic |
| M | Mute or unmute the microphone |
| Esc | Pause and settings |
| A / D / click | Switch the spectated player (when dead) |

## Difficulty

**Easy / Medium / Hard** changes how well Ajan hears (see *Ajan → Hearing*) and how fast the nursery spider is.
- **Solo:** set it in **Settings → Gameplay → Difficulty**.
- **Co-op:** the host picks it in the lobby (default: their Settings value). Everyone sees it there, and it applies to the whole room.
- The start message shows it, e.g. `[HARD]`.

## Free play

**Settings → FREE PLAY** (at the bottom, only from the main menu) starts a normal single-player game in which Ajan never comes home: you can't die, and everything else (keys, puzzles, elevator, cinema, props, escape) works as usual. **Restart** on the end screen keeps you in free play.

## The house

Four levels, connected by real walkable staircases and an elevator:

| Level | Height | Rooms |
|---|---|---|
| **Attic** | +6.8 m | One big room under the roof: the cinema TV and VCR, sofas, crates. **Safe zone.** |
| **Upstairs** | +3.4 m | Master bedroom with its dressing room, upstairs bathroom (the mirror) and linen room, guest room (the phone), storage room, **Ajan's bedroom**, hallway, nursery (the spider), library, music room, sitting room |
| **Ground floor** | 0 m | Living room (front door) and parlor (fireplace), back room (spawn), bedroom with a walk-in wardrobe, bathroom and laundry room, child's bedroom and playroom, security room and archive, office and reception, hallway, kitchen and mudroom (basement door), dining room |
| **Basement** | −3.2 m | Main basement (fuse box), boiler room, **garage** (the car, and a garage door out to the driveway) |

- **Basement stairs:** from the kitchen-side hallway, behind the locked basement door.
- **Room sizes:** the big open rooms were split with interior walls and doors into rooms of a normal size (a bedroom plus a walk-in wardrobe, a bathroom plus a laundry, a kitchen plus a mudroom, and so on). Every room has its own light, wallpaper and furniture arranged around a focal point: the bed against a wall with nightstands, the sofa facing the TV, armchairs around the fireplace.
- Pictures are never hung over a doorway; the house checks this when it builds.
- **Grand staircase:** at the east end of the house, from the dining-room side up to the upstairs hallway.
- **Attic stairs:** behind a door in the upstairs hallway.
- **Elevator:** east side, stops on all four floors. Inside the car is a brass panel with four big labelled buttons (B BASEMENT, 1 GROUND, 2 UPSTAIRS, A ATTIC); aim at one and press E, or press 1–4 while standing in the car. Each landing has a call button next to the doors. It is locked until someone finds the **Elevator Key** in a drawer. The basement stop only works once the basement door is unlocked, or if the rider holds the basement key. It is loud, and Ajan hears it.

### Dead or spectating

Once you're dead (or escaped and watching), the view brightens: higher exposure, more ambient light and a soft light following the camera, so you can follow what's happening.

### The attic safe zone

Ajan never paths into the attic or onto the upper part of the attic stairs. He can't see, hear, attack or grab anyone there, and if he chases you up the stairs he gives up at the safe line. Noise you make in the attic doesn't count.

## How a round works

1. Everyone spawns in the back room after the synchronized `intro.mp4`.
2. Find the **Office Key** on the ground floor: living-room bookshelf, hallway table or a side cabinet.
3. The **office desk** drawer holds the **Basement Key**. Unlock the basement door.
4. Find the **Bolt Cutters** in the basement workshop or boiler room.
5. Take the **Storage Key** from the crib in the **nursery** (upstairs), past the spider (see below). The **storage room** holds the **Fuse**.
6. Put the fuse in the **fuse box** in the basement. Power returns: lights, cameras and the security-room door.
7. Take the **Front Door Key** from the security room.
8. **Cut the chain** on the front door with the bolt cutters, unlock it and walk out. That plays `escape.mp4`, with `ajanescape.mp3` at its 5th second.

Optional:
- the **Elevator Key** is in a ground-floor drawer (kitchen, desk, bathroom or nightstand);
- the **Weapon Key** is hidden somewhere in the house (a different spot each game). It opens the **safe**, which also stands in one of three places (dressing room, basement or sitting room) and holds the **revolver**.
- **Garage escape** (an alternative to the front door): find the four car parts and fix the car in the basement garage (see below).

### The nursery spider

A huge spider sits in the far (south-east) corner of the nursery and waits. The storage key is on the crib in the opposite corner.
- Walking or crouching through the room is fine. **Running** in there, or **going for the key** (getting within about 2.5 m of the crib), sets it off: it rears up, hisses, and scuttles after you.
- If it reaches you, it kills you instantly.
- It never leaves the nursery. Grab the key and **sprint for the door**; if you get out, it hisses at the doorway and goes back to its corner. Walking back in with the key sets it off again.
- It is faster on Hard and slower on Easy, and it pounces once it gets within a couple of metres. In free play it chases you but can't kill you.
- **The revolver kills it.** It flips onto its back and stays dead, and the crib is safe from then on.

### The garage escape

The basement **garage** holds an old car facing a big steel garage door.
- **Fix it:** find the **engine**, a **wrench**, **motor oil** and a **car battery**. Each spawns in one of a few spots around the house. Then look at the car's bonnet and press **E** for each part. The engine needs the wrench, which you use up fitting it. The prompt says what's still missing.
- **Get in:** each of the four doors is a seat (driver, front, two in the back). From your seat you look around inside the car: dashboard, steering wheel, the windscreen. Anyone can sit in, but only the **driver** can drive. Press **W** once the car is fixed.
- **The drive** (everyone in the car sees it from their own seat):
  - the engine starts and the car rams the garage door, which buckles;
  - it backs up, rams again and the door caves further;
  - it backs up and rams a third time, and the door bursts apart: the panels and chunks of the wall fly out, bounce and tumble down the driveway;
  - the car drives up into the yard;
  - then it cuts to **Ajan sitting alone in the garage, glaring, eyes glowing**, as `ajan.mp3` plays;
  - **YOU ESCAPED**.
- Players who stayed behind see and hear it all happen, and the smashed doorway is now an exit: walk up the driveway to escape on foot.
- Once the car is moving, Ajan can't touch the people in it.

### The revolver

The revolver is `object.glb`, shrunk to fit in your hand.
- **Left click** fires it. It holds **2 rounds** and is found with 1 loaded; there is no timed reload. The HUD shows `Revolver 1/2`.
- **Bullets:** 3 loose bullets lie on tables and shelves on **every floor** (12 in all, different spots each game, glinting). Pick one up with the revolver in hand and it loads straight in (up to 2/2). Without the revolver, or with a full one, they stay where they are.
- It hits whatever the bullet reaches first: Ajan or the nursery spider.
- A hit puts Ajan on the floor for about **25 seconds**: he is blind and deaf, any chase ends, then he gets up roaring and goes back to patrolling. It doesn't kill him.
- Walls stop the bullet. A miss is the loudest noise in the house, and he comes straight to where you fired.

The HUD objective always shows the next step. Locked doors say what they need ("You need an Office Key for that", "You need power for that"). Notes around the house give hints. Item spots are randomized from a shared seed, and everything can be done alone. If someone escapes while carrying items, those items drop inside the front door for everyone else.

## Things in the house

- **Hiding view:** while you hide, the room in front of you is lit up and the exposure is raised, so you can watch it clearly. From inside a closet you look straight out through the louvers; to everyone else the closet stays shut. This is only on your screen and doesn't make you easier for Ajan to find.
- **Crawl spaces:** beds and tables can be hidden under, as well as closets (eight crawl spaces and seven closets in total; none in the nursery). The hiding view sits low and looks out into the room.
- **Radios:** one in the library (upstairs), one in the basement. Turned on, they play muffled music and static for 25 s, and Ajan walks over and switches them off. Use them as a lure.
- **Boombox (sitting room):** plays a random character's death sound. Ajan can't hear it.
- **Phone (guest room):** while someone is in the room, every 15 s there's a 30 % chance it rings and plays 10 random seconds of `cinema.mp4`'s audio through a telephone filter. Ajan can't hear it.
- **Cinema TV (attic):** press E on the TV to play `cinema.mp4` with its sound, again to pause or resume. Use the VCR to restart. In co-op it is synchronized for everyone, including pause and restart.
- **Mirror (upstairs bathroom):** a blood message that changes each time you come back.
- **Jelly:** a big wobbling `object.glb` stands in a random bedroom (the guest room or the child's room). Its base is fixed to the floor and its top half jiggles. Bumping into it makes it bounce with a *boing*. Ajan can't hear it.
- **Pickups glint:** anything you can pick up (keys, parts, bullets, the fuse…) has a soft pulsing sparkle, so it stands out in the dark.
- **Creaky floorboards:** 2–3 per dangerous floor (none in the attic), slightly lighter than the boards around them. Stepping on one plays `noise.mp3`, and Ajan comes to that exact spot. Each board has a 2.5 s cooldown, so it can't be spammed.
- **Atmosphere:** separate ambience beds for the basement, ground floor, upstairs and attic; blood trails and splatter; bones in Ajan's room; notes.
- **Set dressing:** every room has its own wallpaper (damask, roses, regency stripes, lattice, a faded nursery print, dark wood panelling, filthy plaster) and wood wainscoting, chair rails or skirting that stop at the doorways. There are old spindle-back chairs and torn wingback armchairs, and a brick fireplace with glowing embers and candles. A grandfather clock in the hall ticks (you can hear it) and its pendulum swings. There is a dining table laid for seven under a swaying chandelier, and a rocking chair in the nursery and the attic rocks and creaks by itself. Webs hang in the ceiling corners, with water stains on the ceilings. You'll also find children's drawings ("HE IS HOME", "DONT WAKE IT"), family portraits with the faces scratched out, tally marks over the mattress where you wake up, claw marks in Ajan's room, bloody handprints, sheets over the furniture, a dress form, dolls (one facing the wall), egg sacs in the spider's corner, hanging chains and puddles in the basement.

## Ajan

His AI is a state machine that runs on the host:
- The main loop is **dormant → patrol → investigate → chase → search → patrol**.
- **kill** and **drag** pull you out of a hiding spot.
- **inspect** checks hiding spots.
- **gotobed → sleep** and **gotochair → sit** are his rests.

- **Patrol:** he works through all of his floors (basement, ground floor, upstairs), preferring the rooms he visited least recently, with a bias toward floors players are on. While patrolling he quietly **whispers** (`ajan.mp3`).
- **Hearing:** footsteps (crouch is almost silent, walking is quiet, running is loud), doors, drawers, locked-door rattles, floorboards, radios, the elevator, gunshots, and your **microphone** (scaled by your microphone volume).
  - **Difficulty** scales every sound's reach: **Easy** ×0.6 (he misses a footstep 3 m away), **Medium** ×1.0, **Hard** ×1.45 (he hears someone talking 12 m away).
  - Each wall or closed door between you and him reduces how far a sound carries. Each floor between you reduces it much more, but less so near a staircase.
  - Normal sounds give him an approximate position. Floorboards and radios give him the exact spot.
- **Sight:** a vision cone with line-of-sight checks. Different floors only see each other along a staircase.
- **Losing you:** he searches nearby and then gives up, often with a quiet **laugh** (the first 3 s of `sleep.mp3`).
- **Hiding:** sometimes he walks straight past a quiet hider. Sometimes he walks up to your closet or bed, stares at it and smiles.
  - If he **didn't** see you get in (and you stayed quiet), he leaves laughing.
  - If he **saw** you get in, or you made noise, he opens it, drags you out and eats you.
- **Sleep:** every 3–4 minutes he goes to his bedroom upstairs and naps for about 30 s, lying on his bed and breathing slowly while `sleep.mp3` plays (loud, and audible from further away) from the bed. While asleep he is blind and hears much less, though a loud enough noise wakes him. He never falls asleep mid-chase.
- **Chair:** now and then he sits in a chair facing the wall for 15–25 s. Noise gets him up.
- **Navigation:** A* over an auto-generated waypoint graph covering every room, the doorways and all staircases, with real collision. He opens doors, which you can hear, and can't pass locked ones. He never uses the elevator or enters the attic.
- **Kill:** grab, lift to the mouth, eat with disintegration (dissolve shader and embers), then `ajan.mp3`.
  - During eating, MAX, MASKED, RIZE, LUCKY and MIDO play their own clip. NONE OF THESE plays nothing.
  - MASKED's (Xhiko's) clip is mastered much quieter than the others, so it plays at 2× volume, both on a kill and from the boombox. A limiter engages only if a boosted sound would get near clipping.
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
| `object.glb` | same | The jelly in a bedroom, and (shrunk to hand size) the revolver. |
| `car.glb` | same | The car in the garage. The model has no interior you could sit in, so the cockpit (seats, dashboard, wheel, headliner) is built around the camera; its shell gives the windows and pillars. |
| `noise.mp3` | same | The creaky floorboard sound. |
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
- difficulty (easy / medium / hard)
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
- Players sitting in the car aren't drawn in their seats for other players, so the car looks empty from outside.
- The browser can't close its own tab, so **QUIT** shows a goodbye screen.
- Development testing ran in headless Chromium with software rendering. Everything worked, but frame rates there are not representative, and the game hasn't been profiled on real GPUs.
