# LOOM

An experimental crossed-string instrument, based on [izanapi/hanabi](https://github.com/izanapi/hanabi). LOOM keeps the original dark performance language, scale catalog, eight synthesized voices, stereo ECHO/HALL, mix controls, TAP/BPM and two-bar recorder. Its strings form an L: 14 melodic strings gathered on the right, six resonance strings gathered below, and a quiet empty corner at the upper left.

## Play

- **Tap** a vertical string to pluck it. The closely spaced right-hand strings make a broad stroke catch many notes. Strings ascend from left to right, following KEY / SCALE. The default is C Insen with Koto.
- **Brush the lower-right corner** to catch short resonances alongside the plucks, without waiting for a hold. Diagonal sweeps pass through several colors. Fast bundled notes fan out over a few milliseconds; excitation and voice counts are bounded.
- **Rake the horizontal strings on their own.** They pick up recent notes from the last eight seconds, or a vertical string another finger is holding, and return them as harmony, grains or echoes. With no recent notes, a small tonic-based seed lets the lower strings sound immediately.
- **Use the empty corner as a resting place.** It makes no sound, but you can start a sweep there and move into the strings. Upper vertical strings pluck without selecting a hidden horizontal resonance.
- **Hold** for 320 ms to couple the nearest crossing. The horizontal resonance blooms over about a second.
- **Move while holding** to weave another crossing. The previous resonance fades over 600 ms while the next one rises. Moving to a new vertical string also gently plucks it.
- **Pull sideways** within a crossing to strengthen the resonance. Multiple fingers work independently; holding the same horizontal string with several fingers strengthens their common resonance and produces slow beating.
- **Release** to let the resonance fall away. Cancelling a touch, leaving the window, opening settings or resizing releases contacts. Esc stops all audio. Page hiding or audio interruption also pauses the loop.

| Horizontal string | Response |
| --- | --- |
| HARM | Octave, fifth above the octave, and double octave |
| BLOOM | Sustained harmony from alternating degrees of the selected scale |
| FIFTH | Fundamental, exact fifth and octave |
| DUST | Overlapping windowed grains cut from the Koto plucked-string synthesis |
| ECHO | A quiet three-note thread returning at dotted-eighth intervals |
| ROOT | A low tonic drone under the plucked note's lower octave |

FIFTH and HARM deliberately use exact chromatic fifths; they can color outside the scale. BLOOM follows the selected scale. DUST grains are generated locally, with no microphone or downloaded samples.

The continuous strings carry wave packets outward from each contact. A bright knot indicates a held crossing; fine colored rings mark the recorded hand during playback. Reduced motion keeps brightness feedback while removing displacement. There are no decorative particles or pad cells.

## Loop

Press **REC**, then play. The first pluck or horizontal brush starts two bars; a click guides recording. Plucks store string position and articulation. Couplings also store **vertical string, horizontal string, start step, strength and duration**. Brushed resonances retain their faster attack and their excitation position along the horizontal string. Onset is quantized to sixteenths; hold lengths retain fractional steps. Contacts held beyond the end are clipped to the loop boundary. The loop restarts automatically, reproducing both resonance and string motion under your live playing.

**PAUSE** retains the phrase, **PLAY** restarts it, and **CLEAR** releases recorded resonances and erases the phrase. Key / scale / octave retune subsequent playback. VOICE changes plucks; horizontal resonance types retain their identities. Tempo is locked during recording. A tempo change affects subsequently scheduled events; an already sounding held loop voice completes its scheduled release. Loops live in page memory and disappear on reload.

**FLOW** remains an optional quiet accompaniment. It follows tuning and tempo and is never recorded. The original PLUCK / CHORD / ARP mode switches are replaced by the continuous crossing gesture; short taps always play one string.

## Controls and keyboard

The upper controls remain KEY, SCALE, VOICE, dice, SOUND and SETTINGS. The lower controls remain ECHO, HALL, VOLUME, BPM / TAP, REC / CLEAR and the loop progress strip. Settings retain octave, color, decay, glow, swing, metronome, note labels and reduced motion. Decay and VOICE control the original plucks; contact duration controls woven resonance. Both enter the same effects bus.

Focus the strings by clicking or tabbing to them:

- `A S D F G H J Q W E R T Y U`: 14 strings, low to high. Hold to couple.
- `1`–`6`: choose a horizontal string for the next keyboard note.
- `Space`: record / pause / play.
- `Esc`: stop audio, or close the settings dialog first.

## Run

No build step or third-party runtime dependencies.

```sh
python3 -m http.server 8071 --bind 127.0.0.1
```

Open http://127.0.0.1:8071. ES modules need an HTTP server. Audio starts on the first playing gesture. The original hosted HANABI is not overwritten by this local working copy.

## Implementation and validation

- `music.mjs`, `voices.mjs`, `audio.mjs`: reused HANABI tuning, synthesis, effects and transport helpers.
- `loom.mjs`: crossing geometry, fixed touch targets, hysteresis, sweep interpolation and resonance pitches.
- `resonance.mjs`: independent sustained envelopes, grain loops, echo scheduling and bounded cleanup. At most 24 resonance groups, alongside the original 32-pluck limit.
- `app.mjs`: gestures, recording, audio-clock playback and filament rendering.

```sh
node --test tests/*.test.mjs
```

The suite retains the original music/audio checks and replaces circular-gesture checks with tap/hold, weaving, multitouch, cancellation, crossing-duration recording, loop-boundary and keyboard tests. `tests/browser.cjs` checks actual Chrome touch input and five viewport sizes; `tests/sound.cjs` renders the six resonances and a ten-contact mix through Web Audio to check audibility, finite output and release. These browser scripts use the local bundled Playwright and installed Chrome paths; adjust them on other machines. Generated screenshots and the dry resonance check WAV are in `artifacts/`.

Actual iPhone Safari sound, latency and prolonged touch feel still require device testing.
