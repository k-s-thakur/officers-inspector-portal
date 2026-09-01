import { DANTEWADA_GRAM_PANCHAYATS } from "./dantewada-gps";

export const PENDING_REASONS = [
  "MCP Card Missing",
  "Bank Account Issue",
  "Aadhaar Mismatch",
  "Aadhaar-Bank Link",
  "Other / Document",
] as const;
export type PendingReason = (typeof PENDING_REASONS)[number];

export const PENDING_REASON_LABELS: Record<PendingReason, string> = {
  "MCP Card Missing": "MCP Card Missing",
  "Bank Account Issue": "Bank Account Issue",
  "Aadhaar Mismatch": "Aadhaar Mismatch",
  "Aadhaar-Bank Link": "Aadhaar-Bank Link",
  "Other / Document": "Other",
};

export const REGISTRATION_REASONS = [
  "Beneficiary not registered",
  "Aadhaar unavailable",
  "Bank account unavailable",
  "Mobile number unavailable",
  "Documents pending",
  "Other",
] as const;
export type RegistrationReason = (typeof REGISTRATION_REASONS)[number];

export const REGISTRATION_ISSUES = [
  "MCP Card Missing",
  "Aadhaar-Bank Link",
  "Bank Account Issue",
  "Aadhaar Mismatch",
  "Document Missing",
  "Other",
] as const;
export type RegistrationIssue = (typeof REGISTRATION_ISSUES)[number];

export type SurveyStatus = "Completed" | "Pending" | "Registered" | "In Progress" | "Reason Pending" | "Reason Verification Pending";
export type CaseStatus = "Pending" | "Resolved";

const PROJECT_ALIASES: Record<string, string> = {
  KATAKALYAN: "Katekalyan",
};

const GP_ALIASES: Record<string, string> = {
  "BADE BACHELI": "BADEBACHELI",
  "BADE HADHMAMUNDA": "BADE HADMA MUNDA",
  BADELEKHAPAL: "BADELAKHAPAL",
  BENGALUR: "BENGLUR",
  BODALI: "BODLI",
  "CHHOTE BEDMA": "CHHOTEBEDMA",
  CHITALANK: "CHITALANKA",
  CHOTETUMNAR: "CHHOTETUMNAR",
  DUDHIRAS: "DHUDHIRAS",
  FARASPAL: "PHARASPAL",
  FULNAR: "PHULNAR",
  "KARLI 2": "KARLI 02",
  KESHPUR: "KESHAPUR",
  KUAKONDA: "KUWAKONDA",
  MADKAMIRAS: "MADHKAMIRAS",
  MAHRAHAUNRAAR: "MAHARAHAURNAR",
  MOFALNAR: "MOPHALNAR",
  POTLI: "POTALI",
  TOYLANKA: "TOYALANKA",
  TUMIRGUNDA: "TUMRIGUNDA",
};

export interface Beneficiary {
  id: string;
  appId: string;
  serialNo?: string;
  project?: string;
  name: string;
  age?: string;
  gender?: string;
  guardian?: string;
  mobile: string;
  aadhaar: string;
  village: string;
  gp: string;
  block: string;
  rawBlock?: string;
  reason: string;
  reasons?: string[];
  caseStatus: CaseStatus;
  surveyStatus: SurveyStatus;
  registrationStatus?: "Yes" | "No" | "";
  reasonKnown?: "Yes" | "No" | "";
  registrationReason?: string;
  issue?: string;
  officer: string;
  pendingDays: number;
  lastSurvey: string | null;
  priority: "High" | "Medium" | "Low";
  remark?: string;
  issueFlags?: Record<string, boolean>;
}

export interface Filters {
  project?: string;
  block?: string;
  gp?: string;
  village?: string;
  reason?: string;
  officer?: string;
  survey?: string;
  status?: string;
  q?: string;
}

export function applyFilters(rows: Beneficiary[], f: Filters) {
  const q = f.q?.trim().toLowerCase();
  return rows.filter(
    (r) =>
      (!f.project || r.project === f.project) &&
      (!f.block || r.block === f.block) &&
      (!f.gp || r.gp === f.gp) &&
      (!f.village || r.village === f.village) &&
      (!f.reason || beneficiaryMatchesReason(r, f.reason)) &&
      (!f.officer || r.officer === f.officer) &&
      (!f.survey || r.surveyStatus === f.survey) &&
      (!f.status || r.caseStatus === f.status) &&
      (!q ||
        r.name.toLowerCase().includes(q) ||
        r.appId.toLowerCase().includes(q) ||
        r.mobile.includes(q) ||
        (r.project ?? "").toLowerCase().includes(q) ||
        r.village.toLowerCase().includes(q) ||
        r.gp.toLowerCase().includes(q) ||
        r.block.toLowerCase().includes(q)),
  );
}

export function formatBeneficiaryReasons(row: Pick<Beneficiary, "reason" | "reasons">) {
  const reasons = getBeneficiaryReasons(row);
  return reasons.length ? reasons.join(", ") : row.reason;
}

export function getBeneficiaryReasons(row: Pick<Beneficiary, "reason" | "reasons" | "issue" | "issueFlags">) {
  const values = [
    ...(row.reasons ?? []),
    row.reason,
    row.issue,
    ...Object.entries(row.issueFlags ?? {})
      .filter(([, selected]) => selected)
      .map(([reason]) => reason),
  ];

  return unique(values.flatMap(parsePendingReasons));
}

export function getPendingReasonLabel(reason: string) {
  return PENDING_REASON_LABELS[normalizePendingReason(reason) as PendingReason] ?? reason;
}

export function beneficiaryMatchesReason(row: Pick<Beneficiary, "reason" | "reasons" | "issue" | "issueFlags">, reason: string) {
  const normalizedReason = normalizePendingReason(reason);
  return Boolean(normalizedReason && getBeneficiaryReasons(row).includes(normalizedReason));
}

export function normalizeProjectName(value?: string) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return PROJECT_ALIASES[text.toUpperCase()] || text;
}

export function kpis(rows: Beneficiary[]) {
  const total = rows.length;
  const pending = rows.filter((r) => r.caseStatus === "Pending");
  const surveyDone = surveyDoneCount(rows);
  const surveyCompletionVerified = rows.filter(isSurveyCompleted).length;
  const surveyRegistered = rows.filter(isSurveyRegistered).length;
  const surveyReasonPending = rows.filter(isSurveyReasonPending).length;
  const surveyPending = surveyPendingCount(rows);
  const over30 = pending.filter((r) => r.pendingDays >= 30).length;
  const over7 = pending.filter((r) => r.pendingDays >= 7).length;
  const high = pending.filter((r) => r.priority === "High").length;
  const issueNoCount = PENDING_REASONS.reduce((sum, reason) => sum + reasonCount(pending, reason), 0);
  return {
    total,
    pending: surveyPending,
    surveyDone,
    surveyCompletionVerified,
    surveyRegistered,
    surveyReasonPending,
    surveyPending,
    issueNoCount,
    surveyProgress: surveyProgressPct(rows),
    pendingPct: total ? Math.round((surveyPending / total) * 1000) / 10 : 0,
    over7,
    over30,
    high,
  };
}

export interface BlockStat {
  projectSummary: string;
  block: string;
  blockLabel: string;
  total: number;
  pending: number;
  completed: number;
  registered: number;
  surveyPct: number;
  mcp: number;
  bank: number;
  aadhaar: number;
  link: number;
  other: number;
  officers: number;
}

export interface ProjectStat {
  project: string;
  total: number;
  pending: number;
  completed: number;
  registered: number;
  surveyPct: number;
  blocks: number;
  gps: number;
  villages: number;
  mcp: number;
  bank: number;
  aadhaar: number;
  link: number;
  other: number;
}

export function projectStats(rows: Beneficiary[]): ProjectStat[] {
  const map = groupBy(rows.filter((r) => r.project), (r) => r.project || "");
  return [...map.entries()]
    .map(([project, rs]) => {
      const pending = surveyPendingCount(rs);
      const completed = surveyDoneCount(rs);
      const registered = rs.filter(isSurveyRegistered).length;
      const surveyPct = surveyProgressPct(rs);
      return {
        project,
        total: rs.length,
        pending,
        completed,
        registered,
        surveyPct,
        blocks: new Set(rs.map((r) => r.block).filter(Boolean)).size,
        gps: new Set(rs.map((r) => `${r.block}|${r.gp}`).filter(Boolean)).size,
        villages: new Set(rs.map((r) => `${r.block}|${r.gp}|${r.village}`).filter(Boolean)).size,
        mcp: reasonCount(rs, "MCP Card Missing"),
        bank: reasonCount(rs, "Bank Account Issue"),
        aadhaar: reasonCount(rs, "Aadhaar Mismatch"),
        link: reasonCount(rs, "Aadhaar-Bank Link"),
        other: reasonCount(rs, "Other / Document"),
      };
    })
    .sort((a, b) => b.pending - a.pending);
}

export function blockStats(rows: Beneficiary[]): BlockStat[] {
  const map = groupBy(rows, (r) => r.block);
  return [...map.entries()]
    .map(([block, rs]) => {
      const pending = surveyPendingCount(rs);
      const completed = surveyDoneCount(rs);
      const registered = rs.filter(isSurveyRegistered).length;
      const surveyPct = surveyProgressPct(rs);
      return {
        projectSummary: "",
        block,
        blockLabel: block,
        total: rs.length,
        pending,
        completed,
        registered,
        surveyPct,
        mcp: reasonCount(rs, "MCP Card Missing"),
        bank: reasonCount(rs, "Bank Account Issue"),
        aadhaar: reasonCount(rs, "Aadhaar Mismatch"),
        link: reasonCount(rs, "Aadhaar-Bank Link"),
        other: reasonCount(rs, "Other / Document"),
        officers: new Set(rs.map((r) => r.officer).filter(Boolean)).size,
      };
    })
    .sort((a, b) => b.pending - a.pending);
}

export function gpStats(rows: Beneficiary[]) {
  const activeBlocks = new Set(rows.map((r) => r.block).filter(Boolean));
  const blocksForMaster = activeBlocks.size ? activeBlocks : new Set(DANTEWADA_GRAM_PANCHAYATS.map((gp) => gp.block));
  const masterKeys = new Set(
    DANTEWADA_GRAM_PANCHAYATS.filter((gp) => blocksForMaster.has(gp.block)).map((gp) => `${gp.block}|${normalizeGpKey(gp.gp)}`),
  );
  const rowGroups = [...groupBy(rows, (r) => `${r.block}|${normalizeGpKey(r.gp)}`).entries()];
  const rowKeys = new Set(rowGroups.map(([key]) => key));
  const missingMasterGroups = DANTEWADA_GRAM_PANCHAYATS.filter((gp) => masterKeys.has(`${gp.block}|${normalizeGpKey(gp.gp)}`) && !rowKeys.has(`${gp.block}|${normalizeGpKey(gp.gp)}`))
    .map((gp) => [`${gp.block}|${normalizeGpKey(gp.gp)}`, []] as [string, Beneficiary[]]);

  return [...rowGroups, ...missingMasterGroups]
    .map(([key, rs]) => {
      const [block = "", gpKey = ""] = key.split("|");
      const master = DANTEWADA_GRAM_PANCHAYATS.find((item) => item.block === block && normalizeGpKey(item.gp) === gpKey);
      const project = rs.find((r) => r.project)?.project ?? "";
      const gp = rs.find((r) => r.gp)?.gp ?? master?.gp ?? gpKey;
      const pending = surveyPendingCount(rs);
      const completed = surveyDoneCount(rs);
      const registered = rs.filter(isSurveyRegistered).length;
      const surveyPending = pending;
      return {
        project,
        block,
        gp,
        villages: new Set(rs.map((r) => r.village)).size,
        total: rs.length,
        pending,
        completed,
        registered,
        surveyPending,
        mcp: reasonCount(rs, "MCP Card Missing"),
        bank: reasonCount(rs, "Bank Account Issue"),
        aadhaar: reasonCount(rs, "Aadhaar Mismatch"),
        link: reasonCount(rs, "Aadhaar-Bank Link"),
        other: reasonCount(rs, "Other / Document"),
        surveyPct: surveyProgressPct(rs),
        high: rs.filter((r) => r.priority === "High" && r.caseStatus === "Pending").length,
      };
    })
    .sort((a, b) => b.pending - a.pending || a.block.localeCompare(b.block) || a.gp.localeCompare(b.gp));
}

export function villageStats(rows: Beneficiary[]) {
  return [...groupBy(rows, (r) => `${r.project || ""}|${r.block}|${r.gp}|${r.village}`).entries()]
    .map(([key, rs]) => {
      const [project = "", block = "", gp = "", village = ""] = key.split("|");
      const pending = surveyPendingCount(rs);
      const completed = surveyDoneCount(rs);
      const registered = rs.filter(isSurveyRegistered).length;
      const last = rs.map((r) => r.lastSurvey).filter(Boolean).sort().at(-1) ?? null;
      return {
        project,
        block,
        gp,
        village,
        total: rs.length,
        pending,
        completed,
        registered,
        surveyPct: surveyProgressPct(rs),
        officer: rs[0]?.officer ?? "",
        lastSurvey: last,
        mcp: reasonCount(rs, "MCP Card Missing"),
        bank: reasonCount(rs, "Bank Account Issue"),
        aadhaar: reasonCount(rs, "Aadhaar Mismatch"),
        link: reasonCount(rs, "Aadhaar-Bank Link"),
        other: reasonCount(rs, "Other / Document"),
        critical: rs.filter((r) => r.priority === "High" && r.caseStatus === "Pending").length,
      };
    })
    .sort((a, b) => b.pending - a.pending);
}

export function officerStats(rows: Beneficiary[]) {
  return [...groupBy(rows, (r) => r.officer).entries()]
    .map(([officer, rs], i) => {
      const completed = surveyDoneCount(rs);
      const pct = rs.length ? Math.round((completed / rs.length) * 1000) / 10 : 0;
      return {
        officer,
        block: rs[0]?.block ?? "",
        assigned: rs.length,
        completed,
        pending: rs.length - completed,
        today: 0,
        avgDays: 0,
        lastActivity: rs.map((r) => r.lastSurvey).filter(Boolean).sort().at(-1) ?? null,
        inactiveDays: 0,
        pct,
        score: Math.round(pct),
        rank: i + 1,
      };
    })
    .sort((a, b) => b.score - a.score)
    .map((o, i) => ({ ...o, rank: i + 1 }));
}

export function reasonStats(rows: Beneficiary[]) {
  return PENDING_REASONS.map((reason) => ({
    filterValue: reason,
    reason: getPendingReasonLabel(reason),
    count: reasonCount(rows, reason),
  })).sort((a, b) => b.count - a.count);
}

export function ageBuckets(rows: Beneficiary[]) {
  const p = rows.filter((r) => r.caseStatus === "Pending");
  return [
    { bucket: "Today", count: p.filter((r) => r.pendingDays < 1).length },
    { bucket: "7+ days", count: p.filter((r) => r.pendingDays >= 7 && r.pendingDays < 15).length },
    { bucket: "15+ days", count: p.filter((r) => r.pendingDays >= 15 && r.pendingDays < 30).length },
    { bucket: "30+ days", count: p.filter((r) => r.pendingDays >= 30).length },
  ];
}

export function alerts(rows: Beneficiary[]) {
  const bs = blockStats(rows);
  const gs = gpStats(rows);
  const vs = villageStats(rows);
  const out: { level: "critical" | "warning" | "info"; title: string; detail: string }[] = [];
  bs.filter((b) => b.pending > 100).forEach((b) =>
    out.push({ level: "critical", title: `${b.block} block: ${b.pending} pending`, detail: `Crossed 100-case threshold · Survey ${b.surveyPct}%` }),
  );
  const over30 = rows.filter((r) => r.caseStatus === "Pending" && r.pendingDays >= 30).length;
  if (over30) out.push({ level: "warning", title: `${over30} beneficiaries pending 30+ days`, detail: "Escalate to Block Officers for time-bound closure" });
  if (gs[0]) out.push({ level: "warning", title: `GP ${gs[0].gp} needs intervention`, detail: `${gs[0].pending} pending · survey ${gs[0].surveyPct}%` });
  if (vs[0]) out.push({ level: "info", title: `Highest pending village: ${vs[0].village}`, detail: `${vs[0].pending} pending · officer ${vs[0].officer}` });
  bs.filter((b) => b.surveyPct < 60).forEach((b) =>
    out.push({ level: "warning", title: `${b.block} survey below target`, detail: `${b.surveyPct}% against 75% district target` }),
  );
  return out;
}

function reasonCount(rows: Beneficiary[], reason: PendingReason) {
  return rows.filter((r) => beneficiaryMatchesReason(r, reason)).length;
}

function surveyPendingCount(rows: Beneficiary[]) {
  return rows.filter((r) => !isSurveyDone(r)).length;
}

function surveyDoneCount(rows: Beneficiary[]) {
  return rows.filter(isSurveyDone).length;
}

function surveyProgressPct(rows: Beneficiary[]) {
  const progressed = surveyDoneCount(rows);
  return rows.length ? Math.round((progressed / rows.length) * 1000) / 10 : 0;
}

function isSurveyDone(row: Beneficiary) {
  return row.registrationStatus === "Yes" || row.registrationStatus === "No" || isSurveyCompleted(row) || isSurveyRegistered(row) || isSurveyReasonPending(row);
}

function isSurveyCompleted(row: Beneficiary) {
  return row.surveyStatus === "Completed";
}

function isSurveyRegistered(row: Beneficiary) {
  return row.surveyStatus === "Registered" || row.surveyStatus === "In Progress";
}

function isSurveyReasonPending(row: Beneficiary) {
  return row.surveyStatus === "Reason Verification Pending" || row.surveyStatus === "Reason Pending";
}

function parsePendingReasons(value?: string) {
  return String(value || "")
    .split(/[,;|]/)
    .map((item) => normalizePendingReason(item))
    .filter((item): item is PendingReason => Boolean(item));
}

function normalizePendingReason(value?: string) {
  const text = String(value || "").replace(/\s+/g, " ").trim().toUpperCase();
  if (!text) return "";
  if (text === "MCP CARD MISSING" || text === "MCP NO") return "MCP Card Missing";
  if (text === "BANK ACCOUNT ISSUE" || text === "BANK NO") return "Bank Account Issue";
  if (text === "AADHAAR MISMATCH" || text === "AADHAAR NO" || text === "ADHAAR MISMATCH") return "Aadhaar Mismatch";
  if (text === "AADHAAR-BANK LINK" || text === "AADHAAR BANK LINK" || text === "ADHAAR-BANK LINK" || text === "ADR-BANK NO") return "Aadhaar-Bank Link";
  if (text === "OTHER / DOCUMENT" || text === "OTHER" || text === "DOCUMENT MISSING" || text === "DOCUMENTS PENDING") return "Other / Document";
  return "";
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function groupBy<T>(rows: T[], getKey: (row: T) => string) {
  const map = new Map<string, T[]>();
  rows.forEach((row) => {
    const key = getKey(row);
    if (!key) return;
    map.set(key, [...(map.get(key) ?? []), row]);
  });
  return map;
}

function normalizeGpKey(value: string) {
  const key = String(value || "")
    .replace(/\s*\([^)]*\)\s*/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  return GP_ALIASES[key] || key;
}
