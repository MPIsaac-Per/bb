import { describe, expect, it } from "vitest";
import {
  buildSuggestions,
  matchesQuery,
  parseQuery,
  parseSubPath,
  routeToSubPath,
  setQueryFilterValues,
  sortItems,
  type Item,
  type Route,
} from "./app-logic.js";

const issue: Item = {
  repo: "acme/widgets",
  number: 7,
  kind: "issue",
  title: "Fix cache invalidation",
  state: "OPEN",
  author: "alice",
  labels: ["bug", "good first issue"],
  assignees: ["octocat"],
  url: "https://github.com/acme/widgets/issues/7",
  body: "",
  updatedAt: "2026-08-19T12:00:00Z",
};

describe("github panel routes", () => {
  it("round-trips list, create, issue, and pull routes", () => {
    const routes: Route[] = [
      { view: "issues" },
      { view: "pulls" },
      { view: "new" },
      { view: "issue", repo: "acme/widgets", number: 7 },
      { view: "pull", repo: "get-bb/bb", number: 42 },
    ];

    for (const route of routes) {
      expect(parseSubPath(routeToSubPath(route))).toEqual(route);
    }
  });

  it("falls back to the owning list for malformed detail paths", () => {
    expect(parseSubPath("pulls/acme/widgets/not-a-number")).toEqual({
      view: "pulls",
    });
    expect(parseSubPath("issues/acme/widgets/not-a-number")).toEqual({
      view: "issues",
    });
    expect(parseSubPath("issues/acme/widgets/7/extra")).toEqual({
      view: "issues",
    });
    expect(parseSubPath("")).toEqual({ view: "issues" });
  });
});

describe("github panel query engine", () => {
  it("parses quoted qualifiers and matches viewer-relative filters", () => {
    const parsed = parseQuery(
      'is:open assignee:@me author:alice label:"good first issue" repo:acme/widgets #7',
    );

    expect(parsed).toEqual({
      states: ["OPEN"],
      assignees: ["@me"],
      authors: ["alice"],
      labels: ["good first issue"],
      repos: ["acme/widgets"],
      noAssignee: false,
      noLabel: false,
      text: ["#7"],
    });
    expect(matchesQuery(issue, parsed, "octocat")).toBe(true);
    expect(matchesQuery(issue, parsed, null)).toBe(false);
  });

  it("applies negative, state, and plain-text filters independently", () => {
    expect(matchesQuery(issue, parseQuery("is:closed"), "octocat")).toBe(false);
    expect(matchesQuery(issue, parseQuery("no:assignee"), "octocat")).toBe(
      false,
    );
    expect(matchesQuery(issue, parseQuery("no:label"), "octocat")).toBe(false);
    expect(
      matchesQuery(issue, parseQuery("cache acme/widgets"), "octocat"),
    ).toBe(true);
    expect(matchesQuery(issue, parseQuery("missing"), "octocat")).toBe(false);
    expect(matchesQuery(issue, parseQuery("state:"), "octocat")).toBe(true);
  });

  it("builds bounded qualifier values without losing labels containing spaces", () => {
    const vocab = {
      users: ["alice", "octocat"],
      labels: ["bug", "good first issue"],
      repos: ["acme/widgets"],
    };
    const compact = (token: string, kind: "issue" | "pr") =>
      buildSuggestions(token, vocab, kind, "octocat").map(
        ({ insert, label }) => ({ insert, label }),
      );

    expect(compact("is:", "pr")).toEqual([
      { insert: "is:open ", label: "open" },
      { insert: "is:closed ", label: "closed" },
      { insert: "is:merged ", label: "merged" },
    ]);
    expect(compact("label:good", "issue")).toEqual([
      {
        insert: 'label:"good first issue" ',
        label: "good first issue",
      },
    ]);
    expect(compact("assignee:@", "issue")).toEqual([
      { insert: "assignee:@me ", label: "@me (octocat)" },
    ]);
    expect(compact("no:l", "issue")).toEqual([
      { insert: "no:label ", label: "no:label" },
    ]);
    expect(compact("unknown:value", "issue")).toEqual([]);
    expect(buildSuggestions("is:o", vocab, "pr", "octocat")[0]?.icon).toEqual({
      kind: "state",
      itemKind: "pr",
      state: "OPEN",
    });
    expect(
      buildSuggestions("author:ali", vocab, "issue", "octocat")[0]?.icon,
    ).toEqual({ kind: "avatar", login: "alice" });
  });

  it("replaces one structured filter without disturbing the rest of the query", () => {
    expect(
      setQueryFilterValues(
        'is:open state:closed author:alice "cache miss" repo:old/widgets',
        "repo",
        ["acme/widgets", "mpiv/control plane"],
      ),
    ).toBe(
      'is:open state:closed author:alice "cache miss" repo:acme/widgets repo:"mpiv/control plane" ',
    );
    expect(
      setQueryFilterValues("is:open label:bug", "status", ["closed", "merged"]),
    ).toBe("label:bug is:closed is:merged ");
    expect(
      setQueryFilterValues("assignee:alice author:bob", "assignee", []),
    ).toBe("author:bob ");
  });

  it("sorts every visible table column without mutating the source rows", () => {
    const rows: Item[] = [
      issue,
      {
        ...issue,
        repo: "mpiv/control-plane",
        number: 2,
        title: "Add alerts",
        state: "CLOSED",
        assignees: ["alice"],
        updatedAt: "2026-08-21T12:00:00Z",
      },
      {
        ...issue,
        repo: "acme/api",
        number: 19,
        title: "Review webhooks",
        state: "MERGED",
        assignees: [],
        updatedAt: "2026-08-20T12:00:00Z",
      },
    ];

    expect(
      sortItems(rows, { key: "id", direction: "asc" }).map((row) => row.number),
    ).toEqual([2, 7, 19]);
    expect(
      sortItems(rows, { key: "repo", direction: "asc" }).map((row) => row.repo),
    ).toEqual(["acme/api", "acme/widgets", "mpiv/control-plane"]);
    expect(
      sortItems(rows, { key: "title", direction: "asc" }).map(
        (row) => row.title,
      ),
    ).toEqual(["Add alerts", "Fix cache invalidation", "Review webhooks"]);
    expect(
      sortItems(rows, { key: "assignee", direction: "asc" }).map(
        (row) => row.assignees[0] ?? "",
      ),
    ).toEqual(["", "alice", "octocat"]);
    expect(
      sortItems(rows, { key: "status", direction: "asc" }).map(
        (row) => row.state,
      ),
    ).toEqual(["CLOSED", "MERGED", "OPEN"]);
    expect(
      sortItems(rows, { key: "updated", direction: "desc" }).map(
        (row) => row.number,
      ),
    ).toEqual([2, 19, 7]);
    expect(rows[0]).toBe(issue);
  });
});
