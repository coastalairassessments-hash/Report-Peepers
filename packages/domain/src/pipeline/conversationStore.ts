import type { ConvState, ConvNode, Bone } from "../interview/conversation.js";

/** Where Lou's conversation is kept, one record per case. Deleted with the case, and paused with it by a legal hold. */
export interface ConversationStore {
  nodes: ConvNode[];
  bones: Bone[];
  get(caseId: string): Promise<ConvState | null>;
  put(caseId: string, state: ConvState): Promise<void>;
  delete(caseId: string): Promise<void>;
}

export class InMemoryConversationStore implements ConversationStore {
  private rows = new Map<string, ConvState>();
  constructor(public nodes: ConvNode[], public bones: Bone[]) {}
  async get(caseId: string) { const r = this.rows.get(caseId); return r ? structuredClone(r) : null; }
  async put(caseId: string, state: ConvState) { this.rows.set(caseId, structuredClone(state)); }
  async delete(caseId: string) { this.rows.delete(caseId); }
}
