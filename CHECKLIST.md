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
- [ ] Extra floor before the attic and balconies (the east wing adds 11 rooms on two floors plus the tower; there is no new floor across the whole house)
- [ ] Garden, window climb, well and lever, and Ajan's garden door
- [ ] Security room rebuild (separate room, FNAF lights and slam door, camera damage and repair)
- [ ] Peepholes and the door scares
- [ ] Secret passages; paintings randomised from `image1.png` and `image2.png`
- [ ] Skinwalker
- [ ] Handheld recording camera (`camera.glb`) with recording and download
- [ ] Alley dealer, shed, drugs, boxing machine, second slot machine in the shed
- [ ] More items and locks per difficulty, randomised puzzles
- [ ] Environmental detail overhaul, mirrors and reflections, shadows under doors

## Known issues
- The office still has a few nav nodes the AI can't reach (pre-existing; furniture blocks them). Monsters reach the wing's ground floor through the back stairs, not through the office.
- A request for a missing file (probably the favicon) logs one 404 in the browser console.
