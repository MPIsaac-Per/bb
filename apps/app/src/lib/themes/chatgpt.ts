/**
 * ChatGPT-inspired palette. The dark variant uses the product's deep charcoal
 * canvas, soft off-white type, and OpenAI green accent; the light variant keeps
 * the same quiet neutral hierarchy for clients that use light mode. As with the
 * other built-ins, neutral surfaces derive from the canvas/ink anchors in
 * theme.css so the full UI stays internally consistent.
 */
export const chatgptThemeCss = `
:root, .light {
  --canvas: #f7f7f8;
  --ink: #2d333a;
  --primary: #0d8f72;
  --primary-foreground: #ffffff;
  --muted-foreground: color-mix(in oklch, var(--ink) 70%, var(--canvas));
  --subtle-foreground: color-mix(in oklch, var(--ink) 58%, var(--canvas));
  --readback-foreground: color-mix(in oklch, var(--ink) 64%, var(--canvas));
  --timeline-accent: #0d8f72;
  --file-accent: var(--timeline-accent);
  --destructive: #c2413b;
  --destructive-text: #b2332e;
  --warning: #b36b18;
  --warning-text: #8e5412;
  --attention: #9a6b05;
  --success: #0d8f72;
  --diff-added: #0d8f72;
  --diff-removed: #c2413b;
  --pr-merged: #7c5ac7;
  --ansi-0: #2d333a;
  --ansi-1: #c2413b;
  --ansi-2: #0d8f72;
  --ansi-3: #9a6b05;
  --ansi-4: #2563a9;
  --ansi-5: #7c5ac7;
  --ansi-6: #147d92;
  --ansi-7: #d9d9e3;
  --ansi-8: #6e7378;
  --ansi-9: #dc514b;
  --ansi-10: #10a37f;
  --ansi-11: #bd8510;
  --ansi-12: #3b7bc4;
  --ansi-13: #956fdc;
  --ansi-14: #1d91a8;
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
  --ansi-bg-fg-12: #000000;
  --ansi-bg-fg-13: #000000;
  --ansi-bg-fg-14: #000000;
  --ansi-bg-fg-15: #000000;
}
.dark {
  --canvas: #212121;
  --ink: #ececec;
  --primary: #10a37f;
  --primary-foreground: #081b16;
  --sidebar: #171717;
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
  --timeline-accent: #10a37f;
  --file-accent: var(--timeline-accent);
  --destructive: #ef6a63;
  --destructive-text: #f07a74;
  --warning: #f2a33c;
  --warning-text: #f2a33c;
  --attention: #e7c45a;
  --success: #5ed3ad;
  --diff-added: #5ed3ad;
  --diff-removed: #ef6a63;
  --pr-merged: #ad8ee6;
}
`;
