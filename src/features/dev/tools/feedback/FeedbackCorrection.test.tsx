import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetDevRailBadgesForTests } from "@/features/dev/pages/useDevRailBadges";
import type { ResolvedCorrection } from "@/features/intake/feedbackCorrection";
import { queueResponse } from "@/test/feedbackQueueServer";

import { articleFeedbackAdapter } from "./articleFeedbackAdapter";
import { FeedbackReviewQueue } from "./FeedbackReviewQueue";

/**
 * Ticket 59: article feedback connects to the correction that answers it.
 * Drives the Feedback tool the way an admin does, with the network mocked,
 * and asserts what the admin sees and what leaves the page.
 */

const row = {
  id: "fb-0001",
  status: "reviewing",
  schema_version: 1,
  substance_slug: "mescaline",
  substance_title: "Mescaline",
  category: "inaccurate",
  importance: "high",
  details: "The oral duration looks off.",
  contact_email: "reader@example.org",
  honeypot_triggered: false,
  created_at: "2026-08-01T12:00:00.000Z",
  updated_at: "2026-08-01T12:00:00.000Z",
};

const at = "2026-08-03T12:00:00.000Z";

type Server = {
  corrections: ResolvedCorrection[];
  candidates: { proposals: unknown[]; revisions: unknown[] };
  posts: Array<{ path: string; body: unknown }>;
};

function stubServer(initial: Partial<Server> = {}): Server {
  const server: Server = { corrections: [], candidates: { proposals: [], revisions: [] }, posts: [], ...initial };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "https://dose.wiki");
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        server.posts.push({ path: url.pathname, body });
        if (url.pathname.endsWith("/corrections")) {
          server.corrections = [
            {
              change: body.change,
              linkedAt: at,
              state: "pending",
              proposal: { id: body.change.id, status: "submitted", summary: "Fix the oral duration", createdAt: at },
            },
          ];
          return Response.json({ ok: true, feedback: row });
        }
        return Response.json({ ok: true, feedback: { ...row, status: body.status } });
      }
      if (url.pathname === "/api/article-feedback/queue") return queueResponse(input, [row]);
      if (url.pathname === "/api/article-feedback/fb-0001/corrections") {
        return Response.json({ ok: true, corrections: server.corrections, candidates: server.candidates });
      }
      return Response.json({ ok: true, article: 0, site: 0, total: 0 });
    }),
  );
  return server;
}

function renderQueue() {
  return render(
    <FeedbackReviewQueue adapter={articleFeedbackAdapter} statusFilter="all" onStatusFilterChange={() => {}} />,
  );
}

async function correctionSection() {
  return screen.findByRole("region", { name: "Correction" });
}

// Radix Select drives its listbox through pointer-capture APIs jsdom lacks.
beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  resetDevRailBadgesForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("following article feedback to its correction", () => {
  it("lets another admin follow the feedback to the proposed correction and its resulting revision", async () => {
    stubServer({
      corrections: [
        {
          change: { kind: "proposal", id: "prop-000abc" },
          linkedAt: at,
          state: "published",
          proposal: { id: "prop-000abc", status: "applied", summary: "Fix the oral duration", createdAt: at },
          revision: { id: "rev-000999", summary: "Fix the oral duration", createdAt: at },
        },
      ],
    });
    renderQueue();

    const section = await correctionSection();
    expect(await within(section).findByText("Correction published")).toBeInTheDocument();
    expect(within(section).getByRole("link", { name: "Proposal #000abc" })).toHaveAttribute("href", "/dev/queue/prop-000abc");
    expect(within(section).getByText(/Published revision #000999/)).toBeInTheDocument();
    expect(within(section).getByRole("link", { name: "Open article" })).toHaveAttribute("href", "/mescaline");
    expect(within(section).queryByText(/No correction has been published/)).not.toBeInTheDocument();
  });

  it("does not show a rejected or withdrawn proposal as a completed correction", async () => {
    stubServer({
      corrections: [
        {
          change: { kind: "proposal", id: "prop-000rej" },
          linkedAt: at,
          state: "rejected",
          proposal: { id: "prop-000rej", status: "rejected", summary: "Halve the duration", createdAt: at },
        },
        {
          change: { kind: "proposal", id: "prop-000wdn" },
          linkedAt: at,
          state: "withdrawn",
          proposal: { id: "prop-000wdn", status: "superseded", summary: "Reword the duration", createdAt: at },
        },
      ],
    });
    renderQueue();

    const section = await correctionSection();
    expect(await within(section).findByText("Proposal rejected")).toBeInTheDocument();
    expect(within(section).getByText("Proposal withdrawn")).toBeInTheDocument();
    expect(within(section).getByText("No correction has been published for this feedback yet.")).toBeInTheDocument();
    expect(within(section).queryByText("Correction published")).not.toBeInTheDocument();
    expect(within(section).queryByText(/Published revision/)).not.toBeInTheDocument();
  });
});

describe("starting and linking a correction", () => {
  it("opens the article editor on the chosen section with the feedback id and nothing else", async () => {
    const user = userEvent.setup();
    stubServer();
    renderQueue();

    const section = await correctionSection();
    const start = await within(section).findByRole("link", { name: "Start correction" });
    expect(start).toHaveAttribute("href", "/mescaline?feedback=fb-0001");

    await user.click(within(section).getByRole("combobox", { name: "Section to correct" }));
    await user.click(await screen.findByRole("option", { name: "Dosage and duration" }));

    expect(start).toHaveAttribute("href", "/mescaline?feedback=fb-0001&section=dosage");
    expect(start.getAttribute("href")).not.toContain("reader");
  });

  it("links an existing proposal and then shows it as pending, not as a correction", async () => {
    const user = userEvent.setup();
    const server = stubServer({
      candidates: {
        proposals: [{ id: "prop-000def", status: "submitted", summary: "Fix the oral duration", createdAt: at }],
        revisions: [],
      },
    });
    renderQueue();

    const section = await correctionSection();
    expect(await within(section).findByText("No change is linked yet.")).toBeInTheDocument();
    await user.click(within(section).getByRole("button", { name: "Link existing change" }));
    await user.click(within(section).getByRole("combobox", { name: "Change to link" }));
    await user.click(await screen.findByRole("option", { name: /Proposal #000def/ }));
    await user.click(within(section).getByRole("button", { name: "Link" }));

    await waitFor(() =>
      expect(server.posts).toContainEqual({
        path: "/api/article-feedback/fb-0001/corrections",
        body: { change: { kind: "proposal", id: "prop-000def" } },
      }),
    );
    expect(await within(section).findByText("Proposal pending")).toBeInTheDocument();
    expect(within(section).queryByText("Correction published")).not.toBeInTheDocument();
  });
});

describe("explicit outcomes", () => {
  it("records Duplicate as a resolution with its outcome", async () => {
    const user = userEvent.setup();
    const server = stubServer();
    renderQueue();
    await correctionSection();

    await user.click(screen.getByRole("button", { name: "Duplicate" }));
    await waitFor(() =>
      expect(server.posts).toContainEqual({
        path: "/api/article-feedback/fb-0001/status",
        body: { status: "resolved", outcome: "duplicate" },
      }),
    );
    expect(await screen.findByText(/resolved as Duplicate/)).toBeInTheDocument();
  });

  it("asks before closing as No change needed, then records it as a rejection with its outcome", async () => {
    const user = userEvent.setup();
    const server = stubServer();
    renderQueue();
    await correctionSection();

    await user.click(screen.getByRole("button", { name: "No change needed" }));
    const dialog = await screen.findByRole("dialog", { name: "Close as No change needed?" });
    expect(server.posts).toEqual([]);
    await user.click(within(dialog).getByRole("button", { name: "No change needed" }));
    await waitFor(() =>
      expect(server.posts).toContainEqual({
        path: "/api/article-feedback/fb-0001/status",
        body: { status: "rejected", outcome: "no_change_needed" },
      }),
    );
  });
});
