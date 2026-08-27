# bb-plugin-github

GitHub issues and pull requests inside BB, with one-click agent dispatch.

Install it from the BB Official catalog:

```sh
bb plugin install github
```

## What it does

- **Sidebar panel** (GitHub logo, full width): Issues and Pull requests tabs
  across every tracked repo, with a repo filter (persisted in localStorage)
  and a New issue form.
- **Issue detail**: markdown body, comments, comment box, status,
  assignee, and label editing, plus "Send agent".
  Deep-linkable via the URL hash: `#/issues/<owner>/<repo>/<number>`.
- **Send agent / Review with agent**: spawns a BB worker thread on the issue
  (or a review thread on the PR) in the repo's BB project. The issue/PR then
  shows a ⚡ pill linking to the thread.
- **Homepage section**: recent open issues with the same Send agent buttons.
- **Mentions**: `@` or `#` in any composer completes GitHub issues and PRs; the
  selected item's title/body/state is attached as agent context at send time.
- **Repo picker** (Settings → GitHub → Repositories): your account and every
  org you belong to, with a checkbox per repo choosing which ones feed the tabs.
- **`bb github` CLI**: `repos [--available]`, `track`, `untrack`,
  `issues [repo]`, `prs [repo]`, `sync` — also discoverable by agents through
  the plugin-commands skill.

## Auth

Uses the GitHub CLI. If `gh auth status` passes, the plugin works; otherwise
it reports needs-configuration. No tokens are stored by the plugin.

## Which repos are tracked

The union of three sources:

- Every BB project source whose checkout has a GitHub `origin` remote
  (repo → project mapping is also how spawn picks the project).
- Repos checked in Settings → GitHub → Repositories. The selection lives in
  plugin storage rather than in `extraRepos`, because a plugin can read its
  declarative settings but not write them. Repos from the other two sources
  render checked and disabled, with the reason beside them.
- The `extraRepos` setting: an explicit comma-separated `owner/repo` list.
  Wildcards are not supported. `owner/*` tracks nothing, warns in the log, and
  is called out in the picker; use the picker for whole-owner tracking.

`defaultProject` decides where threads spawn for repos with no project of their
own, which is every repo added through the picker or `extraRepos`. Set it
before using Send agent on one.

The same selection from the CLI:

```
bb github repos --available     # everything you can track, with its state
bb github track owner/repo
bb github untrack owner/repo    # clears the picker selection only
```

A background service refreshes the issue/PR cache every 5 minutes; the
panel's Refresh button (or `bb github sync`) forces it.

## Development

Run the checks from the repository root:

```sh
pnpm exec turbo run typecheck test --filter=bb-plugin-github
```
