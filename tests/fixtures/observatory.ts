// Explicit exports retain Node ESM interop for the legacy fixture entry point.
export {
  observatoryFixtureTime,
  observatoryFixtureId,
  observatoryFixtureProvenance,
  observatoryFixtureResource,
  observatoryFixtureSignal,
  observatoryFixtureInput,
  mixedObservatoryFixture,
  operationalObservatoryFixture,
  scaleObservatoryFixture,
  projectObservatory,
} from "../../packages/test-support/src/observatory";
