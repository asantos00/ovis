/**
 * The full-page operations board: every PC's agents in stable state lanes, with a read-only live
 * terminal drill-down. Inspection never focuses a pane, takes its input lease or sends a command.
 */
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CircleDot, ExternalLink, GitPullRequest, Terminal, TriangleAlert, X } from "lucide-react";

import type { Machine } from "../../shared/machines.ts";
import type { PullRequestView } from "../../shared/pull-request.ts";
import type { AgentStatus } from "../../shared/protocol.ts";
import { fetchPullRequest, fetchRepoDiffRefs } from "../lib/api.ts";
import { agentGroup, type AgentGroup, type AgentRow } from "../lib/agentRoster.ts";
import { inboxKey, inboxLastWords, inboxOrder, inboxSinceAt, inboxStatus, inboxWords } from "../lib/agentInbox.ts";
import type { HeaderConnection } from "../lib/headerConnection.ts";
import { useT, type Translate } from "../lib/i18n.ts";
import { inboxStateWord } from "../lib/inboxRow.ts";
import { agentName } from "../lib/runtimeMove.ts";
import { useSettings } from "../lib/settings.ts";
import { usePhoneSheetBack } from "../lib/sheetHistory.ts";
import type { SidebarActivity } from "../lib/sidebarActivity.tsx";
import { agentTabName, paneMark } from "../lib/sidebarAgents.ts";
import { stateSince } from "../lib/agentStateSince.ts";
import { statusBoardIssueNumber, statusBoardIssueUrl, statusBoardPullRequestState } from "../lib/statusBoard.ts";
import { useAgentStateStamps } from "../lib/useAgentStateSince.ts";
import { useFocusTrap } from "../lib/useFocusTrap.ts";
import { questionTargets, useInboxQuestions, type QuestionReads } from "../lib/useInboxQuestions.ts";
import { summaryTargets, useInboxSummaries, type SummaryReads } from "../lib/useInboxSummaries.ts";
import { AgentMark } from "./AgentMark.tsx";
import { agentRowTitle, blockedNote, stateAge } from "./AgentSidebar.tsx";
import { AgentStatusTerminal } from "./AgentStatusTerminal.tsx";
import { compactWorktreeName, StatusBadge } from "./Sidebar.tsx";
import logoDark from "../assets/brand/logo-dark.png";
import logoLight from "../assets/brand/logo-light.png";
import "./AgentStatusBoard.css";

const GROUPS: readonly AgentGroup[] = ["blocked", "working", "done", "idle"];
const CLOCK_MS = 30_000;
const PR_WORKERS = 4;

interface WorkContext { pullRequest: PullRequestView | null; branch: string | null }
type WorkContexts = ReadonlyMap<string, WorkContext>;

export interface AgentStatusBoardProps {
  machines: Machine[];
  activity: SidebarActivity;
  connection: HeaderConnection;
  loaded: boolean;
  failure: string | null;
  questionReads: QuestionReads;
  summaryReads: SummaryReads;
  onExit(): void;
}

function placeOf(row: AgentRow, t: Translate): string {
  const { machine, entry } = row;
  const tabs = machine.snapshot?.tabs.filter((candidate) => candidate.workspace_id === entry.workspace.workspace_id) ?? [];
  const workspace = entry.workspace.worktree?.is_linked_worktree ? compactWorktreeName(entry.workspace.label) : entry.workspace.label;
  const tab = agentTabName(entry.tab, tabs, t);
  return [machine.name, workspace, tab].filter(Boolean).join(" · ");
}

function pullRequestKey(row: AgentRow): string {
  return `${row.machine.id}\u0000${row.entry.workspace.workspace_id}`;
}

/** Active work is probed in the background; an inspected resting row is probed on demand. */
function useWorkContexts(rows: readonly AgentRow[], selected: AgentRow | null, activity: SidebarActivity): WorkContexts {
  const targets = useMemo(() => {
    const unique = new Map<string, AgentRow>();
    for (const row of rows) {
      if (row.machine.state === "connected" && agentGroup(inboxStatus(row, activity)) !== "idle") unique.set(pullRequestKey(row), row);
    }
    if (selected?.machine.state === "connected") unique.set(pullRequestKey(selected), selected);
    return [...unique.entries()];
  }, [activity, rows, selected]);
  const signature = targets.map(([key, row]) => `${key}\u0000${row.entry.pane.pane_id}`).join("\u0001");
  const [views, setViews] = useState<Map<string, WorkContext>>(new Map());

  useEffect(() => {
    let live = true;
    let cursor = 0;
    const next = new Map(views);
    const work = async (): Promise<void> => {
      while (live) {
        const target = targets[cursor++];
        if (target === undefined) return;
        const [key, row] = target;
        if (next.has(key)) continue;
        try {
          const pullRequest = await fetchPullRequest({ paneId: row.entry.pane.pane_id, directory: null }, row.machine.id);
          next.set(key, { pullRequest, branch: pullRequest.head_ref });
        } catch {
          try {
            const refs = await fetchRepoDiffRefs({ paneId: row.entry.pane.pane_id, directory: null }, row.machine.id);
            next.set(key, { pullRequest: null, branch: refs.repository.branch });
          } catch {
            next.set(key, { pullRequest: null, branch: null });
          }
        }
        if (live) setViews(new Map(next));
      }
    };
    void Promise.all(Array.from({ length: Math.min(PR_WORKERS, targets.length) }, work));
    return () => { live = false; };
    // `signature` is the stable identity of the targets; `views` deliberately stays out so each result does not restart the queue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
  return views;
}

/** A board row's state glyph: the established status badge, or the warning used for a failed turn. */
function StateMark({ status, failed, label }: { status: AgentStatus | undefined; failed: boolean; label: string }) {
  if (failed) return <span className="status-board-failed" role="img" aria-label={label}><TriangleAlert aria-hidden="true" /></span>;
  return <StatusBadge compact status={status} label={label} />;
}

function PullRequestBadge({ view, compact = false }: { view: PullRequestView; compact?: boolean }) {
  const t = useT();
  const state = statusBoardPullRequestState(view);
  const labels = {
    draft: t("PR draft"), merged: t("PR merged"), closed: t("PR closed"), failing: t("Checks failing"),
    pending: t("Checks pending"), ready: t("Ready to merge"), open: t("Open pull request"),
  } as const;
  return <span className={`status-board-pr is-${state}`} title={view.title}><GitPullRequest aria-hidden="true" />PR #{view.number}{!compact && <span>{labels[state]}</span>}</span>;
}

export function AgentStatusBoard({ machines, activity, connection, loaded, failure, questionReads, summaryReads, onExit }: AgentStatusBoardProps) {
  const t = useT();
  const { settings, resolvedTheme } = useSettings();
  const rows = useMemo(() => inboxOrder(machines, activity, {
    sort: settings.agentGroupSort,
    name: (row) => agentRowTitle(row, settings.sidebarRows === "one").drawn,
  }), [machines, activity, settings.agentGroupSort, settings.sidebarRows]);
  const questions = useInboxQuestions(questionReads, questionTargets(rows, activity));
  const summaries = useInboxSummaries(summaryReads, summaryTargets(rows, activity));
  const stamps = useAgentStateStamps();
  const [tick, setTick] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selectedRow = selectedKey === null ? null : rows.find((row) => inboxKey(row) === selectedKey) ?? null;
  const workContexts = useWorkContexts(rows, selectedRow, activity);

  const cards = rows.map((row) => {
    const { machine, entry } = row;
    const online = machine.state === "connected";
    const status = inboxStatus(row, activity);
    const group = agentGroup(status);
    const key = inboxKey(row);
    const summary = summaries.get(key);
    const failed = online && group === "done" && summary?.failed === true;
    const state = !online ? t("Offline") : failed ? t("Turn failed") : inboxStateWord(group, t);
    const words = online ? inboxWords({
      group,
      blocked: blockedNote(entry.pane, t),
      question: questions.get(key) ?? null,
      plan: entry.pane.plan,
      last: inboxLastWords(summary, t),
    }) : null;
    const sinceAt = online ? inboxSinceAt(group, summary, group === "blocked"
      ? stateSince(stamps, machine.id, entry.pane.pane_id, entry.pane.terminal_id, "blocked") : null) : null;
    const work = workContexts.get(pullRequestKey(row));
    return {
      row, key, group, status, failed, state, words,
      title: agentRowTitle(row, false).title,
      kind: entry.canonicalAgent,
      mark: paneMark(entry),
      place: placeOf(row, t),
      sinceAt,
      pullRequest: work?.pullRequest,
      branch: work?.branch ?? null,
    };
  });
  const selected = selectedKey === null ? null : cards.find((card) => card.key === selectedKey) ?? null;
  const detail = useFocusTrap<HTMLElement>(selected !== null);
  usePhoneSheetBack(() => setSelectedKey(null), selected !== null);
  const timed = cards.some((card) => card.sinceAt !== null);
  useEffect(() => {
    if (!timed) return;
    const timer = setInterval(() => setTick((value) => value + 1), CLOCK_MS);
    return () => clearInterval(timer);
  }, [timed]);
  useEffect(() => {
    if (selected === null) return;
    const close = (event: KeyboardEvent): void => { if (event.key === "Escape") setSelectedKey(null); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [selected]);
  const now = useMemo(() => Date.now(), [tick, summaries, stamps]);
  const grouped = new Map(GROUPS.map((group) => [group, cards.filter((card) => card.group === group)] as const));
  const liveWord = !loaded ? t("Loading…") : connection === "reconnecting" ? t("Reconnecting…") : t("live");
  const issue = selected?.pullRequest ? statusBoardIssueNumber(selected.pullRequest) : null;
  const issueUrl = selected?.pullRequest && issue !== null ? statusBoardIssueUrl(selected.pullRequest, issue) : null;

  return (
    <main className="status-board" aria-label={t("Agent status board")}>
      <header className="status-board-header">
        <div className="status-board-brand">
          <img src={resolvedTheme === "dark" ? logoDark : logoLight} alt="Ovis" width="68" height="24" />
          <span className="status-board-divider" aria-hidden="true" />
          <h1>{t("Agent status board")}</h1>
        </div>
        <div className="status-board-meta">
          <span className={`status-board-live${!loaded ? " is-loading" : connection === "reconnecting" ? " is-reconnecting" : ""}`} role="status">
            <span aria-hidden="true" />{liveWord}
          </span>
          <span>{t("Agents")} {cards.length}</span>
          <span>{t("PCs")} {machines.length}</span>
          <span>{t("Read only")}</span>
          <button type="button" className="icon-button status-board-exit" aria-label={t("Back to Ovis")} title={t("Back to Ovis")} onClick={onExit}>
            <ArrowLeft aria-hidden="true" />
          </button>
        </div>
      </header>
      {failure !== null && <p className="status-board-failure" role="status">{failure}</p>}
      <div className="status-board-lanes">
        {GROUPS.map((group) => {
          const lane = grouped.get(group) ?? [];
          return (
            <section className="status-board-lane" data-group={group} aria-labelledby={`status-board-${group}`} key={group}>
              <header className="status-board-lane-head">
                <h2 id={`status-board-${group}`}>{inboxStateWord(group, t)}</h2>
                <span>{lane.length}</span>
              </header>
              <div className="status-board-list">
                {lane.map((card) => (
                  <button type="button" className="status-board-card" aria-label={`${card.title}, ${card.state}, ${t("Open live terminal")}`} key={card.key} onClick={() => setSelectedKey(card.key)}>
                    <span className="status-board-card-head">
                      <span className="status-board-avatar" aria-hidden="true">
                        {card.mark === null ? <Terminal /> : <AgentMark agent={card.mark} size={28} />}
                      </span>
                      <span className="status-board-title">
                        <strong>{card.title}</strong>
                        <span>{card.kind === null ? card.place : `${agentName(card.kind)} · ${card.place}`}</span>
                      </span>
                      <span className="status-board-state">
                        <StateMark status={card.status} failed={card.failed} label={card.state} />
                        <span>{card.sinceAt === null ? card.state : `${stateAge(Math.max(0, now - card.sinceAt))} · ${card.state}`}</span>
                      </span>
                    </span>
                    {(card.branch !== null || card.pullRequest) && <span className="status-board-work-badges">
                      {card.branch !== null && <span className="status-board-branch">{card.branch}</span>}
                      {card.pullRequest && <PullRequestBadge view={card.pullRequest} compact />}
                    </span>}
                    {card.words !== null && <span className="status-board-words">{card.words}</span>}
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      {selected !== null && <div className="status-board-detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedKey(null); }}>
        <section className="status-board-detail" role="dialog" aria-modal="true" aria-label={`${selected.title}, ${t("Live terminal")}`} ref={detail}>
          <header className="status-board-detail-head">
            <div>
              <span className="status-board-machine">{selected.row.machine.name}</span>
              <h2>{selected.title}</h2>
              <p>{selected.place}</p>
            </div>
            <button type="button" className="icon-button" aria-label={t("Close")} title={t("Close")} onClick={() => setSelectedKey(null)}><X aria-hidden="true" /></button>
          </header>
          <div className="status-board-work-context">
            <span><StateMark status={selected.status} failed={selected.failed} label={selected.state} />{selected.state}</span>
            {selected.branch !== null && <span className="status-board-branch">{selected.branch}</span>}
            {selected.pullRequest && <a href={selected.pullRequest.url} target="_blank" rel="noreferrer"><PullRequestBadge view={selected.pullRequest} /><ExternalLink aria-hidden="true" /></a>}
            {issue !== null && <a href={issueUrl ?? undefined} target={issueUrl ? "_blank" : undefined} rel={issueUrl ? "noreferrer" : undefined}><CircleDot aria-hidden="true" />{t("Issue #{number}", { number: issue })}{issueUrl && <ExternalLink aria-hidden="true" />}</a>}
          </div>
          <AgentStatusTerminal key={`${selected.key}-${resolvedTheme}`} machineId={selected.row.machine.id} paneId={selected.row.entry.pane.pane_id} />
        </section>
      </div>}
    </main>
  );
}

/** The board's own first paint while access and the roster are being checked. */
export function AgentStatusBoardConnecting({ onExit }: { onExit(): void }) {
  const t = useT();
  const { resolvedTheme } = useSettings();
  return (
    <main className="status-board is-connecting" aria-label={t("Agent status board")}>
      <header className="status-board-header">
        <div className="status-board-brand">
          <img src={resolvedTheme === "dark" ? logoDark : logoLight} alt="Ovis" width="68" height="24" />
          <span className="status-board-divider" aria-hidden="true" />
          <h1>{t("Agent status board")}</h1>
        </div>
        <button type="button" className="icon-button status-board-exit" aria-label={t("Back to Ovis")} title={t("Back to Ovis")} onClick={onExit}>
          <ArrowLeft aria-hidden="true" />
        </button>
      </header>
      <p className="status-board-loading" role="status">{t("Connecting to Ovis…")}</p>
    </main>
  );
}
