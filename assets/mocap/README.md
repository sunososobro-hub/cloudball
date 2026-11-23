# assets/mocap (max 20 lines; handoff for lane C of #186)

## Done
- `assets/tools/mocap_clip.py`: BVH (CMU / cgspeed joint names) -> `cloudball-mocap/1` JSON clip. numpy only. `--selftest` builds a CMU-shaped BVH, converts it, and checks the clip's own forward kinematics against the BVH's (max error ~0.0002 hip heights at 120 and 30 fps).
- Format: 21 joints (`JOINTS`: hips, spine, chest, neck, head, clavicle/upperArm/forearm/hand, thigh/shin/foot/toe; Left = the performer's own left), each `{name, parent, rest}`; `rest` = offset from the parent joint in hip heights. `rot` = base64 int16 `[frame][joint][x y z w] / rotQ`, the LOCAL rotation relative to the rest pose (identity = source T-pose). `pos` = base64 int16 hips `[frame][x y z] / posQ` in hip heights, y from the floor, x z from the first kept frame. Y up, rest faces +Z, left = +X; `--face travel` turns the take so the hips travel toward +Z. `release` = `{frame, hand, peakSpeed}`, frame of the throwing hand's peak speed (or `--release <s>`).
- Size: about 8 bytes per joint per frame before base64; a 4 s pitch at 30 fps is about 30 KB.

## Next
- Items 1 and 5 done by the manager (2026-11-22): whole takes at 30 fps, `--face travel`: `pitch_124_01.json` (5.4 s, release frame 111), `pitch2_124_02.json` (11 s, release 266), `swing_124_07.json`, `bunt_124_08.json`; row in `assets/SOURCES.md`. Not trimmed: pick `--start/--end` when hooking up. For swing and bunt the auto `release` (frame 2) is noise: the renderer sets contact by hand (swing: frame 85, `SW_CONTACT` in game.js; bunt hold: frames 64-80). Rebuild needs the BVH (`sfd158/cmu-mocap`, `data/124/`), which a scheduled run cannot reach: ask the manager.
- Items 3, 4, 6 (renderer, after #185): retarget per joint by world rotation (`world = parent world * rot`), apply to each bone's own rest; time-warp the clip so `release.frame` lands on the engine's release time; mirror for left-handers (x -> -x, swap Left/Right, quaternion (x, -y, -z, w)).

## Traps
- `players.js`/`build_players.py` name sides the other way round ("MakeHuman .R = our L index"): map by the performer's side, not by the letter.
- CMU Spine1 is not stored: its turn is inside chest's children. LHipJoint/RHipJoint must stay zero (they are in CMU); `--check` reports a large error if a file breaks that.
- Frame Time in cgspeed files is rounded (0.0083333): the tool tolerates it; keep `--fps` a divisor of 120 for `--check` to compare every frame.
