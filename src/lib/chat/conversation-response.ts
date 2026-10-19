import type { ComparisonView } from "./comparison-view";
import type { VisibleMessage } from "./history";
import type { ProfileView } from "./profile-view";
import type { ConversationSnapshot, ConversationStatus, RepQuestionRecord } from "./store";

/** A representative question as the employee screen sees it: status only, never the raw answer. */
export type RepQuestionStatusView = Pick<RepQuestionRecord, "id" | "field" | "carId" | "status" | "createdAt" | "answeredAt">;

/** GET /api/conversation body: what the employee screen restores after a reload or a Realtime ping. */
export interface ConversationResponse {
  conversationId: string;
  status: ConversationStatus;
  messages: VisibleMessage[];
  comparison: ComparisonView | null;
  repQuestions: RepQuestionStatusView[];
  /** The profile form and the choices for the option picker (M6). */
  profile: ProfileView;
}

export function toRepQuestionStatuses(snap: Pick<ConversationSnapshot, "repQuestions">): RepQuestionStatusView[] {
  return snap.repQuestions.map(({ id, field, carId, status, createdAt, answeredAt }) => ({ id, field, carId, status, createdAt, answeredAt }));
}
