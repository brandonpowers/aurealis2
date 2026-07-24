# Follow-ups from the 2026-07 refresh cycle

Triaged as next-cycle work by the final whole-branch review (none block current
functionality; all shipped tests are green).

## Behavior / UX

- **Landing failure states:** mic-denied and undecodable-file drops hide the
  landing then fail silently (console only) — needs a visible error state and a
  way back to the landing.
- **Track end handling:** no `source.onended` — time display counts past the
  duration after demo/file playback finishes.
- **`?ref` + Space desync:** pressing Space during a checkpoint pause resumes
  audio while the overlay stays up (manual ref-mode use only).
- **FFT size vs displayed ceiling:** the 512-bin data texture means 8192-FFT
  shows only ~2.8 kHz of range (correct but surprising). Scaling `numBins` with
  FFT size touches frozen-mapping territory — do it under the checkpoint gate.

## Analysis pipeline

- **rAF-coupled analysis feed:** `pushWebAudioFrame` runs per animation frame,
  so time-axis speed and hue-EMA smoothing are display-fps-dependent, and
  heavily loaded machines produce ghost-trail artifacts in the visual harness
  (documented in TESTING.md). Decouple to wall-clock/hop-rate pacing.

## Code hygiene

- `colorTune || 0.3` treats slider value 0 as unset (`main.js`, two sites) — use `??`.
- Stale static HTML values: sensitivity `max="10"` vs C++ ceiling 5.0;
  stereo-spread `value="3.0"` beside a `2.00` readout literal.
- Hoist the duplicated `FFT_SIZES` array in `main.js` to module scope.
- Debounce the timeDepth rebuild (per-value realloc during slider drags).
- Token hygiene batch: remaining raw `rgba()` values in hover states, select
  background, strip gradient (duplicates `--bg`).
- `Base64Encode` unused-function warning in non-iPlug2 builds (`Aurealis2.cpp`).
- Help overlay: backdrop click doesn't close (only ✕/Escape).

## Demo track

- Seed `anoisesrc` in `gen-demo-audio.sh` for reproducible regeneration.
- Arpeggio expression has a phase-discontinuity click at each note change
  (masked in the mix; fix with accumulated phase if regenerating).

## Needs the user / a remote

- **Real-GPU fps:** run `node Aurealis2/scripts/measure-fps.mjs` from a normal
  desktop terminal (sandboxed sessions kill display-attached Chrome). No 60fps
  claim until measured.
- **CI proof:** the workflow (3 DSP platforms + visual/UI screenshot job) has
  only ever been simulated locally — this repo has no remote. First push
  validates it, including puppeteer's OS deps on the runner.
- CI polish: `cache: npm` on setup-node.
