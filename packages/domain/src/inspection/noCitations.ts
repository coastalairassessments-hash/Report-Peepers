/**
 * Decision 2026-11-05: customer-facing words say "common practice". No standards, publishers, editions or clauses are named,
 * and nothing says "compliant". One list, used by the data-file tests and by the automatic release gates.
 */
export const BANNED = /\b(ASTM|IICRC|ANSI|ASHRAE|ACGIH|AIHA|OSHA|NIOSH|EPA|ISO ?\d|S500|S520|S530|D7338|62\.[12])\b|complian|conform(s|ity|ance)\b|meets? (the )?(industry )?standard|industry (guideline|standard)s?/i;

export const citationProblems = (text: string): string[] => (BANNED.test(text) ? ["names_a_standard_or_claims_compliance"] : []);
