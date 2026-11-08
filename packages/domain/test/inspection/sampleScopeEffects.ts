import { loadScopeEffects, type ScopeEffects } from "../../src/inspection/gaps.js";

/** The real file silences nothing (E09, E10, E11). These tests exercise the silencing mechanism, so they use a sample map. */
export const sampleScopeEffects = (): ScopeEffects => {
  const real = loadScopeEffects();
  return { ...real, effects: { ...real.effects, access: ["Rooms not entered", "Hidden areas", "Beyond the visible spot"] } };
};
