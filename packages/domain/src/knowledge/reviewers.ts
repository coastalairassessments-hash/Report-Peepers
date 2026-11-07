import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Decision } from "./status.js";

export interface Reviewer { name: string; roles: ("iep" | "owner")[]; active: boolean }
export interface ReviewerRegistry { reviewers: Reviewer[] }

export const loadReviewers = (path = resolve(import.meta.dirname, "../../../../data/knowledge/reviewers.json")): ReviewerRegistry => {
  const r = JSON.parse(readFileSync(path, "utf8")) as ReviewerRegistry;
  if (!Array.isArray(r.reviewers)) throw new Error("reviewers.json: reviewers missing");
  return r;
};

/** A decision counts only when its author is registered, active, and listed for the role they decided in. */
export const countsFor = (reg: ReviewerRegistry, d: Pick<Decision, "reviewer" | "role">): boolean =>
  reg.reviewers.some((r) => r.name === d.reviewer && r.active && r.roles.includes(d.role));
export const registered = (reg: ReviewerRegistry, decisions: Decision[]): Decision[] => decisions.filter((d) => countsFor(reg, d));
