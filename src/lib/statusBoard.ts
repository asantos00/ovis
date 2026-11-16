/**
 * The read-only agent status board has its own address (`?app=board`). It is a full-page view rather
 * than a state of the interactive Ovis shell, so entering or leaving it reloads the page and no pane
 * connection or control survives behind it. Other address parameters stay in place: leaving returns
 * to the pane and lens the app was showing.
 */

import type { PullRequestView } from "../../shared/pull-request.ts";

const PARAM = "app";
const BOARD = "board";

/** Whether an address names the agent status board. */
export function statusBoardAddress(search: string): boolean {
  return new URLSearchParams(search).get(PARAM) === BOARD;
}

/** `search` with the board's mark set or dropped, everything else as it was. */
export function withStatusBoardAddress(search: string, board: boolean): string {
  const query = new URLSearchParams(search);
  if (board) query.set(PARAM, BOARD);
  else if (query.get(PARAM) === BOARD) query.delete(PARAM);
  const text = query.toString();
  return text ? `?${text}` : "";
}

/** A PR's compact operations-board state, checks taking precedence over merge readiness. */
export function statusBoardPullRequestState(view: PullRequestView): "draft" | "merged" | "closed" | "failing" | "pending" | "ready" | "open" {
  if (view.draft) return "draft";
  if (view.state === "merged") return "merged";
  if (view.state === "closed") return "closed";
  if (view.checks.some((check) => check.state === "fail")) return "failing";
  if (view.checks.some((check) => check.state === "pending")) return "pending";
  if (view.mergeable) return "ready";
  return "open";
}

/** An issue explicitly named by a PR title or its branch, never the PR number merely appearing in its URL. */
export function statusBoardIssueNumber(view: PullRequestView): number | null {
  const title = /(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d{1,8})\b/i.exec(view.title)?.[1]
    ?? /\[#(\d{1,8})\]/.exec(view.title)?.[1];
  if (title !== undefined) return Number(title);
  const branch = /(?:^|[\/_-])(?:issue[\/_-]?)?#?(\d{1,8})(?=$|[\/_-])/.exec(view.head_ref)?.[1];
  return branch === undefined ? null : Number(branch);
}

/** The issue beside a GitHub PR, on that PR's repository. */
export function statusBoardIssueUrl(view: PullRequestView, issue: number): string | null {
  try {
    const url = new URL(view.url);
    const match = /^(\/[^/]+\/[^/]+)\/pull\/\d+\/?$/.exec(url.pathname);
    if (match === null) return null;
    url.pathname = `${match[1]}/issues/${issue}`;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}
