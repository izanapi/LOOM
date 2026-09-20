# LOOM

An experimental crossed-string instrument, based on [izanapi/hanabi](https://github.com/izanapi/hanabi). LOOM keeps the original dark performance language, effects and transport, with eleven synthesized voices, stereo ECHO/HALL, mix controls, TAP/BPM and two-bar recorder. Its strings form an L: 14 melodic strings gathered on the right, twelve resonance strings gathered below, and a quiet empty corner at the upper left.

## Play

- **Tap** a vertical string to pluck it. The closely spaced right-hand strings make a broad stroke catch many notes. Strings ascend from left to right, following KEY / SCALE. The default is C Hijaz with Qanun and the warm Rub al Khali gradient.
- **Brush the lower-right corner** to catch short resonances alongside the plucks, without waiting for a hold. Diagonal sweeps pass through several colors. Fast bundled notes fan out over a few milliseconds; excitation and voice counts are bounded.
- **Rake the horizontal strings on their own.** Harmony rows except DRONE retain the last explicitly played vertical string without an expiry. A held harmony retunes with a release crossfade when that anchor changes. Texture brushes can catch recent notes from the last eight seconds. With no recent notes, a small tonic-based seed lets the lower strings sound immediately.
- **Use the empty corner as a resting place.** It makes no sound, but you can start a sweep there and move into the strings. Upper vertical strings pluck without selecting a hidden horizontal resonance.
- **Hold** for 320 ms to couple the nearest crossing. The horizontal resonance blooms over about a second.
- **Move while holding** to weave another crossing. Harmony releases fade over 600 ms; texture releases last 3.5 seconds; DRONE holds a steady level after release. Moving to a new vertical string also gently plucks it.
- **Pull sideways** within a crossing to strengthen the resonance. Multiple fingers work independently; holding the same horizontal string with several fingers strengthens their common resonance and produces slow beating.
- **Release** to let the resonance fall away. Cancelling a touch, leaving the window, opening settings or resizing releases contacts. Esc stops all audio. Page hiding or audio interruption also pauses the loop.

| Horizontal string | Response |
| --- | --- |
| BLOOM | Scale harmony with an opening filter |
| HARM | Octave and upper partials |
| DUST | Overlapping grains of a plucked string |
| FIFTH | Fundamental and exact fifth |
| SILK | Soft triangle tones with slow amplitude movement |
| THIRD | A third from the selected scale |
| SHIMMER | High octaves with independent tremolo |
| OCTAVE | Fundamental and octave |
| ECHO | Neighboring notes returning at dotted-eighth intervals |
| ROOT | Last vertical note and its lower octave |
| MIRAGE | Reversed, windowed string grains |
| DRONE | One independent KEY root in the C1–B1 register across the entire string; no frets or octave doubling |

Texture and pitch threads alternate within the same lower band. FIFTH and HARM deliberately introduce exact fifths. Other scale-degree harmonies preserve fractional MIDI pitches. All synthesis is local.

## LOOM tunings and colors

Hijaz, Hijazkar, Nahawand, Nikriz, Kurd, Rast and Bayati lead the scale picker, alongside western and pentatonic options. Rast and Bayati use fixed 24-tone approximations. These are exploratory **maqam-inspired pitch sets**, not full maqam performance models: melodic development, direction and regional intonation are not modeled. The initial Hijaz uses a Nahawand upper tetrachord, and Nahawand uses its ascending leading-tone version. Sources: [MaqamWorld Hijaz](https://www.maqamworld.com/en/maqam/hijaz.php), [Rast](https://www.maqamworld.com/en/maqam/rast.php), [Bayati](https://www.maqamworld.com/en/maqam/bayati.php), [Nikriz](https://www.maqamworld.com/en/maqam/nikriz.php). Note labels such as E3↓50 mean 50 cents below E3. Legacy Japanese tuning definitions remain internally for compatibility, but are excluded from LOOM's picker and dice.

New exploratory options: **Jan Hammer**, defined here as Mixolydian without its third (1, 2, 4, 5, 6, ♭7; C D F G A B♭); **Egyptian** suspended pentatonic; **Lydian dominant**; **Hungarian minor**; and **Whole tone**. DRONE remains one sustained root even in ARP. Scale reference: [Mixolydian hexatonic](https://www.pianoscales.org/mixolydian-hexatonic.html).

Qanun uses slightly detuned plucked courses; Santur adds a bright hammer-like attack; Oud has a short wooden body. They are synthesized interpretations, not samples. Existing voices remain available.

SETTINGS offers ten three-color gradients: Rub al Khali (pink/orange/gold), Wadi Rum (coral/orchid/periwinkle), Petra (copper/cream/turquoise), Siwa (mint/lime/sand), Zagros (blue/violet/blush), Danakil (red/amber/chartreuse), Pamukkale (cyan/white/lilac), Hormuz (turquoise/purple/rose), Dasht-e Kavir (ivory/blue/pink) and Wadi Qamar (indigo/teal/moonlight). Explicit RGB stops keep these color combinations distinct. Only the loom changes color; the original dark navy UI and cyan controls stay fixed.

**DRONE** is the thicker bottom course. Touch it anywhere to start one low KEY root, independent of vertical notes, SCALE and octave. It stays at a steady level after release. Repeated touches re-articulate the same drone with a short dip and renewed attack, without stacking voices. CLEAR stops the drone and clears the loop; Escape stops all audio. Changing KEY stops the old drone. Loop playback sustains its own drone until PAUSE or CLEAR. There are no frets or octave doubling.

The continuous strings carry wave packets outward from each contact. Release tails keep the corresponding strings softly vibrating until the sound fades. A bright knot indicates a held crossing; fine colored rings mark the recorded hand during playback. Reduced motion keeps brightness feedback while removing displacement. There are no decorative particles or pad cells.

## Loop

Press **REC**, then play. The first pluck or horizontal brush starts two bars; a click guides recording. Plucks store string position and articulation. Couplings also store **vertical string, horizontal string, start step, strength and duration**. Brushed resonances retain their faster attack and their excitation position along the horizontal string. Onset is quantized to sixteenths; hold lengths retain fractional steps. Contacts held beyond the end are clipped to the loop boundary. The loop restarts automatically, reproducing both resonance and string motion under your live playing.

**PAUSE** retains the phrase, **PLAY** restarts it, and **CLEAR** releases recorded resonances and erases the phrase. Key / scale / octave retune subsequent playback. VOICE changes vertical plucks and harmony threads together. Harmony holds gently re-excite that same synthesis while held. Texture threads and the lowest DRONE retain their own synthesis. Tempo is locked during recording. A tempo change affects subsequently scheduled events; an already sounding held loop voice completes its scheduled release. Loops live in page memory and disappear on reload.

**FLOW** remains an optional quiet accompaniment. It follows tuning and tempo and is never recorded. **PLUCK** plays one string. Below 46% of its length, a fifth joins the note; below 76%, an octave joins too. The vertical strings change gradient color at marked +5th and +8ve boundaries. Boundary hysteresis prevents repeated retriggers from a resting finger. Moving down the same string opens these layers without requiring another tap. **CHORD** opens three scale degrees together. **ARP** cycles through those degrees while held, on eighth-note beats following BPM and sharing the transport clock. Each mode also supports held crossings; vertical chord and arpeggio notes store their added intervals as individual plucks. Horizontal ARP works on the left ends as well as at crossings: it cycles through the selected row’s pitches, following the latest vertical anchor for harmony rows. Horizontal ARP events store the row, anchor string and note index. Loop playback preserves that anchor and retunes to KEY / SCALE without expanding the mode again.

## Controls and keyboard

The upper controls remain KEY, SCALE, VOICE, dice, SOUND and SETTINGS. The lower controls remain ECHO, HALL, VOLUME, BPM / TAP, REC / CLEAR and the loop progress strip. Settings retain octave, color, decay, glow, swing, metronome, note labels and reduced motion. Decay and VOICE control the original plucks; contact duration controls woven resonance. Both enter the same effects bus.

Focus the strings by clicking or tabbing to them:

- `A S D F G H J Q W E R T Y U`: 14 strings, low to high. Hold to couple.
- `1`–`0`, `-`, `=`: choose a horizontal string for the next keyboard note.
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

The suite retains the original music/audio checks and replaces circular-gesture checks with tap/hold, weaving, multitouch, cancellation, crossing-duration recording, loop-boundary and keyboard tests. `tests/browser.cjs` checks actual Chrome touch input and five viewport sizes; `tests/sound.cjs` renders all twelve resonances, the three new voices and a ten-contact mix through Web Audio to check audibility, finite output and release. These browser scripts use the local bundled Playwright and installed Chrome paths; adjust them on other machines. Generated screenshots and the dry resonance check WAV are in `artifacts/`.

Actual iPhone Safari sound, latency and prolonged touch feel still require device testing.
