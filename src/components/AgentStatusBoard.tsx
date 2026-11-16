/**
 * The full-page, read-only view of every agent: four stable state lanes, with the same roster order,
 * state words, questions and last-turn summaries as the agent inbox. It follows the operations-board
 * pattern used by multi-agent tools such as Conductor and Codex, adapted to Ovis's quiet list surfaces:
 * no draggable cards, workspace controls or click-through rows imply that work can be steered here.
 */
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Terminal, TriangleAlert } from "lucide-react";

import type { Machine } from "../../shared/machines.ts";
import type { AgentStatus } from "../../shared/protocol.ts";
import { agentGroup, type AgentGroup, type AgentRow } from "../lib/agentRoster.ts";
import { inboxKey, inboxLastWords, inboxOrder, inboxSinceAt, inboxStatus, inboxWords } from "../lib/agentInbox.ts";
import type { HeaderConnection } from "../lib/headerConnection.ts";
import { useT, type Translate } from "../lib/i18n.ts";
import { inboxStateWord } from "../lib/inboxRow.ts";
import { agentName } from "../lib/runtimeMove.ts";
import { useSettings } from "../lib/settings.ts";
import type { SidebarActivity } from "../lib/sidebarActivity.tsx";
import { agentTabName, paneMark } from "../lib/sidebarAgents.ts";
import { stateSince } from "../lib/agentStateSince.ts";
import { useAgentStateStamps } from "../lib/useAgentStateSince.ts";
import { questionTargets, useInboxQuestions, type QuestionReads } from "../lib/useInboxQuestions.ts";
import { summaryTargets, useInboxSummaries, type SummaryReads } from "../lib/useInboxSummaries.ts";
import { AgentMark } from "./AgentMark.tsx";
import { agentRowTitle, blockedNote, stateAge } from "./AgentSidebar.tsx";
import { compactWorktreeName, StatusBadge } from "./Sidebar.tsx";
import logoDark from "../assets/brand/logo-dark.png";
import logoLight from "../assets/brand/logo-light.png";
import "./AgentStatusBoard.css";

const GROUPS: readonly AgentGroup[] = ["blocked", "working", "done", "idle"];
const CLOCK_MS = 30_000;

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

function placeOf(row: AgentRow, severalPcs: boolean, t: Translate): string {
  const { machine, entry } = row;
  const tabs = machine.snapshot?.tabs.filter((candidate) => candidate.workspace_id === entry.workspace.workspace_id) ?? [];
  const workspace = entry.workspace.worktree?.is_linked_worktree ? compactWorktreeName(entry.workspace.label) : entry.workspace.label;
  const tab = agentTabName(entry.tab, tabs, t);
  return [severalPcs ? machine.name : null, workspace, tab].filter((part): part is string => Boolean(part)).join(" · ");
}

/** A board row's state glyph: the established status badge, or the warning used for a failed turn. */
function StateMark({ status, failed, label }: { status: AgentStatus | undefined; failed: boolean; label: string }) {
  if (failed) return <span className="status-board-failed" role="img" aria-label={label}><TriangleAlert aria-hidden="true" /></span>;
  return <StatusBadge compact status={status} label={label} />;
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
  const severalPcs = machines.length > 1;

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
    return {
      key, group, status, failed, state, words,
      title: agentRowTitle(row, false).title,
      kind: entry.canonicalAgent,
      mark: paneMark(entry),
      place: placeOf(row, severalPcs, t),
      sinceAt,
    };
  });
  const timed = cards.some((card) => card.sinceAt !== null);
  useEffect(() => {
    if (!timed) return;
    const timer = setInterval(() => setTick((value) => value + 1), CLOCK_MS);
    return () => clearInterval(timer);
  }, [timed]);
  const now = useMemo(() => Date.now(), [tick, summaries, stamps]);
  const grouped = new Map(GROUPS.map((group) => [group, cards.filter((card) => card.group === group)] as const));
  const machineCount = machines.length;
  const liveWord = !loaded ? t("Loading…") : connection === "reconnecting" ? t("Reconnecting…") : t("live");

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
          <span>{t("PCs")} {machineCount}</span>
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
                  <article className="status-board-card" aria-label={`${card.title}, ${card.state}`} key={card.key}>
                    <div className="status-board-card-head">
                      <span className="status-board-avatar" aria-hidden="true">
                        {card.mark === null ? <Terminal /> : <AgentMark agent={card.mark} size={28} />}
                      </span>
                      <div className="status-board-title">
                        <h3>{card.title}</h3>
                        <p>{card.kind === null ? card.place : `${agentName(card.kind)} · ${card.place}`}</p>
                      </div>
                      <span className="status-board-state">
                        <StateMark status={card.status} failed={card.failed} label={card.state} />
                        <span>{card.sinceAt === null ? card.state : `${stateAge(Math.max(0, now - card.sinceAt))} · ${card.state}`}</span>
                      </span>
                    </div>
                    {card.words !== null && <p className="status-board-words">{card.words}</p>}
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
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
