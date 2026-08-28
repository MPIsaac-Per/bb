/**
 * Cursor's built-in Anysphere palette. The anchors, shell surfaces, semantic
 * colors, and terminal colors come from Cursor's shipped Cursor Dark and
 * Cursor Light themes. bb keeps both variants under one palette id because
 * light/dark mode is a separate per-client preference.
 */
export const anysphereDarkThemeCss = `
:root, .light {
  --canvas: #fcfcfc;
  --ink: #141414;
  --primary: #2778c1;
  --primary-foreground: #fcfcfc;
  --sidebar: #f3f3f3;
  --sidebar-accent: color-mix(
    in oklch,
    var(--ink) 9%,
    var(--sidebar)
  );
  --sidebar-border: color-mix(
    in oklch,
    var(--ink) 14%,
    var(--sidebar)
  );
  --muted-foreground: #141414bd;
  --subtle-foreground: #14141499;
  --readback-foreground: #14141499;
  --timeline-accent: #2778c1;
  --file-accent: var(--timeline-accent);
  --destructive: #be1744;
  --destructive-text: #be1744;
  --warning: #a46700;
  --warning-text: #8b5700;
  --attention: #8b5700;
  --success: #007041;
  --diff-added: #007041;
  --diff-removed: #be1744;
  --pr-merged: #92156a;
  --ansi-0: #141414;
  --ansi-1: #be1744;
  --ansi-2: #007041;
  --ansi-3: #8b5700;
  --ansi-4: #0064b0;
  --ansi-5: #92156a;
  --ansi-6: #176c74;
  --ansi-7: #fcfcfc;
  --ansi-8: #767676;
  --ansi-9: #ce405b;
  --ansi-10: #00854c;
  --ansi-11: #a46700;
  --ansi-12: #2778c1;
  --ansi-13: #b54e90;
  --ansi-14: #3b7e84;
  --ansi-15: #ffffff;
  --ansi-bg-fg-0: #ffffff;
  --ansi-bg-fg-1: #ffffff;
  --ansi-bg-fg-2: #ffffff;
  --ansi-bg-fg-3: #ffffff;
  --ansi-bg-fg-4: #ffffff;
  --ansi-bg-fg-5: #ffffff;
  --ansi-bg-fg-6: #ffffff;
  --ansi-bg-fg-7: #000000;
  --ansi-bg-fg-8: #ffffff;
  --ansi-bg-fg-9: #000000;
  --ansi-bg-fg-10: #000000;
  --ansi-bg-fg-11: #000000;
  --ansi-bg-fg-12: #ffffff;
  --ansi-bg-fg-13: #000000;
  --ansi-bg-fg-14: #ffffff;
  --ansi-bg-fg-15: #000000;
}
.dark {
  --canvas: #181818;
  --ink: #f0f0f0;
  --primary: #81a1c1;
  --primary-foreground: #191c22;
  --sidebar: #141414;
  --sidebar-accent: color-mix(
    in oklch,
    var(--ink) 9%,
    var(--sidebar)
  );
  --sidebar-border: color-mix(
    in oklch,
    var(--ink) 12%,
    var(--sidebar)
  );
  --muted-foreground: #f0f0f0bd;
  --subtle-foreground: #f0f0f099;
  --readback-foreground: #f0f0f099;
  --timeline-accent: #88c0d0;
  --file-accent: var(--timeline-accent);
  --destructive: #fc6b83;
  --destructive-text: #fc6b83;
  --warning: #f1b467;
  --warning-text: #f1b467;
  --attention: #d2943e;
  --success: #70b489;
  --diff-added: #3fa266;
  --diff-removed: #fc6b83;
  --pr-merged: #b48ead;
  --ansi-0: #242424;
  --ansi-1: #fc6b83;
  --ansi-2: #3fa266;
  --ansi-3: #d2943e;
  --ansi-4: #81a1c1;
  --ansi-5: #b48ead;
  --ansi-6: #88c0d0;
  --ansi-7: #f0f0f0;
  --ansi-8: #929292;
  --ansi-9: #fc6b83;
  --ansi-10: #70b489;
  --ansi-11: #f1b467;
  --ansi-12: #87a6c4;
  --ansi-13: #b48ead;
  --ansi-14: #88c0d0;
  --ansi-15: #ffffff;
  --ansi-bg-fg-0: #ffffff;
  --ansi-bg-fg-1: #000000;
  --ansi-bg-fg-2: #000000;
  --ansi-bg-fg-3: #000000;
  --ansi-bg-fg-4: #000000;
  --ansi-bg-fg-5: #000000;
  --ansi-bg-fg-6: #000000;
  --ansi-bg-fg-7: #000000;
  --ansi-bg-fg-8: #000000;
  --ansi-bg-fg-9: #000000;
  --ansi-bg-fg-10: #000000;
  --ansi-bg-fg-11: #000000;
  --ansi-bg-fg-12: #000000;
  --ansi-bg-fg-13: #000000;
  --ansi-bg-fg-14: #000000;
  --ansi-bg-fg-15: #000000;
}
`;
