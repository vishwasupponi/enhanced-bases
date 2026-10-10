# Enhanced Bases for Obsidian

[![Latest Release](https://img.shields.io/github/v/release/vishwasupponi/enhanced-bases?color=3b82f6&label=Version)](https://github.com/vishwasupponi/enhanced-bases/releases/latest)
[![Obsidian](https://img.shields.io/badge/Obsidian-v1.10.2%2B-7C3AED.svg)](https://obsidian.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-10b981.svg)](LICENSE)

> [!NOTE]
> **Safe & Non-Destructive**: This plugin operates strictly at the UI display level. It **never modifies, edits, alters, or writes to any files or notes** in your vault on its own (changes only occur when you explicitly edit cells or content yourself).

Original GoodBases Enhanced. A Notion-styled database view for your Obsidian vault.

---

## ✨ Features

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

---

## 🚀 Installation

### From Obsidian Community Plugins *(Recommended)*
1. In Obsidian, navigate to **Settings** → **Community plugins**.
2. Turn off **Restricted mode** if prompted.
3. Click **Browse** and search for **Enhanced Bases**.
4. Click **Install**, then click **Enable**.

### Manual Installation
1. Download `main.js`, `manifest.json`, and `styles.css` from the [Latest Release](https://github.com/vishwasupponi/enhanced-bases/releases/latest).
2. Inside your Obsidian vault, navigate to `.obsidian/plugins/`.
3. Create a folder named `enhanced-bases` and copy the downloaded files into it.
4. Go to **Settings** → **Community plugins**, click **Reload plugins**, and enable **Enhanced Bases**.

---

## ⚡ Quick Start

1. **Activate the View**: Open any `.base` file (or note containing a Bases block), click the view switcher dropdown in the toolbar, and select **Notion-style table**.
2. **Organize Hierarchies**: Ensure your sub-items have a parent property (e.g., `parent: "[[Parent Note]]"` or `parent item: "[[Parent Note]]"`). They will automatically nest with expandable carets (`▶` / `▼`) and child count badges.
3. **Customize View Options**: Click the view options menu in the base toolbar to customize per-table settings:
   - **Parent property name**: Change the frontmatter field used for hierarchy nesting.
   - **Wrap all content & Vertical lines**: Toggle multiline text wrapping and grid lines.
   - **Open notes in**: Choose whether notes open in a **New tab**, **Side panel**, or the in-place **Page panel**.
   - **Pill properties & Pinned colors**: Select properties to display as colored pills and set custom color overrides.
4. **Interact & Edit**: Drag column headers to reorder, click headers to sort, and double-click cells or checkboxes to edit note frontmatter directly.

---

## 💡 Credits & Acknowledgements

This plugin is a heavily enhanced fork of the original [GoodBases](https://github.com/francescoumberto/GoodBases) plugin created by **Umberto Francesco Carolini**. 

Massive thanks to Umberto for providing the incredible foundational code for this project under the MIT License. If you are looking for the original base version, please check out his repository!

---

## 🛠️ Development

To build the plugin from source:
```bash
npm install
npm run build
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

Developed by [Vishwas Upponi](https://github.com/vishwasupponi).
