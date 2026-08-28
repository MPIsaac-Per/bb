# Per-project sidebar thread row limits

Linear: MPI-1552

## User and job

A BB user with projects that contain many threads needs each project folder to stay compact while every thread remains reachable with ordinary wheel, trackpad, touch, and keyboard navigation.

## Acceptance criteria

- Project settings offers an independent maximum visible thread-row setting for each project.
- The setting persists on the project and follows it across clients. Its null state preserves the existing unlimited project list.
- A configured project thread list is bounded to the selected number of standard sidebar rows and scrolls natively.
- Thread order, collapse state, project and thread drag behavior, and keyboard navigation retain their existing data and DOM order.
- Selecting a thread outside the current project scroll window brings that row into view.
- Compact layouts use the same persistent sidebar and native scrolling path without modal primitives or app-root inerting.

## Evidence and metric

The observable metric is successful native `scroll` activity on a bounded project viewport while the full ordered thread set remains present. Component tests cover persisted settings, viewport bounds, the nested windowing root, and selected-row restoration.

## Seam, release, and rollback

- Seam: `ProjectRow` owns the optional bounded viewport around its existing `ProjectThreadTree`.
- Flag field: `projects.sidebar_thread_row_limit`. A null value is the dark/unlimited state.
- Release: users or agents opt a project into a limit from Project settings, the SDK, or `bb project update --thread-row-limit`.
- Rollback: select Unlimited for each configured project, or revert the feature commit.

## Removal

Set every project limit to null, then delete the Project settings control, optional viewport, CLI/SDK field, and nested scroll-root lookup. Contract the nullable database column only in a later destructive migration with explicit approval.
