// A repo's factory profile lives in the repo itself at .agents/factory.md,
// written by /setup-factory: it concerns the agents working on the repo, not
// the code. Parsing is line-based on purpose: the file is for humans first and
// the CLI reads only the few fields that route tickets and gate a merge.

export type Profile = {
  found: boolean;
  tracker: "linear" | "github" | null;
  // The Linear team key, when the tracker is Linear.
  team: string | null;
  maxAutonomy: "merge" | "pr";
  mergeMethod: "squash" | "merge" | "rebase";
  oneWayGlobs: string[];
  gates: string[];
  verifySkill: string | null;
};

export const PROFILE_PATH = ".agents/factory.md";

const DEFAULTS: Profile = {
  found: false,
  tracker: null,
  team: null,
  maxAutonomy: "pr",
  mergeMethod: "squash",
  oneWayGlobs: [],
  gates: [],
  verifySkill: null,
};

function ticks(line: string): string[] {
  return [...line.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim());
}

export function parseProfile(text: string | null): Profile {
  if (text === null) return { ...DEFAULTS };
  const p: Profile = { ...DEFAULTS, found: true, oneWayGlobs: [], gates: [] };
  let section = "";
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      section = heading[1].toLowerCase();
      continue;
    }
    if (/^one[- ]way door/.test(section)) {
      // `glob`: why, or a bare glob followed by a colon, space or bracket.
      if (/^[-*]\s/.test(line)) {
        const entry = line.replace(/^[-*]\s+/, "");
        const glob = entry.startsWith("`") ? ticks(entry)[0] : entry.split(/[\s:,(]/)[0];
        if (glob) p.oneWayGlobs.push(glob);
      }
      continue;
    }
    const field = /^[-*]\s*([^:]+):\s*(.*)$/.exec(line);
    if (!field) continue;
    const key = field[1].replace(/[*_]/g, "").trim().toLowerCase();
    const values = ticks(field[2]);
    if (key === "tracker") {
      const text = field[2].toLowerCase();
      p.tracker = text.includes("github") ? "github" : text.includes("linear") ? "linear" : null;
      p.team = p.tracker === "linear" ? (values[0] ?? null) : null;
    } else if (key === "max autonomy" && values[0] === "merge") p.maxAutonomy = "merge";
    else if (key === "merge method" && ["squash", "merge", "rebase"].includes(values[0])) {
      p.mergeMethod = values[0] as Profile["mergeMethod"];
    } else if (key === "gates") p.gates.push(...values);
    else if (key === "verify skill" && values[0]) p.verifySkill = values[0];
  }
  return p;
}
