// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";

const app = await loadPluginApp(() => import("./app"));

function openMenu(trigger: HTMLElement) {
  trigger.dispatchEvent(
    new MouseEvent("pointerdown", { bubbles: true, button: 0 }),
  );
}

describe("GitHub app navigation", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("opens issue details in the URL-backed page instead of a fixed tab", async () => {
    const panel = app.navPanels[0]!;
    expect(panel.fixedTabs).toBeUndefined();

    const slot = renderSlot(
      panel,
      { subPath: "issues" },
      {
        rpc: {
          listItems: () => ({
            items: [
              {
                repo: "get-bb/bb",
                number: 42,
                kind: "issue",
                title: "Route-backed issue",
                state: "OPEN",
                author: "octocat",
                labels: [],
                assignees: [],
                url: "https://github.com/get-bb/bb/issues/42",
                body: "",
                updatedAt: "2026-08-20T00:00:00.000Z",
              },
            ],
          }),
          listLinks: () => ({ links: {} }),
          status: () => ({
            ghOk: true,
            ghState: "ready",
            ghError: null,
            repos: [{ repo: "get-bb/bb", projectId: null }],
            lastSyncedAt: null,
          }),
          viewer: () => ({ login: "octocat" }),
        },
      },
    );

    (await slot.findByText("Route-backed issue")).click();
    expect(slot.navigateCalls).toContainEqual({
      method: "toPluginPanel",
      path: "github",
      options: { subPath: "issues/get-bb/bb/42" },
    });
    slot.lifecycle.unmount();
  });

  it("uses the standard responsive page inset for the main panel", () => {
    const slot = renderSlot(
      app.navPanels[0]!,
      { subPath: "" },
      {
        rpc: {
          listItems: () => ({ items: [] }),
          status: () => ({
            ghOk: true,
            ghState: "ready",
            ghError: null,
            repos: [],
            lastSyncedAt: null,
          }),
          viewer: () => ({ login: "octocat" }),
        },
      },
    );

    expect(slot.container.firstElementChild?.className).toContain("p-4 md:p-5");
    expect(slot.container.firstElementChild?.className).not.toContain("p-3");
    slot.lifecycle.unmount();
  });

  it("keeps removed pull-request files out of live workspace navigation", async () => {
    const slot = renderSlot(
      app.threadPanelActions[0]!,
      { threadId: "thr-1", params: null },
      {
        rpc: {
          pullForThread: () => ({
            pull: {
              repo: "get-bb/bb",
              number: 42,
              environmentId: "env-1",
            },
          }),
          getPull: () => ({
            pull: {
              repo: "get-bb/bb",
              number: 42,
              title: "Navigation fix",
              state: "OPEN",
              author: "octocat",
              body: "",
              url: "https://github.com/get-bb/bb/pull/42",
              createdAt: "2026-08-20T00:00:00.000Z",
              updatedAt: "2026-08-20T00:00:00.000Z",
              baseRefName: "main",
              headRefName: "fix-navigation",
              additions: 1,
              deletions: 1,
              changedFiles: 2,
              labels: [],
              assignees: [],
              reviewDecision: "",
              mergeStateStatus: "CLEAN",
              reviewRequests: [],
              checks: [],
              comments: [],
              reviews: [],
              reviewThreads: [],
              files: [
                {
                  path: "removed.ts",
                  status: "removed",
                  additions: 0,
                  deletions: 1,
                  patch: "@@ -1 +0,0 @@\n-removed",
                },
                {
                  path: "modified.ts",
                  status: "modified",
                  additions: 1,
                  deletions: 0,
                  patch: "@@ -0,0 +1 @@\n+added",
                },
              ],
            },
          }),
          listLinks: () => ({ links: {} }),
        },
      },
    );

    await act(async () => {});
    const removedFile = slot.getByText("removed.ts");
    const modifiedFile = slot.getByText("modified.ts");
    expect(removedFile.closest("a")).toBeNull();
    expect(modifiedFile.closest("a")?.getAttribute("href")).toBe(
      "./modified.ts",
    );

    const diffToggle = removedFile.parentElement?.querySelector("button");
    if (!(diffToggle instanceof HTMLButtonElement)) {
      throw new Error("removed file diff toggle was not rendered");
    }
    expect(diffToggle.getAttribute("aria-label")).toBe(
      "Expand removed.ts diff",
    );
    await act(async () => diffToggle.click());
    const diff = slot.getByTestId("bb-diff");
    expect(diff.getAttribute("data-path")).toBe("removed.ts");
    expect(diffToggle.getAttribute("aria-label")).toBe(
      "Collapse removed.ts diff",
    );
    slot.lifecycle.unmount();
  });
  it("names the repository on each row so a cross-repo list is unambiguous", async () => {
    const slot = renderSlot(
      app.navPanels[0]!,
      { subPath: "issues" },
      {
        rpc: {
          listItems: () => ({
            items: [
              {
                repo: "get-bb/bb",
                number: 42,
                kind: "issue",
                title: "Same number, different repo",
                state: "OPEN",
                author: "octocat",
                labels: [],
                assignees: [],
                url: "https://github.com/get-bb/bb/issues/42",
                body: "",
                updatedAt: "2026-08-20T00:00:00.000Z",
              },
              {
                repo: "acme/widgets",
                number: 42,
                kind: "issue",
                title: "Also number 42",
                state: "OPEN",
                author: "octocat",
                labels: [],
                assignees: [],
                url: "https://github.com/acme/widgets/issues/42",
                body: "",
                updatedAt: "2026-08-20T00:00:00.000Z",
              },
            ],
          }),
          listLinks: () => ({ links: {} }),
          status: () => ({
            ghOk: true,
            ghState: "ready",
            ghError: null,
            repos: [
              { repo: "get-bb/bb", projectId: null },
              { repo: "acme/widgets", projectId: null },
            ],
            lastSyncedAt: null,
          }),
          viewer: () => ({ login: "octocat" }),
        },
      },
    );

    // Both rows read "#42", so the repo name is the only thing telling them
    // apart. The owner is dropped from the cell but kept in its title.
    expect(await slot.findByText("bb")).toBeTruthy();
    expect(await slot.findByText("widgets")).toBeTruthy();
    expect(
      slot.container.querySelector('[title="acme/widgets"]'),
    ).not.toBeNull();
    slot.lifecycle.unmount();
  });

  it("sorts table columns and keeps multi-select filters synchronized with the query", async () => {
    const slot = renderSlot(
      app.navPanels[0]!,
      { subPath: "issues" },
      {
        rpc: {
          listItems: () => ({
            items: [
              {
                repo: "get-bb/bb",
                number: 42,
                kind: "issue",
                title: "Zebra regression",
                state: "OPEN",
                author: "octocat",
                labels: [],
                assignees: ["octocat"],
                url: "https://github.com/get-bb/bb/issues/42",
                body: "",
                updatedAt: "2026-08-20T00:00:00.000Z",
              },
              {
                repo: "acme/widgets",
                number: 7,
                kind: "issue",
                title: "Alpha bug",
                state: "OPEN",
                author: "alice",
                labels: [],
                assignees: ["alice"],
                url: "https://github.com/acme/widgets/issues/7",
                body: "",
                updatedAt: "2026-08-22T00:00:00.000Z",
              },
              {
                repo: "mpiv/control-plane",
                number: 11,
                kind: "issue",
                title: "Closed incident",
                state: "CLOSED",
                author: "alice",
                labels: [],
                assignees: ["alice"],
                url: "https://github.com/mpiv/control-plane/issues/11",
                body: "",
                updatedAt: "2026-08-21T00:00:00.000Z",
              },
            ],
          }),
          listLinks: () => ({ links: {} }),
          status: () => ({
            ghOk: true,
            ghState: "ready",
            ghError: null,
            repos: [
              { repo: "get-bb/bb", projectId: null },
              { repo: "acme/widgets", projectId: null },
              { repo: "mpiv/control-plane", projectId: null },
            ],
            lastSyncedAt: null,
          }),
          viewer: () => ({ login: "octocat" }),
        },
      },
    );

    await slot.findByText("Alpha bug");
    expect(slot.getByRole("button", { name: "Repo filter" })).toBeDefined();
    expect(slot.getByRole("button", { name: "Assignee filter" })).toBeDefined();
    expect(
      slot.getByRole("button", { name: "Status filter, 1 selected" }),
    ).toBeDefined();

    slot.getByRole("button", { name: "Sort by Title" }).click();
    await slot.findByRole("button", { name: "Sort by Title, ascending" });
    const titlesAscending = slot
      .getAllByTestId("github-item-title")
      .map((node) => node.textContent);
    expect(titlesAscending).toEqual(["Alpha bug", "Zebra regression"]);
    slot.getByRole("button", { name: "Sort by Title, ascending" }).click();
    await slot.findByRole("button", { name: "Sort by Title, descending" });
    const titlesDescending = slot
      .getAllByTestId("github-item-title")
      .map((node) => node.textContent);
    expect(titlesDescending).toEqual(["Zebra regression", "Alpha bug"]);

    openMenu(slot.getByRole("button", { name: "Repo filter" }));
    (
      await slot.findByRole("menuitemcheckbox", { name: "acme/widgets" })
    ).click();
    expect(
      (slot.container.querySelector("input") as HTMLInputElement).value,
    ).toBe("is:open repo:acme/widgets ");
    expect(slot.queryByText("Zebra regression")).toBeNull();
    expect(slot.getByText("Alpha bug")).toBeDefined();
    slot.getByRole("menuitemcheckbox", { name: "get-bb/bb" }).click();
    expect(
      (slot.container.querySelector("input") as HTMLInputElement).value,
    ).toBe("is:open repo:acme/widgets repo:get-bb/bb ");
    expect(slot.getByText("Zebra regression")).toBeDefined();
    const finalRepoOption = slot.getByRole("menuitemcheckbox", {
      name: "mpiv/control-plane",
    });
    finalRepoOption.click();
    expect(
      (slot.container.querySelector("input") as HTMLInputElement).value,
    ).toBe("is:open repo:acme/widgets repo:get-bb/bb repo:mpiv/control-plane ");
    finalRepoOption.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }),
    );
    await slot.findByRole("button", { name: "Status filter, 1 selected" });

    openMenu(slot.getByRole("button", { name: "Status filter, 1 selected" }));
    (await slot.findByRole("menuitemcheckbox", { name: "Open" })).click();
    expect(
      (slot.container.querySelector("input") as HTMLInputElement).value,
    ).toBe("repo:acme/widgets repo:get-bb/bb repo:mpiv/control-plane ");
    slot.getByRole("menuitemcheckbox", { name: "Closed" }).click();
    expect(await slot.findByText("Closed incident")).toBeDefined();

    slot.lifecycle.unmount();
  });
});
