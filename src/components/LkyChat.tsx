"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  BookOpenIcon,
  BuildingLibraryIcon,
  ExclamationCircleIcon,
  HandThumbDownIcon,
  HandThumbUpIcon,
  PaperAirplaneIcon,
} from "@heroicons/react/24/outline";
import type {
  LkyChatResponse,
  LkyHistoryMessage,
  LkySource,
} from "@/lib/lkyTypes";

const MAX_QUESTION_LENGTH = 1000;
// The server only reads the last 6 messages, and the first 2000 characters
// of each.
const HISTORY_MESSAGES = 6;
const HISTORY_MESSAGE_LENGTH = 2000;
const UNAVAILABLE_MESSAGE =
  "The archives are temporarily unavailable. Please try again.";

const SUGGESTIONS = [
  "What were your early experiences during the Japanese Occupation?",
  "How did you approach bilingualism in Singapore?",
  "Describe your philosophy on pragmatism vs. idealism.",
];

type Rating = "up" | "down";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: LkySource[];
  isError?: boolean;
  rating?: Rating;
};

async function askArchives(
  question: string,
  history: LkyHistoryMessage[],
): Promise<LkyChatResponse> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, history }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error ?? UNAVAILABLE_MESSAGE);
  }
  return response.json();
}

function Avatar() {
  return (
    <div
      className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-secondary text-[0.65rem] font-semibold text-secondary-foreground"
      aria-hidden="true"
    >
      LKY
    </div>
  );
}

function Sources({ sources }: { sources: LkySource[] }) {
  return (
    <details className="group mt-3 text-sm">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-2 text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
        <BookOpenIcon className="size-4" aria-hidden="true" />
        Sources ({sources.length})
      </summary>
      <div className="mt-3 flex flex-col gap-2">
        {sources.map((source, i) => (
          <div key={i} className="rounded-lg border border-border p-3">
            <div className="flex justify-between gap-3 font-medium text-foreground">
              <span className="[overflow-wrap:anywhere]">{source.name}</span>
              {source.page !== null && (
                <span className="shrink-0 text-xs font-normal text-muted-foreground">
                  Page {source.page}
                </span>
              )}
            </div>
            <p className="mt-2 border-l-2 border-border pl-3 italic text-muted-foreground [overflow-wrap:anywhere]">
              &ldquo;{source.excerpt}...&rdquo;
            </p>
          </div>
        ))}
      </div>
    </details>
  );
}

export default function LkyChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  async function handleSend() {
    const question = input.trim();
    if (!question || loading) return;

    // Failed replies are left out, so the model never sees error text.
    const history = messages
      .filter((m) => !m.isError)
      .slice(-HISTORY_MESSAGES)
      .map(({ role, content }) => ({
        role,
        content: content.slice(0, HISTORY_MESSAGE_LENGTH),
      }));

    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", content: question },
    ]);
    setInput("");
    setLoading(true);

    let reply: Message;
    try {
      const { answer, sources } = await askArchives(question, history);
      reply = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: answer,
        sources,
      };
    } catch (err) {
      reply = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: err instanceof Error ? err.message : UNAVAILABLE_MESSAGE,
        isError: true,
      };
    }

    setMessages((prev) => [...prev, reply]);
    setLoading(false);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleFeedback(message: Message, rating: Rating) {
    const newRating = message.rating === rating ? undefined : rating;
    setMessages((prev) =>
      prev.map((m) => (m.id === message.id ? { ...m, rating: newRating } : m)),
    );

    if (newRating) {
      // Best effort: a lost rating shouldn't interrupt the conversation.
      fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: message.id, rating: newRating }),
      }).catch(() => {});
    }
  }

  const feedbackButton = (pressed: boolean) =>
    `rounded-md p-1.5 transition-colors ${
      pressed
        ? "bg-accent text-foreground"
        : "text-muted-foreground hover:bg-accent hover:text-foreground"
    }`;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          The LKY Archives
        </h1>
        <p className="mt-2 text-muted-foreground">
          An AI conversation inspired by the words of Lee Kuan Yew, answered
          from his speeches and memoirs.
        </p>
      </header>

      <div className="flex h-[min(70dvh,44rem)] min-h-[28rem] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6">
          {messages.length === 0 ? (
            <div className="mx-auto flex h-full max-w-xl flex-col items-center justify-center text-center">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
                <BuildingLibraryIcon className="size-7" aria-hidden="true" />
              </div>
              <p className="mt-5 text-pretty font-medium leading-relaxed text-foreground">
                Ask about his life, his policies, and the building of Singapore.
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Answers draw on a collection of his speeches and memoirs.
              </p>
              <div className="mt-12 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setInput(suggestion)}
                    className="rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-6" aria-live="polite">
              {messages.map((message) =>
                message.role === "user" ? (
                  <div
                    key={message.id}
                    className="max-w-[85%] self-end whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-4 py-3 text-primary-foreground [overflow-wrap:anywhere]"
                  >
                    {message.content}
                  </div>
                ) : (
                  <div key={message.id} className="flex max-w-[92%] gap-3">
                    <Avatar />
                    <div className="min-w-0">
                      <div className="whitespace-pre-wrap rounded-2xl rounded-tl-md border border-border bg-background px-4 py-3 leading-relaxed text-foreground [overflow-wrap:anywhere]">
                        {message.content}
                      </div>

                      {message.isError ? (
                        <p className="mt-2 flex items-center gap-2 text-sm text-destructive">
                          <ExclamationCircleIcon
                            className="size-4"
                            aria-hidden="true"
                          />
                          Couldn&apos;t reach the archives
                        </p>
                      ) : (
                        <>
                          {message.sources && message.sources.length > 0 && (
                            <Sources sources={message.sources} />
                          )}
                          <div className="mt-2 flex gap-1">
                            <button
                              type="button"
                              aria-label="Helpful"
                              aria-pressed={message.rating === "up"}
                              onClick={() => handleFeedback(message, "up")}
                              className={feedbackButton(
                                message.rating === "up",
                              )}
                            >
                              <HandThumbUpIcon
                                className="size-4"
                                aria-hidden="true"
                              />
                            </button>
                            <button
                              type="button"
                              aria-label="Not helpful"
                              aria-pressed={message.rating === "down"}
                              onClick={() => handleFeedback(message, "down")}
                              className={feedbackButton(
                                message.rating === "down",
                              )}
                            >
                              <HandThumbDownIcon
                                className="size-4"
                                aria-hidden="true"
                              />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ),
              )}

              {loading && (
                <div className="flex gap-3">
                  <Avatar />
                  <div
                    role="status"
                    className="flex items-center gap-3 rounded-2xl rounded-tl-md border border-border bg-background px-4 py-3 text-sm text-muted-foreground"
                  >
                    Consulting the archives
                    <span className="flex gap-1" aria-hidden="true">
                      {[0, 150, 300].map((delay) => (
                        <span
                          key={delay}
                          className="size-1.5 animate-bounce rounded-full bg-muted-foreground"
                          style={{ animationDelay: `${delay}ms` }}
                        />
                      ))}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-border p-3 sm:p-4">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question..."
              aria-label="Your question"
              disabled={loading}
              maxLength={MAX_QUESTION_LENGTH}
              rows={1}
              className="max-h-40 min-h-12 flex-1 cursor-text resize-none rounded-lg border border-input bg-transparent px-3 py-3 text-foreground placeholder:text-muted-foreground disabled:opacity-60"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim() || loading}
              aria-label="Send question"
              className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-all duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <PaperAirplaneIcon className="size-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <p className="mt-3 text-center text-xs text-muted-foreground">
        Press Enter to send, Shift+Enter for a new line. Responses are
        AI-generated and are not Lee Kuan Yew&apos;s actual words.
      </p>
    </div>
  );
}
