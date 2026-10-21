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
| E | Interact: open, pick up, use, hide or leave, read, talk to Fai |
| Mouse wheel | Choose the item in your hand (the selected item is highlighted in the inventory) |
| G | Drop the item in your hand |
| Left click | Fire the revolver (draws it first if another item is in your hand) |
| E (at a club table) | Make it rain ($20 a throw) |
| Space (at a club table) | Stand up |
| 1 / 2 / 3 (Fai's menu) | Vodka / beer / wine (or click; Esc cancels) |
| W (in the driver's seat) | Drive the car out through the garage door (once it's fixed) |
| 1 / 2 / 3 / 4 | Inside the elevator: basement / ground / upstairs / attic |
| M | Mute or unmute the microphone |
| Esc | Pause and settings |
| A / D / click | Switch the spectated player (when dead) |

## What's new

- **Three monsters.** Ajan is always there. **Guy** (`guy.glb`) joins on Medium and Hard: he punches you down and drags your body away instead of eating you (`guyseesyou.mp3` when he spots you, `guyleaves.mp3` when he gives up on a hiding spot, `guy.mp3` when he catches you). **Ajanita** (`ajanita.glb`) joins on Hard. She eats like Ajan and naps in the master bedroom, never at the same time as him (`ajanitasee` / `ajanitaleave` / `ajanita` / `ajanitasleep`).
- **Seeing you.** A monster that spots you stops and stares while its "see" sound plays (`ajansee.mp3` for Ajan). Only then does it chase you, and the chase music starts. `ajancatch.mp3` plays when Ajan catches you, `ajanleaves.mp3` when he walks away from a hiding spot without finding you, and `ajansleep.mp3` loops while he sleeps.
- **Respawns:** Easy 3, Medium 2, Hard 1. They are counted by the host, and nobody can join mid-round, so rejoining doesn't reset them. Unless it's your last life, the monster slaps you unconscious and drags your body away. You wake up in a capture room: the **TV room** at the top of the east-wing tower (about 15 TVs all playing `tv.mp4`, which you only hear inside; afterwards you go down the spiral stair), the **cage**, the **operating table**, **the chair**, or **the trunk of the car** in the garage (bang the lid open). While you're out you spectate under **COMING BACK IN**. Mash **E** to break free. A monster can't attack anyone while it's dragging a body.
- **Speed:** monsters are a bit faster on Medium (×1.1) and fastest on Hard (×1.25).
- **Poison sprays:** two one-use cans, one on the kitchen counter and one in the library. Select a can and **left click** at a monster within about 3.5 m to blind it for exactly 60 s.
- **No more camping:** if a monster can't reach you (inside the elevator, or anywhere it makes no progress for about 6 s), it tries to squeeze in, gives up, and ignores you for a while.
- **Ajan's routines:** now and then he walks to the kitchen, opens the fridge, takes out a dollma (`dollma.glb`) and eats it at the table for 20 s (`eat.mp3`). He also goes to the music room and dances for 30 s to the club track.
- **Slot machine** (`slot.glb`) in the club. There is no menu: walk up to it and press **E** on its buttons (BET −, SPIN $x, BET +). The reels spin on the machine's own screen. The host draws the result and moves the money.
- **Characters:** ROT (`rot.mp3`), BANANA (`banana.mp3`) and VANEX (`vanex.mp3`). AJAN's death sound is now `ajannew.mp3`, and MASKED's is boosted to 4×. The player model is `player1.glb`, and the shirt and pants colours are picked on two colour wheels.
- **Videos:** the main menu loops `mainnew.mp4`. Escaping by the front door plays `escape.mp4`, and escaping in the car plays `escapecar.mp4` as soon as the car is out of the garage. The end screen only opens once the clip has finished. (A pause bug used to hide the escape video and leave only its audio.) The car cabin has pillars and roof rails, so the first-person ride reads as being inside the car. Riders stay visible in their seats for everyone else.
- **Seen by others:** players hiding in closets stand visible behind the louvers, and the item in a player's hand, the revolver included, shows in their hand for everyone.

- **East wing:** a new two-storey wing east of the office and Ajan's room, with a gallery, smoking room, pantry, servants' quarters, nurse's room and tower room, the capture rooms, a narrow back staircase, and a spiral stair up to the TV room. The ground-floor door is in the office.
- **Outside:** a 3D night forest around the house, with crickets and distant wolves.
- **Ajan's private dance:** at his club table while he's at his pole, **Q** ($50) makes him do Yasmin's private-dance routine.
- **Garden and well:** climb out through the window in the child's bedroom (ground floor, north side). The well's crank lever is hidden somewhere in the house: fit it, crank the bucket up and take what's inside. Ajan has his own garden door; you can't open it.
- **Security office** (east wing, ground floor): **E** on the red button slams the steel shutter down or lifts it, the yellow button lights the hall outside the window for a few seconds, and the desk is a CCTV console (A/D or the wheel to switch cameras, E or Esc to stand up). If Ajan chases you in and the shutter is down, he knocks, looks in through the window, grins and leaves.
- See `CHECKLIST.md` for what has been tested and what is still to do.

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
- **Attic stairs:** an open staircase in the middle of the upstairs hall, along its south wall, rising east through a trapdoor into the attic. There's no door. At the start the staircase itself is **missing** (see *The attic puzzle*). The hall stays walkable beside it.
- **Elevator:** east side, stops on all four floors. Inside the car is a brass panel with four big labelled buttons (B BASEMENT, 1 GROUND, 2 UPSTAIRS, A ATTIC); aim at one and press E, or press 1–4 while standing in the car. Each landing has a call button next to the doors. It is locked until someone finds the **Elevator Key** in a drawer. The basement stop only works once the basement door is unlocked, or if the rider holds the basement key. It is loud, and Ajan hears it.

### Dead or spectating

Once you're dead (or escaped and watching), the view brightens: higher exposure, more ambient light and a soft light following the camera, so you can follow what's happening.

### The attic puzzle

The attic can't be reached at the start. In the middle of the upstairs hall, a taped-off chalk outline (marked I and II) shows where the staircase should stand, under a closed trapdoor in the ceiling. The elevator's attic button is dead too ("The attic is sealed off").

1. **Two staircase sections** lie side by side in the basement: **Section I (lower)** and **Section II (upper)**. Each is a pickup with a glint.
2. At the chalk outline press **E** to fit them. **I** has to go in first, then **II** on top of it. Each section swings in from the hall and settles against the wall onto its brackets with a clank. Ajan hears the work. The prompt says what's still missing and in which order.
3. With both sections in, the stairs are climbable, with a handrail and balusters on the open side and a closed underside. At the top, a **locked trapdoor** in the attic floor stops you just below it.
4. The **Attic Key** spawns in one of four places around the house. With the key, **E** unlocks the trapdoor (the key is used up) and **E** again swings it open.
5. Climb into the attic. The opening has a railing on two sides, and the open trapdoor stands up as the third, so nobody falls through. There are no other holes in the floor; the old stairwell is solid attic floor now. From then on the elevator stops there too. The attic (TV, VCR, posters and so on) is unchanged, except for an **unmarked door** in its west wall.

### The club

Behind the unmarked door in the attic is **THE CLUB**: a bar with stocked shelves and stools, a lit dance floor that chases colours to the beat, a disco ball, moving coloured lights, booths, a DJ booth and neon. There are two poles on platforms: **Yasmin's**, and an empty one beside it for **AJAN**. A small table with a chair stands right in front of each pole. The club is part of the attic safe zone.

- **Music:** only `song1.mp3`. It starts when you walk in, loops while you're inside, and fades out and stops when you leave. You can only hear it inside the club, there is only ever one copy playing, and the house music is ducked while it plays.
- **Fai** (`bartender.glb`) stands behind the bar, wiping the counter and glancing at whoever is closest. **E — TALK TO FAI** plays `fai.mp3`, then a menu opens: **VODKA**, **BEER**, **WINE**. Fai turns, walks to that drink's station on the back bar, picks it up and carries it over in her hand. She sets it on the counter in front of you as a real item you can pick up. Each drink looks different (a clear vodka bottle, a brown beer bottle, a glass of red wine). While she's busy nobody else can order, and talking to her again does nothing.
- **Yasmin** (`yasmin.glb`) pole-dances continuously: she circles the pole with one hand on it, with hip sway, spins and the odd pause. Her chest and hips have a bouncy spring-driven secondary motion that follows her moves (capped so it never warps the mesh or clothing).
- **The tables:** **E** on either chair (Yasmin's, or the one in front of AJAN's pole) sits you down facing that pole, and **Space** stands you up. Seated, aim and press **E** to **make it rain**: your hand throws a wad of bills and seven $20 notes flutter down with gravity and settle on the floor near whoever you aimed at (Yasmin or AJAN). Everyone starts with **$500**, shown bottom right. Each throw costs $20, the host checks your balance, and with less than $20 the throw is refused. Throws are rate-limited.
- **`yasmin.mp3`** plays exactly **2 s** after the first throw at Yasmin on a visit, once, only for people in the club.
- **AJAN visits:** about **5 s** after the first money ever thrown at Yasmin, AJAN comes up the attic stairs, walks across the attic, opens the club door himself and goes to his pole. He doesn't attack (the normal chase is suspended), and dances a clumsy routine of his own: raise-the-roof, chest drumming, the sprinkler. Throwing money at him plays the same `sleep.mp3` laugh. **15–20 s** after the first money he gets (the timer is never reset), he yawns and leaves: back out through the club door, across the attic, down the hall stairs and through the house to **his own bedroom**, where he lies down on his bed and sleeps with the usual `sleep.mp3` snoring.
- **How he gets there:** he walks through the house on his normal navigation to the foot of the hall stairs, so you may hear him coming. He doesn't attack on the way, and walking in the club is scripted.
- **Back to normal:** when he wakes up from that nap, the usual AI resumes. If he was never paid and everyone leaves the attic for 30 s, he walks out the same way and goes back to patrolling. The club visit only happens once per game.

### The attic safe zone

Ajan never paths into the attic or onto the upper part of the attic stairs (the scripted club visit is the only exception, and he does no harm then). He can't see, hear, attack or grab anyone there, and if he chases you up the stairs he gives up at the safe line. Noise you make in the attic doesn't count.

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
- **Inventory:** everything you carry is listed bottom right. The **mouse wheel** picks which item is in your hand: it's highlighted, its name is shown, and a small copy is visible in your first-person hand. A new pickup goes straight to your hand. Keys, fuses and car parts still work from anywhere in your inventory, so you never have to select a key to open a door. The revolver only fires when it's in your hand, and a left click with something else selected draws it. The wheel is ignored while a menu, a note or the pause screen is open.
- **Dropping (G):** the item in your hand drops out of it in front of you, falls and lands on the floor with a thud, as a real item again (same item, same identity: the revolver keeps its rounds). Anyone can pick it up. Against a wall, furniture or a stairwell it lands at your feet instead. You can't drop things while hiding, seated, dead, or inside the elevator car (it would ride off with your item). Everything can be dropped, including keys and the stair sections, so a player can hand items to a teammate.
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
- **Dropped items:** a drop makes one noise when it lands. Heavy things (engine, battery, stair sections, bolt cutters, wrench, revolver) carry about 15 m, bottles about 11 m and keys about 7.5 m, all reduced by walls, closed doors and floors in between. If he hears it he walks to **that exact spot** and searches around it. The noise doesn't point him at whoever dropped it, and it doesn't count in the attic or the club.
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
- **Replicated state:** positions and animation state at 15 Hz, Ajan at 10 Hz, names and clothing colours, speaking indicators, doors, drawers, items, power, the TV, monitor channels, the elevator (car position from server time), the attic cinema (play/pause position from server time), radios, the boombox, the phone, the mirror message, the jelly, kills, spectators and escapes. Also replicated: the attic staircase sections and trapdoor, dropped items (with the landing spot chosen by the host), every player's money, who is at Yasmin's table, thrown bills, Fai's serving (on a shared server-time timeline, so the drink is in the same hand at the same moment for everyone), drinks on the counter, and AJAN's club visit.
- **Host validation:** the host decides every pickup (the first request wins, so two players grabbing the same item never duplicate it), every drop (you must hold it), stair placement (you must hold the right section, in order), the trapdoor (you must hold the key), Fai (one customer at a time; only that customer can order), and money (you must be seated, have the funds and respect the throw rate). The club timers (yasmin.mp3 at 2 s, AJAN at 5 s, his nap at 15–20 s) run on the host only, so they fire once no matter how many players are watching. The house layout, item spots and painting arrangement come from a shared seed.
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
| `dance1.fbx`, `dance2.fbx`, `dance3.fbx` | same | Mixamo dances: Yasmin's private dance, AJAN's dance, Yasmin's normal dance. Loaded with three.js's FBXLoader, which ships with three, so no new dependency. |
| logo image (uploaded) | `logo.png` | The game logo on the splash screen and main menu. It's the uploaded artwork as-is: transparent background, cropped. |
| `song1.mp3` | same | The club music (looped). `song2.mp3` and `song3.mp3` are never used for the club. |
| `fai.mp3` | same | Fai's line when you talk to her. |
| `yasmin.mp3` | same | Yasmin's reaction, 2 s after the first throw. |
| `bartender.glb` | same | Fai. A static T-pose mesh, **auto-rigged at runtime** like the others (idle, walking, reaching, serving, talking, wiping). |
| `yasmin.glb` | same | Yasmin. A static T-pose mesh, auto-rigged at runtime and animated procedurally (the pole dance). |
| `rot.mp3` | not needed | ROT was removed as a character on request. |
| everything else | same | |

Missing files are reported on screen and in the console, with fallbacks: a box figure for a model, a text card for a video, plain frames for paintings, and silence for audio.

All house textures (wallpaper, floorboards, tiles, concrete, carpet, wood, rust) are generated procedurally at startup, so no extra texture files are needed.

Fonts (Google Fonts, loaded like before): **Lacquer**, a thin, scratchy, dripping horror face, is used for the menus, buttons, prompts, messages, inventory and the mirror's blood writing. **Shadows Into Light** (thin handwriting) is used for the notes. **VT323** is kept only for the camcorder overlay, the money counter and room codes. If the fonts can't load, the game falls back to Chiller or the system's fantasy font.

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
- Players sitting in the car aren't drawn in their seats for other players, so the car looks empty from outside. The same goes for the club chairs: other players see the seated player standing next to them.
- `yasmin.glb` and `bartender.glb` have no skeleton either. Yasmin's pole dance and Fai's serving are procedural poses on the auto-rig, not motion capture, so they're stylised, especially the hands around the pole and the drink. Yasmin's secondary motion is a small, clamped vertex offset in the shader, not a cloth or soft-body simulation.
- Inside the attic and club, AJAN's visit follows one scripted route (hall stairs → attic → club door → pole, and back). He uses the nav graph only for the house part, because the attic is outside his normal navigation.
- The browser can't close its own tab, so **QUIT** shows a goodbye screen.
- Development testing ran in headless Chromium with software rendering. Everything worked, but frame rates there are not representative, and the game hasn't been profiled on real GPUs.

### Update: dances, private dance, ladder, 3-slot inventory

- **Dances (Mixamo FBX, retargeted at runtime onto the auto-rigs):** AJAN dances `dance2.fbx` in front of his pole. Yasmin's normal dance is `dance3.fbx`, in front of her pole facing her chair. All players see the same moment of the dance (it follows server time). If a file is missing, the old procedural dance is used and the file is reported.
- **Private dance ($50):** while seated at either club chair, press **Q**. Yasmin walks over, dances `dance1.fbx` right in front of your chair, then walks back. The host checks your money, and only one private dance runs at a time. The little tables in front of the chairs are gone.
- **Jiggle:** stronger springs and a higher cap (about 4.4 cm on her body), driven by her real dance motion.
- **Inventory:** each player carries at most **3 slots**. A ladder section takes **2**. Picking up beyond that is refused ("Your hands are full"), and the HUD shows `n/3 SLOTS`.
- **Attic ladder:** the staircase is now a steep ladder (rails and rungs) in the same spot under the trapdoor, made from the same two sections (*Ladder Section I/II*). Walk into it to climb up or down.
