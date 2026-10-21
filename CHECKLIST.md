# AJAN update checklist

"Tested" means checked by actually running the game: headless Chromium with software rendering,
driven by scripts, in single-player and with **two real browser clients** in one multiplayer room.
Nothing in this file counts as tested from reading the code alone. Software rendering makes the
game run far slower than real time, so timings (for example "60 s") were checked against the
game's own clock, not by playing at full speed.

## Done and tested
- [x] Easy / Medium / Hard rosters: Ajan only / Ajan + Guy / Ajan + Guy + Ajanita (all three spawn, patrol and path between floors)
- [x] Lives 3 / 2 / 1; host-counted; joining a running game is refused by the server, so rejoining can't reset lives
- [x] Knock-out on a non-final life → dragged by the monster → wakes in a capture room → mash E to break free (single-player and guest-in-multiplayer)
- [x] COMING BACK IN overlay and spectating while knocked out (guest)
- [x] Capture rooms in the new east wing: TV room (top of the tower, 15 TVs, one shared `tv.mp4`), cage, operating table, chair; plus the car trunk in the garage (guest woke there in one run, in the cage in another)
- [x] TV room plays `tv.mp4` on every screen (one video element, so one decoder and one audio source)
- [x] Spiral stair from the TV room down to the tower room: walkable from bottom to top (height checked from 3.4 m to 6.7 m)
- [x] Poison spray: one use, stuns for 60 s
- [x] Slot machine: buttons on the machine (BET − / SPIN / BET +), reels on its own screen, no menu. The host pays out: two 7s paid ×3 and a losing spin paid nothing, and host and guest agreed on the balance ($525)
- [x] Escape by the front door plays `escape.mp4`; the end menu only after the clip ends (single-player). In multiplayer the guest saw the video, then spectated because the host was still inside
- [x] Car escape plays `escapecar.mp4`
- [x] Held items appear in other players' hands (the guest saw the host's spray in the host's right hand)
- [x] Players hiding in closets are visible to other players (guest view)
- [x] Monster state and positions match between host and guest
- [x] AJAN's private dance at his club table (Yasmin's dance1 routine on his rig)
- [x] New character names in the selection list; colour wheels set shirt and pants; `player1.glb` shown in the preview
- [x] Menu shows "v.1.3 MADE BY MAXIM"
- [x] **Garden** behind the house (walls, fence, hedges, flower beds, bench, hose reel, lamp post). You get in and out by climbing through the child's bedroom window (E, both directions)
- [x] **Ajan's garden door** (north bedroom): players can't open it (refused on both clients). Monsters' routes do go through it (checked: a path from the garden into the bedroom)
- [x] **Well:** the crank lever spawns at one of 7 spots in the house each round. Without it the well refuses. Fitting it uses the lever up. Cranking raises the bucket with a poison spray inside. Two players grabbing at once: only one gets it (two clients)
- [x] **Security office** (east wing, ground floor, open any time; the old security room with the front-door key is unchanged): the steel shutter slams down or lifts from the button inside (refused from outside), blocks movement and the monsters' routes, and both clients agree. It lifts by itself when nobody is inside. The LIGHT button lights the hall outside the window for 4 s, on both clients
- [x] **Knock routine:** with the shutter down and Ajan chasing you in, he walks to the shutter, knocks 3 times, steps over to the window, stares in, plays his "leaves" sound and goes back to patrol, ignoring you for 20 s. No kill (stepped through in single-player)
- [x] **CCTV console:** sit at the desk (E). A/D or the mouse wheel switch between 14 live camera feeds (6 new: garden, east hall, east wing upstairs, back stairs, staircase, outside the security door); E or Esc to stand up. The feeds use a night-vision illuminator, the HUD hides, and the old room's monitors are brighter
- [x] **Third floor** across the north half of the house, at attic height (the attic and the club fill the south half): hall, doll room, old bathroom, chapel, painting studio, sewing room, observatory. You reach it by the stairs in Ajan's room (climbing up was tested). All seven areas plus both balconies are on the monsters' patrol routes, and a monster route from Ajan's room to the chapel works
- [x] **Balconies:** one over the garden, and a roof terrace on the east wing (both reachable by the monsters)
- [x] **Secret passages:** three bookcase doors (library–nursery, wardrobe–laundry, chapel–studio) that look like bookcases with no prompt until their trigger (red book, coat hook, candlestick) is used. Opening one is in sync on both clients, and monsters path through it afterwards
- [x] **Peepholes** on every door that faces a hallway (32 doors). The fish-eye view shows the real hall, and you leave with E, Esc or a movement key. After 20 s of watching with a monster nearby, it walks up, grins into the lens and plays its "leaves" sound (the full sequence was stepped through). Patrolling monsters sometimes stop and stare into a peephole
- [x] **Paintings:** 9 new frames (third floor and studio easels) show `image1.png` or `image2.png`, picked per round from the shared seed (both images appear, same for every player)
- [x] **Skinwalker:** a 5 % roll once per round on the host (the roll was checked; the 5 % itself is not something a test can show). It spawns wearing a real player's clothes and name tag, stares 6–10 s, then creeps up facing you. The tongue is real 3D geometry that lashes out and drags the victim in, with its own synthesized tongue and scream sounds (not Ajan's or any death sound). The death follows the life rules (a life used up → wake in a capture room; last life → dead). Ajan backs off when the skinwalker is facing his target up close (abandons the kill and ignores them for 10 s). Synced to the second client: its look, its position and the kill
- [x] **Camcorder** (`camera.glb`) on the back-room table. Pick it up and the others see it in your hand. Its flip-out screen shows the live lens view (it's a separate render, not your view). Selfie mode turns it round and shows your own body. Zoom ×1–×6, its own light (T), R to record and pause. The recording is real gameplay video plus the game's audio mix and your mic (checked: a 480×270 VP9 + Opus webm about 1 MB that the browser loads and plays). At the end of the round a review panel lets you watch, save (a normal download) or discard. Recording pauses while you aren't holding it
- [x] **Garden detail:** painted grass, soil, leaf, bark and stone textures; about 5000 instanced grass tufts; hedges built from leafy clumps; rocks
- [x] Navigation fixes: the whole upstairs hall was cut in two for the AI (a pre-existing bug at the attic-stair puzzle footprint); unreachable nav nodes went from 118 to 12. The new wing is fully reachable

## Done, not tested yet
- [ ] Ajan's fridge → dollma → 20 s eating routine, and the 30 s music-room dance (code paths run, but not watched to the end)
- [ ] The "I see you" stare sound before the chase, and the leave / catch / sleep sounds for each monster (sounds load, but I didn't listen to them)
- [ ] Character voices at 150 % and MASKED's louder death sound (not listened to)
- [ ] Forest ambience (crickets and wolf howls instead of the surf-like wind) (not listened to)
- [ ] 3D night forest outside the windows (built and loads, not reviewed visually in detail)
- [ ] Guy's human walk cycle (rendered once, not reviewed while he walks)
- [ ] Monsters giving up on players inside the elevator
- [ ] First-person view while ramming the garage door in the car
- [ ] Death sounds for BANANA, VANEX and ROT in an actual death (files load; the code path is the same as for the other characters)

## Not done yet
- [ ] A third floor across the *south* half too (the attic and club are there; raising them a storey touches about 20 hard-coded heights)
- [ ] Camera damage and repair (Ajan disabling cameras, glitches, a repair interaction); the security office's 4 wall screens only show labels (the console has the live feeds)
- [ ] The 5-second "he saw you go in" door warning (peepholes do the stare and the scare, not this one)
- [ ] Camcorder: other players' voices are only in the tape as you hear them in the game mix (there's no separate track per player); the camera light isn't synced to other players; the saved webm has no duration header (normal for browser recordings: it plays, but some players can't seek it)
- [ ] Alley dealer, shed, drugs, boxing machine, second slot machine in the shed
- [ ] More items and locks per difficulty, randomised puzzles
- [ ] Environmental detail overhaul, mirrors and reflections, shadows under doors

## Known issues
- The office still has a few nav nodes the AI can't reach (pre-existing; furniture blocks them). Monsters reach the wing's ground floor through the back stairs, not through the office.
- A request for a missing file (probably the favicon) logs one 404 in the browser console.
- While you sit at the CCTV console, your own body isn't drawn in the feeds (other players and the monsters are).
- The garden is dark except near its lamps; the feeds light it with a night-vision lamp.
- The camcorder costs an extra render of the scene each frame while you hold it (about 24 fps at 480×270), and recording reads that picture back from the GPU.
