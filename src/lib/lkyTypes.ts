export type LkySource = {
  name: string;
  page: number | null;
  excerpt: string;
};

export type LkyChatResponse = {
  answer: string;
  sources: LkySource[];
};

/** Earlier turns, sent with each question so follow-ups have context. */
export type LkyHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};
