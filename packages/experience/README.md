# Experience preference foundation

`@commandry/experience` provides a small, side-effect-free preference model.
Optional sound and haptic channels start disabled. Visual feedback remains
available when motion or optional channels are suppressed. The resolver checks
user preferences, platform capability, user activation, and whether quiet hours
are active; it never plays audio or triggers vibration.

The local Account screen now stores versioned settings in the current browser
only. A direct user click can preview a restrained generated acknowledgement
tone and a short supported-device vibration; one explicit attention review can
use the same opted-in cue. Quiet hours use device-local time, and repeated cues
are rate limited. The Storybook lab simulates capabilities but never plays a
cue. This preview is not an approved sound asset or a settled semantic feedback
vocabulary. Cross-device sync, category policy, real-device validation, and
future event mappings remain open under OQ-016.
