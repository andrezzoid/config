// A repo's factory profile lives in the repo itself at docs/agents/factory.md,
// written by /setup-factory. Parsing is line-based on purpose: the file is for
// humans first and the CLI reads only the few fields that gate a merge.

export type Profile = {
  found: boolean;
  maxAutonomy: "merge" | "pr";
  mergeMethod: "squash" | "merge" | "rebase";
  oneWayGlobs: string[];
  gates: string[];
  verifySkill: string | null;
};

export const PROFILE_PATH = "docs/agents/factory.md";

const DEFAULTS: Profile = {
  found: false,
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
        const glob = ticks(line)[0] ?? line.replace(/^[-*]\s+/, "").split(/[\s:,(]/)[0];
        if (glob) p.oneWayGlobs.push(glob);
      }
      continue;
    }
    const field = /^[-*]\s*([^:]+):\s*(.*)$/.exec(line);
    if (!field) continue;
    const key = field[1].replace(/[*_]/g, "").trim().toLowerCase();
    const values = ticks(field[2]);
    if (key === "max autonomy" && values[0] === "merge") p.maxAutonomy = "merge";
    else if (key === "merge method" && ["squash", "merge", "rebase"].includes(values[0])) {
      p.mergeMethod = values[0] as Profile["mergeMethod"];
    } else if (key === "gates") p.gates.push(...values);
    else if (key === "verify skill" && values[0]) p.verifySkill = values[0];
  }
  return p;
}
