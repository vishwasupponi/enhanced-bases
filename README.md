# Enhanced Bases for Obsidian

> [!NOTE]
> **Safe & Non-Destructive**: This plugin operates strictly at the UI display level. It **never modifies, edits, alters, or writes to any files or notes** in your vault on its own (changes only occur when you explicitly edit cells or content yourself).

Original GoodBases Enhanced. A Notion-styled database view for your Obsidian vault.

## Features

* **🌳 True Sub-Item Hierarchy Tree**  
  Expandable and collapsible parent-child nesting (`▶` / `▼`) with visual depth indentation, real-time child count badges, and automatic detection for `parent`, `parent item`, `subtask_of`, or `[[wikilinks]]`.

* **⇄ Drag-and-Drop Column Reordering**  
  Reorganize table columns on the fly with smooth drag-and-drop header interactions. Your custom column order automatically saves directly inside the base.

* **🎨 Custom Color Wheel & Vibrant Palettes**  
  Style your tags with official Notion shades, modern high-contrast soft pastels, or any custom hex color using the built-in HTML5 color wheel with 1-click white/black text contrast toggles.

* **↕ Smart Multi-State Column Sorting**  
  Cycle through Ascending (`▲`), Descending (`▼`), and Unsorted with a single click. The sorting engine intelligently handles numbers, dates, titles, and clean wikilink aliases.

* **🔍 Enhanced Select & Multi-Select Editor**  
  Search-and-create pill dropdown with multi-select support, quick tag deletion (`✕`), and automatic vault-wide note suggestions complete with folder location hints.

* **📅 Clean Date Formatting & Native Popover Picker**  
  Replaces raw ISO text with clean `DD-MM-YYYY HH:MM AM/PM` formats, paired with an interactive calendar popover featuring year/month navigation and 12-hour AM/PM selection.

* **📄 Hover "OPEN" Button & Notion Page Modal**  
  A sleek "OPEN" button reveals on row hover. Configure notes to open in a New Tab, Split Panel, or an in-place Notion page modal with live frontmatter & body editing.

* **📐 Resizable Layouts & Sticky Headers**  
  Drag column borders to set custom widths, keep headers pinned at the top while scrolling large databases, and toggle cell word-wrapping or vertical grid lines.

* **⚡ Inline Editing & `+ New` Note Row**  
  Direct double-click cell editing with Enter/Escape keyboard shortcuts, interactive checkboxes that write directly to frontmatter, and a quick-add `+ New` row at the table footer.

## Credits & Acknowledgements

This plugin is a heavily enhanced fork of the original [GoodBases](https://github.com/francescoumberto/GoodBases) plugin created by **Umberto Francesco Carolini**. 

Massive thanks to Umberto for providing the incredible foundational code for this project under the MIT License. If you are looking for the original base version, please check out his repository!

## Installation

### Manual Installation
1. Download the latest release assets (`main.js`, `manifest.json`, `styles.css`) from the [Releases](https://github.com/vishwasupponi/enhanced-bases/releases) page.
2. Create a folder named `enhanced-bases` inside your `.obsidian/plugins/` directory.
3. Place the downloaded files inside that folder.
4. Reload Obsidian and enable **Enhanced Bases** under Community Plugins.

## Development

To build the plugin from source:
```bash
npm install
npm run build
```

## 📄 License

This project is licensed under the [MIT License](https://github.com/vishwasupponi/enhanced-bases/blob/main/LICENSE).

---

Developed by [Vishwas Upponi](https://github.com/vishwasupponi).
