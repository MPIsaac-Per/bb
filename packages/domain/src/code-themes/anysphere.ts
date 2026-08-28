import type { JsonObject } from "../json-value.js";

/**
 * Compact bb registrations of Cursor's shipped Anysphere syntax palettes.
 * These preserve the source theme's principal semantic and TextMate roles
 * without vendoring Cursor's entire editor-workbench configuration.
 */
export const anysphereDarkCodeTheme = {
  name: "bb:anysphere-dark:dark",
  displayName: "Anysphere Dark",
  type: "dark",
  semanticHighlighting: true,
  colors: {
    "editor.background": "#181818",
    "editor.foreground": "#F0F0F0",
    "editor.selectionBackground": "#40404099",
    "editor.lineHighlightBackground": "#262626",
  },
  semanticTokenColors: {
    "variable.constant": "#82D2CE",
    "variable.defaultLibrary": "#d6d6dd",
    function: "#ebc88d",
    "function.declaration": "#efb080",
    type: "#87c3ff",
    class: "#87c3ff",
    property: "#AAA0FA",
    decorator: "#a8cc7c",
    selfParameter: "#cc7c8a",
  },
  tokenColors: [
    { scope: "keyword", settings: { foreground: "#82D2CE" } },
    {
      scope: ["storage", "token.storage"],
      settings: { foreground: "#82d2ce" },
    },
    {
      scope: [
        "string",
        "punctuation.definition.string.begin",
        "punctuation.definition.string.end",
      ],
      settings: { foreground: "#e394dc" },
    },
    {
      scope: ["variable", "variable.c"],
      settings: { foreground: "#d6d6dd" },
    },
    {
      scope: [
        "entity.name.function",
        "meta.require",
        "support.function",
        "variable.function",
      ],
      settings: { foreground: "#efb080" },
    },
    {
      scope: [
        "support.class",
        "entity.name.type.class",
        "entity.name.type",
        "entity.name.namespace",
      ],
      settings: { foreground: "#87c3ff" },
    },
    {
      scope: "entity.other.attribute-name",
      settings: { foreground: "#aaa0fa" },
    },
    {
      scope: ["constant", "punctuation.definition.constant"],
      settings: { foreground: "#f8c762" },
    },
    {
      scope: "keyword.operator",
      settings: { foreground: "#d6d6dd" },
    },
    {
      scope: ["comment", "punctuation.definition.comment"],
      settings: { foreground: "#F0F0F099", fontStyle: "italic" },
    },
  ],
} as const satisfies JsonObject;

export const anysphereLightCodeTheme = {
  name: "bb:anysphere-dark:light",
  displayName: "Cursor Light",
  type: "light",
  semanticHighlighting: true,
  colors: {
    "editor.background": "#FCFCFC",
    "editor.foreground": "#141414",
    "editor.selectionBackground": "#14141414",
    "editor.lineHighlightBackground": "#EAEAEA",
  },
  semanticTokenColors: {
    "variable.constant": "#005293",
    "variable.defaultLibrary": "#3B7E84",
    function: "#CD4500",
    type: "#005293",
    class: "#005293",
    property: "#654DC0",
    decorator: "#007041",
    selfParameter: "#92156A",
  },
  tokenColors: [
    { scope: "keyword", settings: { foreground: "#A30034" } },
    {
      scope: ["storage", "storage.type"],
      settings: { foreground: "#A30034" },
    },
    {
      scope: [
        "string",
        "punctuation.definition.string.begin",
        "punctuation.definition.string.end",
      ],
      settings: { foreground: "#7565CC" },
    },
    {
      scope: [
        "entity.name.function",
        "meta.require",
        "support.function",
        "variable.function",
      ],
      settings: { foreground: "#CD4500" },
    },
    {
      scope: [
        "support.class",
        "entity.name.type.class",
        "entity.name.type",
        "entity.name.namespace",
      ],
      settings: { foreground: "#005293" },
    },
    {
      scope: "entity.other.attribute-name",
      settings: { foreground: "#654DC0" },
    },
    {
      scope: ["constant", "entity.name.constant", "variable.other.constant"],
      settings: { foreground: "#005293" },
    },
    {
      scope: "keyword.operator",
      settings: { foreground: "#141414" },
    },
    {
      scope: ["comment", "punctuation.definition.comment", "string.comment"],
      settings: { foreground: "#14141499", fontStyle: "italic" },
    },
  ],
} as const satisfies JsonObject;
