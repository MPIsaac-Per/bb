# Anysphere Dark theme research

Research date: 2026-08-27

## Conclusion

The authoritative theme currently shipped with Cursor is registered in Cursor's extension manifest as **Cursor Dark**, but the theme JSON names itself **`Cursor Dark Anysphere v0.0.3`**. This is the source to use for an "Anysphere Dark" bb palette.

The theme has a two-level neutral shell rather than a single dark gray:

- editor/content surface: `#181818`
- surrounding chrome (sidebar, panel, title bar, status bar, terminal, inactive tabs): `#141414`
- primary foreground: `#F0F0F0`
- active-line surface: `#262626`
- cool-blue UI accents: `#81A1C1` and `#88C0D0`

For an exact code-highlighting match, bb should register the shipped VS Code theme JSON as a custom code theme instead of choosing an approximate stock Shiki theme. The source declares semantic highlighting and supplies both semantic-token and TextMate rules.

## Primary sources

The findings come from the Cursor application installed on this Mac:

- Cursor application version: `3.17.21`
- Cursor commit: `8f2a112cb2845a97b75fd932ea5c470579ca4060`
- build date: `2026-08-25T01:05:08.089Z`
- extension manifest: `/Applications/Cursor.app/Contents/Resources/app/extensions/theme-cursor/package.json`
- dark theme: `/Applications/Cursor.app/Contents/Resources/app/extensions/theme-cursor/themes/cursor-dark-color-theme.json`
- dark theme SHA-256: `117a4d53e7869b7a780468ff54db2b4ba769c4a34303377ac31f8b99d8f84727`
- light companion: `/Applications/Cursor.app/Contents/Resources/app/extensions/theme-cursor/themes/cursor-light-color-theme.json`
- light theme SHA-256: `00c81e6926f6651e36a5cc877a6481d43c972b643bdc1d08fdc05e6b23badd9b`

The manifest is first-party Cursor distribution evidence: it describes the bundle as `Default Cursor themes`, lists Ryo Lu at an `@anysphere.co` address, registers the dark file with label `Cursor Dark` and `uiTheme: vs-dark`, and points to `ryokun6/cursor-themes`. That GitHub URL currently returns 404, so the installed Cursor resource is the available authoritative artifact. Cursor's [official theme documentation](https://cursor.com/docs/configuration/themes) also says Cursor uses VS Code's theming capabilities.

## Exact dark workbench/editor palette

These are direct values from the shipped dark theme's `colors` object.

### Structural surfaces and text

| Cursor token                             | Value       |
| ---------------------------------------- | ----------- |
| `foreground`                             | `#F0F0F0`   |
| `editor.background`                      | `#181818`   |
| `editor.foreground`                      | `#F0F0F0`   |
| `editorGutter.background`                | `#181818`   |
| `activityBar.background`                 | `#141414`   |
| `activityBar.foreground`                 | `#F0F0F0BD` |
| `sideBar.background`                     | `#141414`   |
| `sideBar.foreground`                     | `#F0F0F0BD` |
| `sideBarSectionHeader.background`        | `#141414`   |
| `panel.background`                       | `#141414`   |
| `statusBar.background`                   | `#141414`   |
| `statusBar.foreground`                   | `#F0F0F099` |
| `titleBar.activeBackground`              | `#141414`   |
| `titleBar.activeForeground`              | `#F0F0F084` |
| `tab.activeBackground`                   | `#181818`   |
| `tab.activeForeground`                   | `#F0F0F0`   |
| `tab.inactiveBackground`                 | `#141414`   |
| `tab.inactiveForeground`                 | `#F0F0F05C` |
| `dropdown.background`                    | `#181818`   |
| `menu.background`                        | `#141414`   |
| `notifications.background`               | `#141414`   |
| `editorWidget.background`                | `#141414`   |
| `editorHoverWidget.background`           | `#141414`   |
| `editorSuggestWidget.background`         | `#141414`   |
| `editorSuggestWidget.selectedBackground` | `#343434`   |

### Interaction states

| Cursor token                           | Value       |
| -------------------------------------- | ----------- |
| `focusBorder`                          | `#F0F0F026` |
| `selection.background`                 | `#F0F0F030` |
| `editor.lineHighlightBackground`       | `#262626`   |
| `editor.selectionBackground`           | `#40404099` |
| `editor.inactiveSelectionBackground`   | `#40404077` |
| `editor.selectionHighlightBackground`  | `#404040CC` |
| `editor.rangeHighlightBackground`      | `#40404052` |
| `editor.hoverHighlightBackground`      | `#F0F0F01E` |
| `editor.wordHighlightBackground`       | `#F0F0F01E` |
| `editor.wordHighlightStrongBackground` | `#F0F0F030` |
| `editor.findMatchBackground`           | `#88C0D066` |
| `editor.findMatchHighlightBackground`  | `#88C0D044` |
| `editorBracketMatch.background`        | `#F0F0F01E` |
| `list.hoverBackground`                 | `#F0F0F011` |
| `list.activeSelectionBackground`       | `#F0F0F01E` |
| `input.background`                     | `#F0F0F00A` |
| `input.border`                         | `#F0F0F013` |
| `scrollbarSlider.background`           | `#F0F0F011` |
| `scrollbarSlider.hoverBackground`      | `#F0F0F01E` |

### Accent and semantic state colors

| Role / Cursor token                                              | Value     |
| ---------------------------------------------------------------- | --------- |
| badge / info accent, `activityBarBadge.background`               | `#88C0D0` |
| button and link, `button.background` / `textLink.foreground`     | `#81A1C1` |
| button/link hover                                                | `#87A6C4` |
| success/addition, `charts.green`                                 | `#3FA266` |
| bright success/addition, `gitDecoration.addedResourceForeground` | `#70B489` |
| warning, `charts.yellow`                                         | `#F1B467` |
| muted warning, `editorGutter.modifiedBackground`                 | `#D2943E` |
| error/deletion, `errorForeground`                                | `#E34671` |
| bright error/deletion, `gitDecoration.deletedResourceForeground` | `#FC6B83` |
| secondary action background                                      | `#626262` |
| secondary action hover                                           | `#818181` |

The source contains 252 workbench/editor color entries. The complete exact map can be reproduced from the primary artifact without transcription loss:

```sh
jq -r '.colors | to_entries[] | "\(.key)=\(.value)"' \
  /Applications/Cursor.app/Contents/Resources/app/extensions/theme-cursor/themes/cursor-dark-color-theme.json
```

## Exact terminal palette

| Role           | Value       |
| -------------- | ----------- |
| background     | `#141414`   |
| foreground     | `#F0F0F0`   |
| black          | `#242424`   |
| red            | `#FC6B83`   |
| green          | `#3FA266`   |
| yellow         | `#D2943E`   |
| blue           | `#81A1C1`   |
| magenta        | `#B48EAD`   |
| cyan           | `#88C0D0`   |
| white          | `#F0F0F0`   |
| bright black   | `#F0F0F099` |
| bright red     | `#FC6B83`   |
| bright green   | `#70B489`   |
| bright yellow  | `#F1B467`   |
| bright blue    | `#87A6C4`   |
| bright magenta | `#B48EAD`   |
| bright cyan    | `#88C0D0`   |
| bright white   | `#FFFFFF`   |
| selection      | `#F0F0F01E` |

## Syntax theme

The dark JSON's exact theme name is **`Cursor Dark Anysphere v0.0.3`**. It sets `semanticHighlighting: true`, defines 40 semantic-token mappings, and defines 225 TextMate token rules. Representative exact rules are:

| Syntax role                         | Exact foreground                       | Notes                  |
| ----------------------------------- | -------------------------------------- | ---------------------- |
| keywords / storage                  | `#82D2CE` / `#82d2ce`                  | cyan                   |
| strings                             | `#e394dc`                              | pink-purple            |
| functions                           | `#efb080` (and `#ebc88d` semantically) | peach                  |
| classes / types                     | `#87c3ff`                              | blue                   |
| properties / attributes             | `#AAA0FA` / `#aaa0fa`                  | lavender               |
| constants                           | `#f8c762`                              | yellow                 |
| numbers                             | `#ebc88d`                              | tan                    |
| variables / punctuation / operators | `#d6d6dd`                              | soft gray              |
| language variables                  | `#CC7C8A`                              | muted rose             |
| comments                            | `#F0F0F099`, italic                    | translucent foreground |
| diagnostic error token              | `#F14C4C`                              | red                    |

The best matching bb code-theme names are therefore registered custom-theme IDs backed by the two shipped JSON files, for example `bb:anysphere-dark:dark` and `bb:anysphere-dark:light`. A stock Shiki theme name would only be an approximation and should not be described as Anysphere's syntax palette.

## Light-mode companion

Anysphere Dark itself has no light variation. Because a bb appearance palette supports both light and dark UI modes, the first-party companion in the same Cursor theme bundle is the least speculative light side. Its exact name is **`Cursor Light v1.0.0`**.

Core light values:

| Role                   | Value       |
| ---------------------- | ----------- |
| editor/content surface | `#FCFCFC`   |
| surrounding chrome     | `#F3F3F3`   |
| foreground             | `#141414`   |
| active line            | `#EAEAEA`   |
| selection              | `#14141414` |
| badge/info accent      | `#005293`   |
| button                 | `#2778C1`   |
| link                   | `#0064B0`   |
| success                | `#00854C`   |
| warning                | `#A46700`   |
| error                  | `#BE1744`   |

This pairing is an implementation recommendation, not a claim that "Anysphere Dark" includes a light variant.

## Suggested bb mapping

The following mapping is an inference from the Cursor token roles above:

| bb token/role                      | Source value                     |
| ---------------------------------- | -------------------------------- |
| dark `--canvas`                    | `editor.background` = `#181818`  |
| dark `--sidebar` and dark chrome   | `sideBar.background` = `#141414` |
| dark `--ink`                       | `editor.foreground` = `#F0F0F0`  |
| dark `--primary`                   | `button.background` = `#81A1C1`  |
| dark informational/timeline accent | badge/info = `#88C0D0`           |
| dark hover surface                 | `#F0F0F011`                      |
| dark active/selected surface       | `#F0F0F01E`                      |
| light `--canvas`                   | `editor.background` = `#FCFCFC`  |
| light `--sidebar` and light chrome | `sideBar.background` = `#F3F3F3` |
| light `--ink`                      | `foreground` = `#141414`         |
| light `--primary`                  | `button.background` = `#2778C1`  |

## Uncertainty and version boundary

- The source is authoritative for installed stable Cursor `3.17.21`, dated 2026-08-25. It does not prove that historical Cursor releases used identical values or that a later release will retain them.
- The package manifest's repository URL is unavailable, so there is no stable upstream permalink for this exact file. The local path, Cursor build metadata, and SHA-256 identify the inspected artifact precisely.
- The product-facing label is now `Cursor Dark`; “Anysphere” survives in the theme JSON's internal name. Exposing the bb palette as `Anysphere Dark` follows the user's requested historical/product name while using the current shipped source.
