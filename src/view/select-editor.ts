/**
 * Notion-style select editor for pill cells: a floating menu showing the
 * cell's current values (removable), a search/create input, and every distinct
 * value used for the property across the table. List properties multi-select
 * (toggle, menu stays open); scalar pill properties single-select (pick and
 * close).
 *
 * The menu is self-contained: it captures a snapshot of the known values and
 * the editing entry's `file` at construction, never holding stale `BasesEntry`
 * objects, so it survives the view's `onDataUpdated` re-renders. The owning
 * view drives lifetime — outside-click and unload both call {@link close}.
 */
import { App, BasesEntry, BasesPropertyId, TFile } from 'obsidian';
import { valueToStrings } from '../lib/values';

function cleanText(val: string): string {
	if (!val) return '';
	return val.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_: string, target: string, alias?: string): string => {
		if (alias && alias.trim()) return alias.trim();
		const t = target.trim();
		const lastSlash = t.lastIndexOf('/');
		let name = lastSlash !== -1 ? t.substring(lastSlash + 1) : t;
		if (name.toLowerCase().endsWith('.md')) name = name.slice(0, -3);
		return name;
	});
}

export interface SelectEditorDeps {
	/** The Obsidian App instance to query vault files. */
	app: App;
	/** The view's own document (popout-safe; never bare `document`). */
	doc: Document;
	/** The view's own window (popout-safe), used to clamp the menu on screen. */
	win: Window;
	/** Cell element the menu anchors beneath. */
	anchor: HTMLElement;
	/** Every entry in the current result, used to list the known values. */
	entries: BasesEntry[];
	/** The file being edited (a `TFile` is stable across data updates). */
	file: TFile;
	/** The values currently set on the file, in display form. */
	current: string[];
	/** Property being edited. */
	prop: BasesPropertyId;
	/** True for list (multi-select) properties; false for scalar (single-select). */
	isList: boolean;
	/** Color a pill element for the given value. */
	applyColor: (pill: HTMLElement, text: string) => void;
	/** Persist the chosen value (`null` deletes the property). */
	write: (value: unknown) => void;
	/** Pin a value to a specific Notion color name (e.g. `"green"`). */
	setColor: (value: string, colorName: string) => void;
	/** Invoked once when the menu closes, so the owner can drop its reference. */
	onClose: () => void;
}

export class SelectEditor {
	private readonly menu: HTMLElement;
	/** Open color-picker flyout, if any (a sibling popover on the body). */
	private colorMenu: HTMLElement | null = null;
	private colorMenuAnchor: HTMLElement | null = null;
	private closed = false;

	/** Currently selected values (display form, leading `#` stripped). */
	private selected: string[];
	/** Distinct known values for this property: lowercase key → display text. */
	private readonly columnOptions = new Map<string, string>();
	private readonly vaultOptions = new Map<string, string>();

	private pillsWrap!: HTMLElement;
	private optionsEl!: HTMLElement;
	private input!: HTMLInputElement;

	constructor(private readonly deps: SelectEditorDeps) {
		const { entries, current, prop } = deps;

		for (const e of entries) {
			for (const s of valueToStrings(e.getValue(prop))) {
				const display = s.replace(/^#/, '');
				const normKey = cleanText(display).toLowerCase();
				if (normKey && !this.columnOptions.has(normKey)) {
					this.columnOptions.set(normKey, display);
				}
			}
		}
		if (deps.app && deps.app.vault) {
			const vaultFiles = deps.app.vault.getMarkdownFiles();
			for (const f of vaultFiles) {
				const normKey = f.basename.toLowerCase();
				if (!this.columnOptions.has(normKey) && !this.vaultOptions.has(normKey)) {
					const wiki = `[[${f.path.replace(/\.md$/i, '')}|${f.basename}]]`;
					this.vaultOptions.set(normKey, wiki);
				}
			}
		}

		this.selected = current.map((s) => s.replace(/^#/, ''));

		this.menu = this.build();
		this.position();
	}

	/** Whether the given node lives inside the menu or its color flyout. */
	contains(node: Node | null): boolean {
		if (!node) return false;
		return this.menu.contains(node) || (this.colorMenu?.contains(node) ?? false);
	}

	/** The cell element this menu is anchored to (drives click-to-toggle). */
	get anchorEl(): HTMLElement {
		return this.deps.anchor;
	}

	/**
	 * Re-point the menu at a freshly rendered cell for the same file +
	 * property. `onDataUpdated` replaces every `td`, so without this the
	 * anchor would dangle on a detached node and click-to-toggle (which
	 * compares against the live cell) would miss. Returns whether it matched.
	 */
	reanchorIfMatches(td: HTMLElement, filePath: string, prop: BasesPropertyId): boolean {
		if (this.closed) return false;
		if (this.deps.prop !== prop || this.deps.file.path !== filePath) return false;
		this.deps.anchor = td;
		return true;
	}

	/** Tear the menu down. Idempotent; notifies the owner via `onClose`. */
	close(): void {
		if (this.closed) return;
		this.closed = true;
		this.closeColorMenu();
		this.menu.remove();
		this.deps.onClose();
	}

	private closeColorMenu(): void {
		this.colorMenu?.remove();
		this.colorMenu = null;
		this.colorMenuAnchor = null;
	}

	private build(): HTMLElement {
		const { doc, isList } = this.deps;
		const menu = doc.body.createDiv({ cls: 'ntn-root ntn-select-menu' });

		const currentEl = menu.createDiv({ cls: 'ntn-select-current' });
		this.pillsWrap = currentEl.createDiv({ cls: 'ntn-select-pills' });
		this.input = currentEl.createEl('input', {
			type: 'text',
			cls: 'ntn-select-input',
			attr: { placeholder: 'Search or create…', spellcheck: 'false' },
		});
		menu.createDiv({
			cls: 'ntn-select-hint',
			text: isList ? 'Select options or create one' : 'Select an option or create one',
		});
		this.optionsEl = menu.createDiv({ cls: 'ntn-select-options' });

		this.input.addEventListener('input', () => this.renderOptions());
		this.input.addEventListener('keydown', (evt) => this.onKeydown(evt));

		this.renderPills();
		this.renderOptions();
		this.input.focus();

		return menu;
	}

	/** Empty selection deletes the property (`write` treats `null` as delete). */
	private write(): void {
		const out: unknown = this.deps.isList
			? (this.selected.length ? this.selected : null)
			: (this.selected[0] ?? null);
		this.deps.write(out);
	}

	private renderPills(): void {
		this.pillsWrap.empty();
		for (const v of this.selected) {
			const pill = this.pillsWrap.createSpan({ cls: 'ntn-pill' });
			this.deps.applyColor(pill, cleanText(v));
			pill.createSpan({ text: cleanText(v) });
			const x = pill.createSpan({ cls: 'ntn-pill-remove', text: '✕' });
			x.addEventListener('click', (evt) => {
				evt.stopPropagation();
				this.selected = this.selected.filter((s) => s !== v);
				this.write();
				this.renderPills();
				this.renderOptions();
			});
		}
	}

	private pick(v: string): void {
		if (this.deps.isList) {
			const has = this.selected.some((s) => s.toLowerCase() === v.toLowerCase());
			this.selected = has
				? this.selected.filter((s) => s.toLowerCase() !== v.toLowerCase())
				: [...this.selected, v];
			const normV = cleanText(v).toLowerCase(); if (!this.columnOptions.has(normV)) this.columnOptions.set(normV, v);
			this.write();
			this.input.value = '';
			this.renderPills();
			this.renderOptions();
			this.input.focus();
		} else {
			this.selected = [v];
			this.write();
			this.close();
		}
	}

	private renderOptions(): void {
		this.closeColorMenu();
		this.optionsEl.empty();
		const q = this.input.value.trim();
		const ql = q.toLowerCase();

		// 1. Column items first (already used in this property column)
		const colVisible = [...this.columnOptions.values()]
			.filter((o) => !ql || o.toLowerCase().includes(ql) || cleanText(o).toLowerCase().includes(ql))
			.sort((a, b) => cleanText(a).localeCompare(cleanText(b), undefined, { sensitivity: 'base' }));

		// 2. Entire vault recommendations below
		const vaultVisible = [...this.vaultOptions.values()]
			.filter((o) => !ql || o.toLowerCase().includes(ql) || cleanText(o).toLowerCase().includes(ql))
			.sort((a, b) => cleanText(a).localeCompare(cleanText(b), undefined, { sensitivity: 'base' }));

		const visible = [...colVisible, ...vaultVisible];

		for (const o of visible) {
			const row = this.optionsEl.createDiv({ cls: 'ntn-select-option' });
			const colorBtn = row.createSpan({
				cls: 'ntn-select-color-btn',
				attr: { 'aria-label': 'Change color' },
			});
			const cleanName = cleanText(o);
			this.deps.applyColor(colorBtn, cleanName);
			colorBtn.addEventListener('click', (evt) => {
				evt.stopPropagation();
				this.openColorMenu(colorBtn, cleanName);
			});

			const pill = row.createSpan({ cls: 'ntn-pill' });
			this.deps.applyColor(pill, cleanName);
			pill.setText(cleanName);

			// Checkmark placed RIGHT NEXT to option pill!
			const isSel = this.selected.some((s) => s.toLowerCase() === o.toLowerCase() || cleanText(s).toLowerCase() === cleanName.toLowerCase());
			if (isSel) {
				row.createSpan({ cls: 'ntn-select-check', text: '✓' });
			}

			// Display folder location sub-label
			if (o.includes('[[')) {
				const match = o.match(/\[\[([^\]|]+)/);
				if (match && match[1]) {
					const fullPath = match[1].trim() + (match[1].toLowerCase().endsWith('.md') ? '' : '.md');
					row.setAttribute('title', fullPath);
					pill.setAttribute('title', fullPath);
					if (match[1].includes('/')) {
						const folder = match[1].substring(0, match[1].lastIndexOf('/')).trim();
						const hint = row.createSpan({ cls: 'ntn-select-path-hint', text: `in ${folder}` });
						hint.setAttribute('title', fullPath);
					}
				}
			}

			// 3-Dot Menu Icon (•••) placed at the FAR RIGHT SIDE!
			const dotsBtn = row.createSpan({
				cls: 'ntn-select-dots',
				text: '•••',
				attr: { title: 'Change color' },
			});
			dotsBtn.addEventListener('click', (evt) => {
				evt.stopPropagation();
				this.openColorMenu(dotsBtn, cleanName);
			});

			row.addEventListener('click', (evt) => {
				const target = evt.target as HTMLElement;
				if (target.hasClass('ntn-select-color-btn') || target.hasClass('ntn-select-dots')) return;
				this.pick(o);
			});
		}

		if (q && !this.columnOptions.has(ql) && !this.vaultOptions.has(ql)) {
			const row = this.optionsEl.createDiv({ cls: 'ntn-select-option' });
			row.createSpan({ cls: 'ntn-select-create', text: 'Create' });
			const pill = row.createSpan({ cls: 'ntn-pill' });
			this.deps.applyColor(pill, q);
			pill.setText(q);
			row.addEventListener('click', () => this.pick(q));
		}
		if (!visible.length && !q) {
			this.optionsEl.createDiv({
				cls: 'ntn-select-empty',
				text: 'No options yet — type to create one',
			});
		}
	}

	private onKeydown(evt: KeyboardEvent): void {
		if (evt.key === 'Escape') {
			// Consume the key: inside the page panel, a bubbling Esc would
			// close the whole modal along with the menu.
			evt.preventDefault();
			evt.stopPropagation();
			this.close();
		} else if (evt.key === 'Enter') {
			const q = this.input.value.trim();
			if (q) {
				const match = this.columnOptions.get(q.toLowerCase()) ?? this.vaultOptions.get(q.toLowerCase()) ?? q;
				this.pick(match);
			} else {
				this.close();
			}
		} else if (
			evt.key === 'Backspace' &&
			this.input.value === '' &&
			this.deps.isList &&
			this.selected.length
		) {
			this.selected = this.selected.slice(0, -1);
			this.write();
			this.renderPills();
			this.renderOptions();
		}
	}

	/** Open the color picker for a value, anchored to its row button. */
	private openColorMenu(anchorEl: HTMLElement, value: string): void {
		if (this.colorMenu && this.colorMenuAnchor === anchorEl) {
			this.closeColorMenu();
			return;
		}

		this.closeColorMenu();
		const doc = this.deps.doc;
		const menu = doc.body.createDiv({ cls: 'ntn-root ntn-color-menu' });
		this.colorMenu = menu;
		this.colorMenuAnchor = anchorEl;

		// Section 1: Custom Color Wheel Picker
		const wheelSec = menu.createDiv({ cls: 'ntn-custom-color-sec' });
		wheelSec.createDiv({ cls: 'ntn-color-title', text: 'Custom Color Wheel' });
		
		const previewWrap = wheelSec.createDiv({ cls: 'ntn-color-preview-wrap' });
		const previewPill = previewWrap.createSpan({ cls: 'ntn-pill', text: value });
		previewPill.setCssStyles({
			backgroundColor: '#2563eb',
			color: '#ffffff',
		});

		// Place colorInput directly inside previewWrap for perfect center alignment
		const colorInput = previewWrap.createEl('input', {
			type: 'color',
			cls: 'ntn-color-wheel-input',
			value: '#2563eb'
		});

		const controlsRow = wheelSec.createDiv({ cls: 'ntn-color-controls' });

		let selectedFg = '#ffffff';
		const fgWrap = controlsRow.createDiv({ cls: 'ntn-fg-toggle-wrap' });
		const btnWhite = fgWrap.createEl('button', { cls: 'ntn-fg-btn active', text: 'White Text' });
		const btnBlack = fgWrap.createEl('button', { cls: 'ntn-fg-btn', text: 'Black Text' });

		const updatePreview = () => {
			previewPill.style.setProperty('background-color', colorInput.value, 'important');
			previewPill.style.setProperty('color', selectedFg, 'important');
		};

		colorInput.addEventListener('input', updatePreview);

		btnWhite.addEventListener('click', (e) => {
			e.stopPropagation();
			selectedFg = '#ffffff';
			btnWhite.addClass('active');
			btnBlack.removeClass('active');
			updatePreview();
		});

		btnBlack.addEventListener('click', (e) => {
			e.stopPropagation();
			selectedFg = '#000000';
			btnBlack.addClass('active');
			btnWhite.removeClass('active');
			updatePreview();
		});

		const applyBtn = wheelSec.createEl('button', { cls: 'ntn-apply-color-btn', text: 'Apply Custom Color' });
		applyBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			const spec = `${colorInput.value}|${selectedFg}`;
			this.deps.setColor(value, spec);
			this.closeColorMenu();
			this.renderPills();
			this.renderOptions();
		});

		// Section 2: Preset Badges (Pure Black Font on Soft Colors)
		menu.createDiv({ cls: 'ntn-color-title', text: 'Presets' });
		const presets = [
			// High-Vibrancy Solids (White Text)
			{ name: 'electric-blue', bg: '#0066FF', fg: '#ffffff', label: 'Electric Blue' },
			{ name: 'neon-emerald', bg: '#00B060', fg: '#ffffff', label: 'Neon Emerald' },
			{ name: 'vibrant-orange', bg: '#FF5500', fg: '#ffffff', label: 'Blaze Orange' },
			{ name: 'deep-violet', bg: '#8000FF', fg: '#ffffff', label: 'Deep Violet' },
			{ name: 'hot-magenta', bg: '#E6007A', fg: '#ffffff', label: 'Hot Magenta' },
			{ name: 'crimson-red', bg: '#E51A1A', fg: '#ffffff', label: 'Crimson Red' },
			{ name: 'bright-amber', bg: '#D97700', fg: '#ffffff', label: 'Bright Amber' },
			{ name: 'cyan-aqua', bg: '#00A8B5', fg: '#ffffff', label: 'Cyan Aqua' },
			{ name: 'royal-indigo', bg: '#4338CA', fg: '#ffffff', label: 'Royal Indigo' },
			{ name: 'charcoal', bg: '#262626', fg: '#ffffff', label: 'Sleek Dark' },

			// High-Vibrancy Soft Pastels (Pure Black Text)
			{ name: 'sky-pastel', bg: '#BAE6FD', fg: '#000000', label: 'Sky Blue' },
			{ name: 'mint-pastel', bg: '#A7F3D0', fg: '#000000', label: 'Fresh Mint' },
			{ name: 'peach-pastel', bg: '#FFEDD5', fg: '#000000', label: 'Warm Peach' },
			{ name: 'lavender-pastel', bg: '#DDD6FE', fg: '#000000', label: 'Soft Lavender' },
			{ name: 'pink-pastel', bg: '#FBCFE8', fg: '#000000', label: 'Candy Pink' },
			{ name: 'sun-yellow', bg: '#FEF08A', fg: '#000000', label: 'Sun Yellow' },
			{ name: 'teal-pastel', bg: '#99F6E4', fg: '#000000', label: 'Turquoise' },
			{ name: 'rose-pastel', bg: '#FECDD3', fg: '#000000', label: 'Soft Rose' },
			{ name: 'lime-pastel', bg: '#D9F99D', fg: '#000000', label: 'Vivid Lime' },
			{ name: 'caramel-cream', bg: '#FEF3C7', fg: '#000000', label: 'Caramel Cream' },
		];

		const grid = menu.createDiv({ cls: 'ntn-preset-grid' });

		for (const p of presets) {
			const badge = grid.createSpan({ cls: 'ntn-pill ntn-preset-pill' });
			badge.style.setProperty('background-color', p.bg, 'important');
			badge.style.setProperty('color', p.fg, 'important');
			badge.setText(p.label);

			badge.addEventListener('click', (evt) => {
				evt.stopPropagation();
				this.deps.setColor(value, `${p.bg}|${p.fg}`);
				this.closeColorMenu();
				this.renderPills();
				this.renderOptions();
			});
		}

		this.clampToWindow(menu, anchorEl.getBoundingClientRect());
	}

	private position(): void {
		const rect = this.deps.anchor.getBoundingClientRect();
		this.menu.setCssStyles({ minWidth: `${Math.max(rect.width, 220)}px` });
		this.clampToWindow(this.menu, rect);
	}

	/** Place a popover just below `anchorRect`, nudged to stay on screen. */
	private clampToWindow(el: HTMLElement, anchorRect: DOMRect): void {
		const { win } = this.deps;
		el.setCssStyles({
			left: `${anchorRect.left}px`,
			top: `${anchorRect.bottom + 4}px`,
		});

		const rect = el.getBoundingClientRect();
		if (rect.bottom > win.innerHeight - 8) {
			el.setCssStyles({ top: `${Math.max(8, anchorRect.top - rect.height - 4)}px` });
		}
		if (rect.right > win.innerWidth - 8) {
			el.setCssStyles({ left: `${Math.max(8, win.innerWidth - rect.width - 8)}px` });
		}
	}
}
