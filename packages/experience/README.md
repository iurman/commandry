# Experience preference foundation

`@commandry/experience` provides a small, side-effect-free preference model.
Optional sound and haptic channels start disabled. Visual feedback remains
available when motion or optional channels are suppressed. The resolver checks
user preferences, platform capability, user activation, and whether quiet hours
are active; it never plays audio or triggers vibration.

The semantic feedback vocabulary, assets, event priority, rate limits, quiet
hours schedule, and product controls remain open decisions. The local lab
offers a synthetic preview of channel availability. Its controls do not
represent a shipped preference screen.
