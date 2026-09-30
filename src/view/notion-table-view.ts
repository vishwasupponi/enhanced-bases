
function formatDateObject(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	let h = d.getHours();
	const min = String(d.getMinutes()).padStart(2, '0');
	const period = h >= 12 ? 'PM' : 'AM';
	h = h % 12;
	if (h === 0) h = 12;
	const padH = String(h).padStart(2, '0');
	return `${day}-${m}-${y} ${padH}:${min} ${period}`;
}

function extractRawDateString(value: unknown): string {
	if (!value) return '';
	let res = '';
	if (typeof value === 'string') res = value.trim();
	else if (value instanceof Date) {
		res = formatDateObject(value);
	} else {
		const obj = value as any;
		if (obj.value) {
			if (typeof obj.value === 'string') res = obj.value.trim();
			else if (obj.value instanceof Date) {
				res = formatDateObject(obj.value);
			}
		} else if (obj.date) {
			if (typeof obj.date === 'string') res = obj.date.trim();
			else if (obj.date instanceof Date) {
				res = formatDateObject(obj.date);
			}
		} else if (typeof obj.toString === 'function') {
			const s = obj.toString().trim();
			if (s && s !== '[object Object]') res = s;
		} else {
			res = String(value).trim();
		}
	}
	return (res === 'null' || res === 'undefined') ? '' : res;
}


function cleanWikilinkTitle(val: any): string {
	if (!val) return '';
	const str = typeof val === 'string' ? val : (val.toString ? val.toString() : String(val));
	if (!str) return '';
	return str.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, alias) => {
		if (alias && alias.trim()) return alias.trim();
		const t = target.trim();
		const lastSlash = t.lastIndexOf('/');
		let name = lastSlash !== -1 ? t.substring(lastSlash + 1) : t;
		if (name.toLowerCase().endsWith('.md')) name = name.slice(0, -3);
		return name;
	});
}

/**
 * The `notion-table` Bases view: renders query results as a Notion-style table
 * with hover OPEN buttons, colored pills, inline editing, and a select editor
 * for pill cells. Re-renders from scratch on every `onDataUpdated`.
 */
import {
	BasesEntry,
	BasesPropertyId,
	BasesView,
	BooleanValue,
	Notice,
	Menu,
	NumberValue,
	Platform,
	QueryController,
	TFile,
} from 'obsidian';
import { LOG_PREFIX, NOTION_TABLE_VIEW } from '../constants';
import { PinnedColors, applyPillColor, colorByName } from '../lib/colors';
import { PillDetection, computePillProps, parsePinnedColors } from '../lib/pills';
import { valueToStrings } from '../lib/values';
import { NotePageModal, OpenSelectOpts } from './note-modal';
import { SelectEditor } from './select-editor';

/**
 * Internal shape of the core toolbar's new-item menu (`QueryController.
 * newItemMenu` — not in the public API). Guarded at runtime before use.
 */
interface CoreNewItemMenu {
	open(name?: string, frontmatterProcessor?: (fm: Record<string, unknown>) => void): Promise<void>;
	close(): void;
}


interface EntryHierarchyNode {
	entry: BasesEntry;
	children: EntryHierarchyNode[];
	level: number;
	hasChildren: boolean;
}


class ObsidianNativeDatePicker {
	private year: number;
	private month: number;
	private selectedDay: number;
	private selectedHour: number;
	private selectedMinute: number;
	private selectedPeriod: 'AM' | 'PM';
	private popover: HTMLElement | null = null;
	private showMonthYearSelector: boolean = false;

	private anchorRect: DOMRect;

	constructor(
		private anchor: HTMLElement,
		private initialVal: string,
		private onCommit: (formattedStr: string | null) => void,
		private doc: Document,
	) {
		this.anchorRect = anchor.getBoundingClientRect();
		const parsed = this.parseInput(initialVal);
		const now = new Date();
		this.year = parsed.year ?? now.getFullYear();
		this.month = parsed.month ?? now.getMonth();
		this.selectedDay = parsed.day ?? now.getDate();
		this.selectedHour = parsed.hour ?? 12;
		this.selectedMinute = parsed.minute ?? 0;
		this.selectedPeriod = parsed.period ?? 'AM';
		this.render();
	}

	private parseInput(val: string) {
		if (!val || val === 'null' || val === 'undefined') return {};
		const str = val.trim();

		let year: number | undefined;
		let month: number | undefined;
		let day: number | undefined;
		let hour: number | undefined;
		let minute: number | undefined;
		let period: 'AM' | 'PM' | undefined;

		// 1. Time parsing (e.g. "10:26 PM" or "01:26 AM" or "17:04")
		const timeMatch = str.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
		if (timeMatch) {
			let h = parseInt(timeMatch[1], 10);
			minute = parseInt(timeMatch[2], 10);
			if (timeMatch[4]) {
				period = timeMatch[4].toUpperCase() as 'AM' | 'PM';
				hour = h;
			} else if (h >= 12) {
				hour = h === 12 ? 12 : h - 12;
				period = 'PM';
			} else {
				hour = h === 0 ? 12 : h;
				period = 'AM';
			}
		}

		// 2. Date parsing (YYYY-MM-DD or DD-MM-YYYY)
		const isoMatch = str.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
		if (isoMatch) {
			year = parseInt(isoMatch[1], 10);
			month = parseInt(isoMatch[2], 10) - 1;
			day = parseInt(isoMatch[3], 10);
		} else {
			const dmyMatch = str.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
			if (dmyMatch) {
				day = parseInt(dmyMatch[1], 10);
				month = parseInt(dmyMatch[2], 10) - 1;
				year = parseInt(dmyMatch[3], 10);
			}
		}

		// Fallback to JS Date if regex missed
		if (!year || isNaN(year)) {
			const d = new Date(str);
			if (!isNaN(d.getTime())) {
				year = d.getFullYear();
				month = d.getMonth();
				day = d.getDate();
				if (hour === undefined) {
					let h = d.getHours();
					minute = d.getMinutes();
					if (h >= 12) {
						hour = h === 12 ? 12 : h - 12;
						period = 'PM';
					} else {
						hour = h === 0 ? 12 : h;
						period = 'AM';
					}
				}
			}
		}

		return { year, month, day, hour, minute, period };
	}

	private formatOutput(): string {
		const pad = (n: number) => String(n).padStart(2, '0');
		const y = this.year;
		const m = pad(this.month + 1);
		const d = pad(this.selectedDay);
		const h = pad(this.selectedHour);
		const min = pad(this.selectedMinute);
		return `${d}-${m}-${y} ${h}:${min} ${this.selectedPeriod}`;
	}

	private render() {
		this.close();
		const pop = this.doc.body.createDiv({ cls: 'ntn-native-picker-popover' });
		this.popover = pop;

		let rect = this.anchor.getBoundingClientRect();
		if (rect.width === 0 || rect.height === 0 || (rect.left === 0 && rect.top === 0)) {
			rect = this.anchorRect;
		} else {
			this.anchorRect = rect;
		}

		const winW = this.doc.defaultView?.innerWidth || 1200;
		const winH = this.doc.defaultView?.innerHeight || 800;
		const popLeft = Math.min(Math.max(10, rect.left), winW - 340);
		const popTop = Math.min(Math.max(10, rect.bottom + 4), winH - 280);

		pop.setCssStyles({
			left: `${popLeft}px`,
			top: `${popTop}px`,
		});

		// Left Calendar Section
		const left = pop.createDiv({ cls: 'ntn-picker-left' });
		const head = left.createDiv({ cls: 'ntn-picker-header' });

		const monthNames = [
			'January', 'February', 'March', 'April', 'May', 'June',
			'July', 'August', 'September', 'October', 'November', 'December'
		];

		const monthYear = head.createDiv({
			cls: 'ntn-picker-month-year',
			text: `${monthNames[this.month]}, ${this.year} ▾`
		});

		monthYear.addEventListener('click', (e) => {
			e.stopPropagation();
			this.showMonthYearSelector = !this.showMonthYearSelector;
			this.render();
		});

		const arrows = head.createDiv({ cls: 'ntn-picker-nav-arrows' });
		const upArrow = arrows.createSpan({ cls: 'ntn-picker-arrow', text: '↑' });
		const downArrow = arrows.createSpan({ cls: 'ntn-picker-arrow', text: '↓' });

		upArrow.addEventListener('click', (e) => {
			e.stopPropagation();
			this.month--;
			if (this.month < 0) {
				this.month = 11;
				this.year--;
			}
			this.render();
		});

		downArrow.addEventListener('click', (e) => {
			e.stopPropagation();
			this.month++;
			if (this.month > 11) {
				this.month = 0;
				this.year++;
			}
			this.render();
		});

		if (this.showMonthYearSelector) {
			// Fast Scrollable Month & Year Selector View
			const myContainer = left.createDiv({ cls: 'ntn-picker-my-selector' });
			
			// Month Selector Grid
			const mSec = myContainer.createDiv({ cls: 'ntn-my-section' });
			mSec.createDiv({ cls: 'ntn-my-title', text: 'Select Month' });
			const mGrid = mSec.createDiv({ cls: 'ntn-my-grid' });
			monthNames.forEach((name, idx) => {
				const isSel = idx === this.month;
				const btn = mGrid.createEl('button', {
					cls: `ntn-my-btn ${isSel ? 'selected' : ''}`,
					text: name.slice(0, 3)
				});
				btn.addEventListener('click', (e) => {
					e.stopPropagation();
					this.month = idx;
					this.showMonthYearSelector = false;
					this.render();
				});
			});

			// Scrollable Year List (Years 1970 to 2050)
			const ySec = myContainer.createDiv({ cls: 'ntn-my-section' });
			ySec.createDiv({ cls: 'ntn-my-title', text: 'Select Year' });
			const yGrid = ySec.createDiv({ cls: 'ntn-my-year-scroll' });
			let selectedYearEl: HTMLElement | null = null;
			for (let y = 1970; y <= 2050; y++) {
				const isSel = y === this.year;
				const btn = yGrid.createEl('button', {
					cls: `ntn-my-year-btn ${isSel ? 'selected' : ''}`,
					text: String(y)
				});
				if (isSel) selectedYearEl = btn;
				btn.addEventListener('click', (e) => {
					e.stopPropagation();
					this.year = y;
					this.showMonthYearSelector = false;
					this.render();
				});
			}
			if (selectedYearEl) {
				setTimeout(() => selectedYearEl?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 30);
			}
		} else {
			// Standard 7-Days Header & 7x6 Grid
			const daysHead = left.createDiv({ cls: 'ntn-picker-days-header' });
			['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].forEach(d => daysHead.createSpan({ text: d }));

			const grid = left.createDiv({ cls: 'ntn-picker-grid' });
			const firstDayIndex = new Date(this.year, this.month, 1).getDay();
			const totalDaysInMonth = new Date(this.year, this.month + 1, 0).getDate();
			const prevMonthDays = new Date(this.year, this.month, 0).getDate();

			for (let i = firstDayIndex - 1; i >= 0; i--) {
				grid.createSpan({ cls: 'ntn-picker-day other-month', text: String(prevMonthDays - i) });
			}

			for (let d = 1; d <= totalDaysInMonth; d++) {
				const isSel = d === this.selectedDay;
				const cell = grid.createSpan({
					cls: `ntn-picker-day ${isSel ? 'selected' : ''}`,
					text: String(d)
				});
				cell.addEventListener('click', (e) => {
					e.stopPropagation();
					this.selectedDay = d;
					this.render();
				});
			}

			// Footer Buttons
			const footer = left.createDiv({ cls: 'ntn-picker-footer' });
			const clearBtn = footer.createSpan({ cls: 'ntn-picker-clear-btn', text: 'Clear' });
			const rightFooter = footer.createDiv({ cls: 'ntn-picker-right-footer' });
			const todayBtn = rightFooter.createSpan({ cls: 'ntn-picker-today-btn', text: 'Today' });
			const okBtn = rightFooter.createEl('button', { cls: 'ntn-picker-ok-btn', text: 'OK' });

			clearBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.onCommit(null);
				this.close();
			});

			todayBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				const now = new Date();
				this.year = now.getFullYear();
				this.month = now.getMonth();
				this.selectedDay = now.getDate();
				this.render();
			});

			okBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.onCommit(this.formatOutput());
				this.close();
			});
		}

		// Divider Line
		pop.createDiv({ cls: 'ntn-picker-divider' });

		// Right Time Section
		const right = pop.createDiv({ cls: 'ntn-picker-right' });

		// Hours Column (01 - 12)
		const colHours = right.createDiv({ cls: 'ntn-time-col' });
		for (let h = 1; h <= 12; h++) {
			const isSel = h === this.selectedHour;
			const cell = colHours.createDiv({
				cls: `ntn-time-cell ${isSel ? 'selected' : ''}`,
				text: String(h).padStart(2, '0')
			});
			cell.addEventListener('click', (e) => {
				e.stopPropagation();
				this.selectedHour = h;
				this.render();
			});
		}

		// Minutes Column (00 - 59)
		const colMins = right.createDiv({ cls: 'ntn-time-col' });
		for (let m = 0; m < 60; m++) {
			const isSel = m === this.selectedMinute;
			const cell = colMins.createDiv({
				cls: `ntn-time-cell ${isSel ? 'selected' : ''}`,
				text: String(m).padStart(2, '0')
			});
			cell.addEventListener('click', (e) => {
				e.stopPropagation();
				this.selectedMinute = m;
				this.render();
			});
		}

		// AM / PM Column
		const colPeriod = right.createDiv({ cls: 'ntn-time-col' });
		['PM', 'AM'].forEach(p => {
			const isSel = p === this.selectedPeriod;
			const cell = colPeriod.createDiv({
				cls: `ntn-time-cell ${isSel ? 'selected' : ''}`,
				text: p
			});
			cell.addEventListener('click', (e) => {
				e.stopPropagation();
				this.selectedPeriod = p as 'AM' | 'PM';
				this.render();
			});
		});

		// Outside click & Escape key to close popover without altering date
		const onOutside = (e: MouseEvent) => {
			if (this.popover && !this.popover.contains(e.target as Node) && !this.anchor.contains(e.target as Node)) {
				this.close();
			}
		};
		const onKeydown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				e.stopPropagation();
				this.close();
			}
		};

		setTimeout(() => {
			this.doc.addEventListener('mousedown', onOutside);
			this.doc.addEventListener('keydown', onKeydown);
		}, 50);

		// Store listeners for teardown
		(this as any)._onOutside = onOutside;
		(this as any)._onKeydown = onKeydown;
	}

	public close() {
		if (this.popover) {
			if ((this as any)._onOutside) this.doc.removeEventListener('mousedown', (this as any)._onOutside);
			if ((this as any)._onKeydown) this.doc.removeEventListener('keydown', (this as any)._onKeydown);
			this.popover.remove();
		}
	}
}

/**
 * The `notion-table` Bases view: renders query results as a Notion-style table
 * with hover OPEN buttons, colored pills, inline editing, and a select editor
 * for pill cells. Re-renders from scratch on every `onDataUpdated`.
 */
import {
	BasesEntry,
	BasesPropertyId,
	BasesView,
	BooleanValue,
	Notice,
	NumberValue,
	Platform,
	QueryController,
	TFile,
} from 'obsidian';
import { LOG_PREFIX, NOTION_TABLE_VIEW } from '../constants';
import { PinnedColors, applyPillColor, colorByName } from '../lib/colors';
import { PillDetection, computePillProps, parsePinnedColors } from '../lib/pills';
import { valueToStrings } from '../lib/values';
import { NotePageModal, OpenSelectOpts } from './note-modal';
import { SelectEditor } from './select-editor';

/**
 * Internal shape of the core toolbar's new-item menu (`QueryController.
 * newItemMenu` — not in the public API). Guarded at runtime before use.
 */
interface CoreNewItemMenu {
	open(name?: string, frontmatterProcessor?: (fm: Record<string, unknown>) => void): Promise<void>;
	close(): void;
}


interface EntryHierarchyNode {
	entry: BasesEntry;
	children: EntryHierarchyNode[];
	level: number;
	hasChildren: boolean;
}


export class NotionTableView extends BasesView {
	private columnWidths: Map<string, number> = new Map();
	private collapsedGroups: Set<string> = new Set();
	private expandedPaths: Set<string> = new Set();
	readonly type = NOTION_TABLE_VIEW;
	private rootEl: HTMLElement;
	/** The controller this view was created for (holds the core toolbar). */
	private readonly queryCtrl: QueryController;
	/** True while the toolbar's New button is rerouted to the page panel. */
	private newButtonPatched = false;


	constructor(controller: QueryController, parentEl: HTMLElement) {
		super(controller);
		this.queryCtrl = controller;
		this.rootEl = parentEl.createDiv({ cls: 'ntn-root' });
		this.register(() => this.closeSelectMenu());
		// when the view lives in a popout window (plain `document` would not).
		// One persistent capture-phase listener that no-ops unless a menu is open
		// — do not revert to a per-menu `document.addEventListener`.
		this.registerDomEvent(this.rootEl.doc, 'mousedown', (evt) => {
			if (!this.selectEditor) return;
			const target = evt.target as Node;
			if (this.selectEditor.contains(target)) return;
			// A click on the anchoring cell is left to that cell's own click
			// handler, which toggles the menu shut (see openSelectEditor).
			// Closing here too would let the click re-open it instead.
			if (this.selectEditor.anchorEl.contains(target)) return;
			this.closeSelectMenu();
		}, { capture: true });
		this.patchToolbarNew();
	}

	
	private buildGroupTree(entries: BasesEntry[]): EntryHierarchyNode[] {
		const nodeMap = new Map<string, EntryHierarchyNode>();
		const titleToNode = new Map<string, EntryHierarchyNode>();

		for (const entry of entries) {
			const node: EntryHierarchyNode = {
				entry,
				children: [],
				level: 0,
				hasChildren: false,
			};
			nodeMap.set(entry.file.path, node);
			titleToNode.set(entry.file.basename.toLowerCase(), node);
		}

		const roots: EntryHierarchyNode[] = [];

		for (const node of nodeMap.values()) {
			const fm = (this.app.metadataCache.getFileCache(node.entry.file)?.frontmatter || {}) as Record<string, unknown>;
			const rawParent = fm.parent || fm.Parent || fm.parent_item || fm.subtask_of;
			let parentStr: string | null = null;
			if (rawParent) {
				const str = String(rawParent).trim();
				const match = str.match(/^\[\[([^\]|]+)(?:\|[^\]]+)?\]\]$/);
				parentStr = match ? match[1].trim() : str.replace(/\.md$/i, '').trim();
			}

			if (parentStr) {
				const parentNode = titleToNode.get(parentStr.toLowerCase());
				if (parentNode && parentNode.entry.file.path !== node.entry.file.path) {
					parentNode.children.push(node);
					parentNode.hasChildren = true;
				} else {
					roots.push(node);
				}
			} else {
				roots.push(node);
			}
		}

		function setLevels(nodes: EntryHierarchyNode[], lvl: number) {
			for (const n of nodes) {
				n.level = lvl;
				if (n.children.length > 0) {
					setLevels(n.children, lvl + 1);
				}
			}
		}
		setLevels(roots, 0);

		return roots;
	}

	
	private openGroupColorPicker(anchorEl: HTMLElement, groupKey: string): void {
		const doc = this.rootEl.doc;
		const existing = doc.querySelector('.ntn-group-color-flyout');
		if (existing) existing.remove();

		const flyout = doc.body.createDiv({ cls: 'ntn-select-menu ntn-group-color-flyout' });
		flyout.createDiv({ cls: 'ntn-color-title', text: 'Group Color' });

		const rect = anchorEl.getBoundingClientRect();
		flyout.setCssStyles({
			position: 'fixed',
			top: `${rect.bottom + 4}px`,
			left: `${rect.left}px`,
			zIndex: '1000'
		});

		const colors = [
			{ name: 'default', label: 'Default' },
			{ name: 'gray', label: 'Gray' },
			{ name: 'brown', label: 'Brown' },
			{ name: 'orange', label: 'Orange' },
			{ name: 'yellow', label: 'Yellow' },
			{ name: 'green', label: 'Green' },
			{ name: 'blue', label: 'Blue' },
			{ name: 'purple', label: 'Purple' },
			{ name: 'pink', label: 'Pink' },
			{ name: 'red', label: 'Red' },
		];

		const grid = flyout.createDiv({ cls: 'ntn-color-grid' });
		for (const c of colors) {
			const btn = grid.createEl('button', { cls: 'ntn-color-option' });
			const sq = btn.createSpan({ cls: 'ntn-color-sq' });
			applyPillColor(sq, c.name, new Map([[c.name.toLowerCase(), c.name]]));
			btn.createSpan({ text: c.label });
			btn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.setPinnedColor(groupKey, c.name);
				flyout.remove();
				this.onDataUpdated();
			});
		}

		const closeHandler = (e: MouseEvent) => {
			if (!flyout.contains(e.target as Node)) {
				flyout.remove();
				doc.removeEventListener('mousedown', closeHandler);
			}
		};
		setTimeout(() => doc.addEventListener('mousedown', closeHandler), 50);
	}

	
	
	private attachColumnDragDrop(th: HTMLElement, propKey: BasesPropertyId): void {
		th.addEventListener('dragstart', (evt: DragEvent) => {
			evt.dataTransfer?.setData('text/plain', propKey);
		});
		th.addEventListener('dragover', (evt: DragEvent) => {
			evt.preventDefault();
			th.addClass('ntn-th-drag-over');
		});
		th.addEventListener('dragleave', () => {
			th.removeClass('ntn-th-drag-over');
		});
		th.addEventListener('drop', (evt: DragEvent) => {
			evt.preventDefault();
			th.removeClass('ntn-th-drag-over');
			const draggedProp = evt.dataTransfer?.getData('text/plain') as BasesPropertyId;
			if (draggedProp && draggedProp !== propKey) {
				const currentOrder = [...this.config.getOrder()];
				const fromIdx = currentOrder.indexOf(draggedProp);
				const toIdx = currentOrder.indexOf(propKey);
				if (fromIdx !== -1 && toIdx !== -1) {
					currentOrder.splice(fromIdx, 1);
					currentOrder.splice(toIdx, 0, draggedProp);
					if (typeof (this.config as any).setOrder === 'function') {
						(this.config as any).setOrder(currentOrder);
					}
					this.onDataUpdated();
				}
			}
		});
	}

	private attachResizeHandle(th: HTMLElement, propKey: string): void {
		const handle = th.createDiv({ cls: 'ntn-col-resize-handle' });
		handle.addEventListener('mousedown', (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			this.wasResizingJustNow = true;
			const startX = e.clientX;
			const startW = th.offsetWidth;
			handle.addClass('resizing');

			const doc = this.rootEl.doc;
			const onMouseMove = (moveEvt: MouseEvent) => {
				const delta = moveEvt.clientX - startX;
				const newW = Math.max(60, startW + delta);
				th.setCssStyles({ width: `${newW}px` });
				this.columnWidths.set(propKey, newW);
			};

			const onMouseUp = () => {
				handle.removeClass('resizing');
				doc.removeEventListener('mousemove', onMouseMove);
				doc.removeEventListener('mouseup', onMouseUp);
				setTimeout(() => {
					this.wasResizingJustNow = false;
				}, 200);
			};

			doc.addEventListener('mousemove', onMouseMove);
			doc.addEventListener('mouseup', onMouseUp);
		});
	}

	
	private buildUnifiedHierarchyTree(entries: BasesEntry[]): EntryHierarchyNode[] {
		const entryIndexMap = new Map<string, number>();
		entries.forEach((e, idx) => entryIndexMap.set(e.file.path.toLowerCase(), idx));

		const nodeMap = new Map<string, EntryHierarchyNode>();
		const titleToNode = new Map<string, EntryHierarchyNode>();

		for (const entry of entries) {
			const node: EntryHierarchyNode = {
				entry,
				children: [],
				level: 0,
				hasChildren: false,
			};
			nodeMap.set(entry.file.path.toLowerCase(), node);
			titleToNode.set(entry.file.basename.toLowerCase(), node);
		}

		const roots: EntryHierarchyNode[] = [];

		const userParentProp = String(this.config.get('parentProperty') || '').toLowerCase().trim();
		const normUserParent = userParentProp.replace(/[_\\-\\s]+/g, '');

		for (const node of nodeMap.values()) {
			const fm = (this.app.metadataCache.getFileCache(node.entry.file)?.frontmatter || {}) as Record<string, unknown>;
			let rawParent: any = null;

			if (userParentProp) {
				for (const k of Object.keys(fm)) {
					const normK = k.toLowerCase().replace(/[_\\-\\s]+/g, '');
					if (k.toLowerCase().trim() === userParentProp || normK === normUserParent) {
						rawParent = fm[k];
						break;
					}
				}
			}

			if (!rawParent) {
				rawParent = fm['parent item'] || fm['Parent Item'] || fm['parent_item'] || fm['Parent_Item'] || fm.parent || fm.Parent || fm['parent-item'] || fm.subtask_of || fm['subtask of'];
				if (!rawParent) {
					for (const k of Object.keys(fm)) {
						const normK = k.toLowerCase().replace(/[_\\-\\s]+/g, '');
						if (normK === 'parentitem' || normK === 'parent' || normK === 'subtaskof' || normK === 'parenttask') {
							rawParent = fm[k];
							break;
						}
					}
				}
			}

			let parentStr: string | null = null;
			if (rawParent) {
				parentStr = cleanWikilinkTitle(rawParent);
			}

			if (parentStr) {
				const parentNode = titleToNode.get(parentStr.toLowerCase()) || nodeMap.get(parentStr.toLowerCase() + '.md');
				if (parentNode && parentNode.entry.file.path.toLowerCase() !== node.entry.file.path.toLowerCase()) {
					parentNode.children.push(node);
					parentNode.hasChildren = true;
				} else {
					roots.push(node);
				}
			} else {
				roots.push(node);
			}
		}

		const self = this;
		function sortNodes(nodes: EntryHierarchyNode[]) {
			nodes.sort((a, b) => {
				if (self.sortCol && self.sortDir) {
					let valA: any = null;
					let valB: any = null;
					if (self.sortCol === 'title') {
						valA = a.entry.file.basename;
						valB = b.entry.file.basename;
					} else {
						valA = a.entry.getValue(self.sortCol);
						valB = b.entry.getValue(self.sortCol);
					}
					const strA = valA !== null && valA !== undefined ? cleanWikilinkTitle(valA).toLowerCase() : '';
					const strB = valB !== null && valB !== undefined ? cleanWikilinkTitle(valB).toLowerCase() : '';
					const numA = Number(strA);
					const numB = Number(strB);
					let cmp = 0;
					if (!isNaN(numA) && !isNaN(numB) && strA !== '' && strB !== '') {
						cmp = numA - numB;
					} else {
						cmp = strA.localeCompare(strB, undefined, { numeric: true, sensitivity: 'base' });
					}
					if (cmp !== 0) return self.sortDir === 'desc' ? -cmp : cmp;
				}
				const idxA = entryIndexMap.get(a.entry.file.path.toLowerCase()) ?? 999999;
				const idxB = entryIndexMap.get(b.entry.file.path.toLowerCase()) ?? 999999;
				return idxA - idxB;
			});
			for (const n of nodes) {
				if (n.children.length > 0) {
					sortNodes(n.children);
				}
			}
		}

		sortNodes(roots);

		function assignDepth(nodes: EntryHierarchyNode[], lvl: number) {
			for (const n of nodes) {
				n.level = lvl;
				if (n.children.length > 0) {
					assignDepth(n.children, lvl + 1);
				}
			}
		}
		assignDepth(roots, 0);

		return roots;
	}

	
	private async openInSidePanel(file: TFile): Promise<void> {
		void this.app.workspace.openLinkText(file.path, '', 'split');
	}

	onDataUpdated(): void {
		// The toolbar may not have existed at construction time; retry until
		// the patch lands (no-op once it has).
		this.patchToolbarNew();

		const root = this.rootEl;
		root.empty();

		// Default-on: only an explicit `false` turns wrapping off (mirrors verticalLines).
		root.toggleClass('ntn-wrap', this.config.get('wrapCells') !== false);
		root.toggleClass('ntn-vlines', this.config.get('verticalLines') !== false);

		const rawProps = this.customColumnOrder || this.config.getOrder();
		// Filter out file.name / note.name property from extra columns to prevent duplicate 'Name' / 'Game' columns
		const displayProps = rawProps.filter((p) => {
			const bare = p.split('.').slice(1).join('.').toLowerCase();
			return p !== 'file.name' && p !== 'file.basename' && p !== 'note.name' && bare !== 'file.name';
		});

		this.pills = computePillProps(displayProps, this.data.data, this.config, this.app);
		this.pinnedColors = parsePinnedColors(this.config.get('pinnedColors'));

		const table = root.createEl('table', { cls: 'ntn-table' });

		const thead = table.createEl('thead');
		const headRow = thead.createEl('tr');
		const thTitle = headRow.createEl('th', { cls: 'ntn-th ntn-col-title' });
		const titleW = this.columnWidths.get('title') || 240;
		thTitle.setCssStyles({ width: `${titleW}px` });
		thTitle.createSpan({ cls: 'ntn-th-icon', text: 'Aa' });
		thTitle.createSpan({ text: 'Name' });
		if (this.sortCol === 'title') {
			thTitle.createSpan({ cls: 'ntn-th-sort-icon', text: this.sortDir === 'asc' ? ' ▲' : ' ▼' });
		}
		this.attachResizeHandle(thTitle, 'title');

		thTitle.addEventListener('click', (evt: MouseEvent) => {
			if (this.wasResizingJustNow) return;
			const target = evt.target as HTMLElement;
			if (target.hasClass('ntn-col-resize-handle')) return;
			if (this.sortCol === 'title') {
				if (this.sortDir === 'asc') {
					this.sortDir = 'desc';
				} else {
					this.sortCol = null;
					this.sortDir = null;
				}
			} else {
				this.sortCol = 'title';
				this.sortDir = 'asc';
			}
			this.onDataUpdated();
		});

		for (const prop of displayProps) {
			const th = headRow.createEl('th', { cls: 'ntn-th' });
			th.setAttribute('draggable', 'true');
			th.createSpan({ text: this.config.getDisplayName(prop) });
			if (this.sortCol === prop) {
				th.createSpan({ cls: 'ntn-th-sort-icon', text: this.sortDir === 'asc' ? ' ▲' : ' ▼' });
			}

			const savedW = this.columnWidths.get(prop) || 180;
			th.setCssStyles({ width: `${savedW}px` });

			this.attachResizeHandle(th, prop);

			th.addEventListener('click', (evt: MouseEvent) => {
				if (this.wasResizingJustNow) return;
				const target = evt.target as HTMLElement;
				if (target.hasClass('ntn-col-resize-handle')) return;
				if (this.sortCol === prop) {
					if (this.sortDir === 'asc') {
						this.sortDir = 'desc';
					} else {
						this.sortCol = null;
						this.sortDir = null;
					}
				} else {
					this.sortCol = prop;
					this.sortDir = 'asc';
				}
				this.onDataUpdated();
			});

			// Column Drag and Drop handlers for reordering
			th.addEventListener('dragstart', (evt: DragEvent) => {
				this.draggedProp = prop;
				th.addClass('ntn-dragging');
				if (evt.dataTransfer) {
					evt.dataTransfer.effectAllowed = 'move';
					evt.dataTransfer.setData('text/plain', prop);
				}
			});

			th.addEventListener('dragend', () => {
				this.draggedProp = null;
				th.removeClass('ntn-dragging');
				headRow.querySelectorAll('.ntn-th').forEach((el) => el.removeClass('ntn-drag-over'));
			});

			th.addEventListener('dragover', (evt: DragEvent) => {
				evt.preventDefault();
				if (evt.dataTransfer) {
					evt.dataTransfer.dropEffect = 'move';
				}
				if (this.draggedProp && this.draggedProp !== prop) {
					th.addClass('ntn-drag-over');
				}
			});

			th.addEventListener('dragleave', () => {
				th.removeClass('ntn-drag-over');
			});

			th.addEventListener('drop', (evt: DragEvent) => {
				evt.preventDefault();
				th.removeClass('ntn-drag-over');
				const fromProp = this.draggedProp || evt.dataTransfer?.getData('text/plain');
				const toProp = prop;
				if (fromProp && toProp && fromProp !== toProp) {
					const fromIdx = displayProps.indexOf(fromProp as BasesPropertyId);
					const toIdx = displayProps.indexOf(toProp);
					if (fromIdx !== -1 && toIdx !== -1) {
						const updated = [...displayProps];
						const [removed] = updated.splice(fromIdx, 1);
						updated.splice(toIdx, 0, removed);

						this.customColumnOrder = updated;

						try {
							if (typeof (this.config as any).setOrder === 'function') {
								(this.config as any).setOrder(updated);
							} else if (typeof (this.config as any).set === 'function') {
								(this.config as any).set('order', updated);
							}
						} catch (e) {
							console.debug('Bases config setOrder non-fatal fallback', e);
						}

						this.onDataUpdated();
					}
				}
			});
		}

				// ---- Body: Single Unified True Notion Sub-item Hierarchy Tree ----
		const allEntries = this.data.data;
		let finalEntries: EntryHierarchyNode[];
		if (this.sortCol && this.sortDir) {
			// When sorted, flatten all nodes so everything sorts purely by column value
			const allNodes: EntryHierarchyNode[] = [];
			const traverse = (nodes: EntryHierarchyNode[]) => {
				for (const n of nodes) {
					allNodes.push(n);
					if (n.children.length > 0) traverse(n.children);
				}
			};
			const roots = this.buildUnifiedHierarchyTree(allEntries);
			traverse(roots);
			// Sort flattened nodes
			allNodes.sort((a, b) => {
				let valA: any = null;
				let valB: any = null;
				if (this.sortCol === 'title') {
					valA = a.entry.file.basename;
					valB = b.entry.file.basename;
				} else {
					valA = a.entry.getValue(this.sortCol!);
				}
				if (this.sortCol !== 'title') {
					valB = b.entry.getValue(this.sortCol!);
				}
				const strA = valA !== null && valA !== undefined ? cleanWikilinkTitle(valA).toLowerCase() : '';
				const strB = valB !== null && valB !== undefined ? cleanWikilinkTitle(valB).toLowerCase() : '';
				const numA = Number(strA);
				const numB = Number(strB);
				let cmp = 0;
				if (!isNaN(numA) && !isNaN(numB) && strA !== '' && strB !== '') {
					cmp = numA - numB;
				} else {
					cmp = strA.localeCompare(strB, undefined, { numeric: true, sensitivity: 'base' });
				}
				return this.sortDir === 'desc' ? -cmp : cmp;
			});
			// When sorted, disable tree rendering and just render flat list
			for (const n of allNodes) {
				n.children = [];
				n.hasChildren = false;
				n.level = 0;
			}
			finalEntries = allNodes;
		} else {
			finalEntries = this.buildUnifiedHierarchyTree(allEntries);
		}

		const tbody = table.createEl('tbody');
		for (const rootNode of finalEntries) {
			this.renderNodeRow(tbody, rootNode, displayProps);
		}

		// ---- "+ New" footer ----
		const newRow = root.createDiv({ cls: 'ntn-new-row' });
		newRow.createSpan({ cls: 'ntn-new-plus', text: '+' });
		newRow.createSpan({ text: 'New' });
		newRow.addEventListener('click', () => void this.createAndOpenPage());
	}

	private renderNodeRow(
		tbody: HTMLElement,
		node: EntryHierarchyNode,
		props: BasesPropertyId[],
	): void {
		const entry = node.entry;
		const isExpanded = this.expandedPaths.has(entry.file.path);

		const tr = tbody.createEl('tr', { cls: 'ntn-row' });

		// Title cell: caret toggle + indent + page icon + name + subcount + hover OPEN button
		const titleTd = tr.createEl('td', { cls: 'ntn-td ntn-col-title' });
		const titleWrap = titleTd.createDiv({ cls: 'ntn-title-wrap' });

		// Indentation spacer
		if (node.level > 0) {
			const spacer = titleWrap.createSpan({ cls: 'ntn-indent-spacer' });
			spacer.style.width = `${node.level * 20}px`;
		}

		// Caret Toggle Button (▶ / ▼)
		if (node.hasChildren) {
			const toggleBtn = titleWrap.createSpan({
				cls: `ntn-toggle-btn ${isExpanded ? 'expanded' : ''}`
			});
			toggleBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
			toggleBtn.addEventListener('click', (evt) => {
				evt.stopPropagation();
				if (this.expandedPaths.has(entry.file.path)) {
					this.expandedPaths.delete(entry.file.path);
				} else {
					this.expandedPaths.add(entry.file.path);
				}
				this.onDataUpdated();
			});
		} else {
			const emptyBtn = titleWrap.createSpan({ cls: 'ntn-toggle-btn' });
			emptyBtn.setCssStyles({ opacity: '0' });
		}

		titleWrap.createSpan({ cls: 'ntn-page-icon', text: '📄' });
		const link = titleWrap.createSpan({
			cls: 'ntn-title-text',
			text: entry.file.basename,
		});
		link.addEventListener('click', (evt) => {
			const mode = this.config.get('openMode');
			if (mode === 'split') {
				void this.app.workspace.openLinkText(entry.file.path, '', 'split');
			} else if (mode === 'panel') {
				this.openPagePanel(entry.file);
			} else {
				void this.app.workspace.openLinkText(entry.file.path, '', evt.ctrlKey || evt.metaKey);
			}
		});

		if (node.hasChildren) {
			titleWrap.createSpan({ cls: 'ntn-subcount', text: String(node.children.length) });
		}

		const openBtn = titleWrap.createSpan({ cls: 'ntn-open-btn', text: 'OPEN' });
		openBtn.addEventListener('click', (evt) => {
			evt.stopPropagation();
			const mode = this.config.get('openMode');
			if (mode === 'split') {
				void this.app.workspace.openLinkText(entry.file.path, '', 'split');
			} else if (mode === 'panel') {
				this.openPagePanel(entry.file);
			} else {
				void this.app.workspace.openLinkText(entry.file.path, '', true);
			}
		});

		for (const prop of props) {
			const td = tr.createEl('td', { cls: 'ntn-td' });
			this.renderCell(td, entry, prop);
		}

		// Render child sub-items if expanded
		if (isExpanded && node.children.length > 0) {
			for (const child of node.children) {
				this.renderNodeRow(tbody, child, props);
			}
		}
	}

		private isPillProp(prop: BasesPropertyId): boolean {
		const bare = prop.includes('.') ? prop.split('.').slice(1).join('.').toLowerCase() : prop.toLowerCase();
		const userParent = String(this.config.get('parentProperty') || '').toLowerCase().trim();
		if (userParent && (bare === userParent || bare.replace(/[_\\-\\s]+/g, '') === userParent.replace(/[_\\-\\s]+/g, ''))) return true;
		for (const p of this.pills.pillProps) {
			const pBare = p.includes('.') ? p.split('.').slice(1).join('.').toLowerCase() : p.toLowerCase();
			if (pBare === bare) return true;
		}
		return bare === 'parent_item' || bare === 'parent item' || bare === 'parent' || bare === 'year' || bare === 'tags' || bare === 'status';
	}

		/** Strictly check if a property is a Date property via MetadataTypeManager, value type, name, or ISO format. */
	private isDateProperty(prop: BasesPropertyId, propName: string, value: unknown): boolean {
		if (value !== null && (value?.constructor?.name === 'DateValue' || value instanceof Date)) {
			return true;
		}
		if (prop.startsWith('file.ctime') || prop.startsWith('file.mtime')) {
			return true;
		}
		const bare = propName.includes('.') ? propName.split('.').pop()! : propName;
		const lowBare = bare.toLowerCase().trim();
		const mtm = (this.app as unknown as {
			metadataTypeManager?: { getPropertyInfo?: (name: string) => { type?: string; widget?: string } | string };
		})?.metadataTypeManager;
		const info = mtm?.getPropertyInfo?.(lowBare);
		const metaType = typeof info === 'string' ? info : (info?.widget ?? info?.type);
		if (metaType === 'date' || metaType === 'datetime') {
			return true;
		}
		const normalized = lowBare.replace(/[_\.-\s]+/g, ' ');
		const keywords = ['date', 'due', 'deadline', 'ctime', 'mtime', 'created', 'completion'];
		for (const kw of keywords) {
			if (normalized === kw || normalized.startsWith(kw + ' ') || normalized.endsWith(' ' + kw) || normalized.includes(' ' + kw + ' ')) {
				return true;
			}
		}
		if (value !== null && typeof value === 'object' && 'toString' in value) {
			const strVal = String(value).trim();
			if (/^\d{4}-\d{2}-\d{2}/.test(strVal)) {
				return true;
			}
		}
		return false;
	}

	private renderCell(td: HTMLElement, entry: BasesEntry, prop: BasesPropertyId): void {
		const value = entry.getValue(prop);
		const isFileStat = prop.startsWith('file.ctime') || prop.startsWith('file.mtime') || prop.startsWith('file.path') || prop.startsWith('file.folder'); const editable = !isFileStat;
		const propName = prop.includes('.') ? prop.split('.').slice(1).join('.') : prop;

		const isDatePropName = this.isDateProperty(prop, propName, value);

		// ---- Pills (lists, tags, user-selected select-like properties) ----
		const isPill = !isDatePropName && (this.isPillProp(prop) || (value !== null && String(value).includes('[[')));
		if (isPill) {
			const wrap = td.createDiv({ cls: 'ntn-pills' });
			const items = valueToStrings(value);
			for (const item of items) {
				const cleanedText = cleanWikilinkTitle(item).replace(/^#/, '');
				if (cleanedText) {
					const pill = wrap.createSpan({ cls: 'ntn-pill' });
					this.applyPillColor(pill, cleanedText);
					pill.setText(cleanedText);
					// Add full path tooltip on hover if item is a wikilink
					if (item.includes('[[')) {
						const match = item.match(/\[\[([^\]|]+)/);
						if (match && match[1]) {
							pill.setAttribute('title', match[1].trim());
						}
					}
				}
			}
			if (editable) {
				td.addClass('ntn-editable');
				td.addEventListener('click', () =>
					this.openSelectEditor(td, entry, prop, propName),
				);
				// Keep an open menu pointed at this re-rendered cell so
				// click-to-toggle keeps working after a write re-renders the table.
				this.selectEditor?.reanchorIfMatches(td, entry.file.path, prop);
			}
			return;
		}

		// ---- Checkboxes write straight back to frontmatter ----
		if (value instanceof BooleanValue) {
			const cb = td.createEl('input', { type: 'checkbox', cls: 'ntn-checkbox' });
			cb.checked = value.isTruthy();
			if (editable) {
				cb.addEventListener('change', () => {
					void this.writeProperty(entry.file, propName, cb.checked);
				});
			} else {
				cb.disabled = true;
			}
			return;
		}

		// ---- Plain values: native render, click/dblclick to edit ----
		const cellEl = td.createDiv({ cls: 'ntn-cell' });
		const isFileProp = prop.startsWith('file.ctime') || prop.startsWith('file.mtime');
		const isDate = isDatePropName;

		if (isDate) {
			// Render clean date text (removes the weird widget box & click interception from imported Notion dates)
			const rawDateStr = extractRawDateString(value);
			const textToShow = (rawDateStr && rawDateStr !== 'null' && rawDateStr !== 'undefined') ? rawDateStr : '';
			cellEl.setText(textToShow);
		} else if (value !== null) {
			const s = String(value).trim();
			if (s !== 'null' && s !== 'undefined') {
				if (s.startsWith('[[') && s.endsWith(']]')) {
					cellEl.setText(cleanWikilinkTitle(s));
				} else {
					value.renderTo(cellEl, this.app.renderContext);
				}
			}
		}

		if (!isFileProp) {
			td.addClass('ntn-editable');
			const kind = value instanceof NumberValue ? 'number' : (isDate ? 'date' : 'text');
			const handleEdit = (evt: MouseEvent) => {
				if (!isDate) {
					const target = evt.target as HTMLElement;
					if (target.closest('a')) return;
				}
				evt.preventDefault();
				evt.stopPropagation();
				const rawVal = isDate ? (extractRawDateString(value) || cellEl.textContent?.trim() || '') : (value ? value.toString() : '');
				this.editCell(td, entry, propName, rawVal, kind);
			};
			td.addEventListener('dblclick', handleEdit);
			td.addEventListener('click', handleEdit);
		}
	}

	/** Swap a cell's content for an input; commit on Enter/blur, cancel on Esc. */
	private editCell(
		td: HTMLElement,
		entry: BasesEntry,
		propName: string,
		current: string,
		kind: 'text' | 'number' | 'date',
	): void {
		if (td.querySelector('.ntn-input')) return;

		// For date cells, launch ObsidianNativeDatePicker directly on td WITHOUT emptying cell or creating HTML <input type="date">
		if (kind === 'date') {
			const initialVal = extractRawDateString(current) || td.textContent?.trim() || '';
			new ObsidianNativeDatePicker(
				td,
				initialVal,
				(formattedStr) => {
					void this.writeProperty(entry.file, propName, formattedStr);
				},
				this.rootEl.doc
			);
			return;
		}

		const rect = td.getBoundingClientRect();
		const multiline = kind === 'text' && rect.height > 40;
		td.empty();

		let initialVal = current;

		const input = multiline
			? td.createEl('textarea', { cls: 'ntn-input ntn-textarea' })
			: td.createEl('input', {
					type: kind === 'number' ? 'number' : 'text',
					cls: 'ntn-input',
				});

		input.setCssStyles({
			width: `${Math.max(rect.width, 140)}px`,
			height: `${Math.max(rect.height, 30)}px`,
		});
		input.value = initialVal;
		input.focus();
		input.select();

		let committed = false;
		const commit = () => {
			if (committed) return;
			committed = true;
			const raw = input.value.trim();
			if (raw === current) {
				this.onDataUpdated();
				return;
			}
			let out: unknown = raw || null;
			if (kind === 'number') {
				const n = Number(raw);
				out = raw === '' ? null : (Number.isNaN(n) ? raw : n);
			}
			void this.writeProperty(entry.file, propName, out);
		};

		input.addEventListener('blur', commit);
		input.addEventListener('keydown', (ev: Event) => {
			const evt = ev as KeyboardEvent;
			if (evt.key === 'Enter') {
				commit();
			} else if (evt.key === 'Escape') {
				committed = true;
				this.onDataUpdated();
			}
		});
	}

	private async writeProperty(file: TFile, propName: string, value: unknown): Promise<void> {
		if (!propName || propName === 'null' || propName === 'undefined' || !propName.trim()) return;
		try {
			await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
				// Sweep and clean up any keys in frontmatter whose value is null, 'null', or empty
				for (const [k, v] of Object.entries(fm)) {
					if (k === 'null' || k === 'undefined' || v === null || v === 'null' || v === undefined || (Array.isArray(v) && (v.length === 0 || (v.length === 1 && (v[0] === null || v[0] === 'null' || v[0] === ''))))) {
						delete fm[k];
					}
				}

				const keyToUse = Object.keys(fm).find(k => k.toLowerCase() === propName.toLowerCase()) || propName;
				const isNullVal = value === null || value === '' || value === undefined || value === 'null' || (Array.isArray(value) && (value.length === 0 || (value.length === 1 && (value[0] === null || value[0] === 'null' || value[0] === ''))));
				
				if (isNullVal) {
					delete fm[keyToUse];
				} else {
					fm[keyToUse] = value;
				}
			});
			this.onDataUpdated();
		} catch (e) {
			console.error(`${LOG_PREFIX} failed to write property`, propName, e);
			new Notice(`Couldn't update "${propName}".`);
			this.onDataUpdated();
		}
	}

	/**
	 * Reroute the core toolbar's New button to the page panel while this
	 * view is active. The button lives on the query controller, outside this
	 * view's DOM, so its menu's `open` is shadowed on the instance and
	 * restored on unload. `newItemMenu` is internal API — if it ever moves,
	 * the guard below simply leaves the core behavior untouched (and the
	 * footer "+ New" falls back to its own capture flow).
	 */
	private patchToolbarNew(): void {
		if (this.newButtonPatched) return;
		const menu = (this.queryCtrl as unknown as { newItemMenu?: CoreNewItemMenu })
			.newItemMenu;
		if (!menu || typeof menu.open !== 'function' || typeof menu.close !== 'function') {
			return;
		}

		const orig = menu.open.bind(menu);
		const patched = async (
			name?: string,
			fmProc?: (fm: Record<string, unknown>) => void,
		): Promise<void> => {
			// Phones already get a full-screen tab from the core flow.
			if (Platform.isPhone) return orig(name, fmProc);
			let created: TFile | undefined;
			const ref = this.app.vault.on('create', (file) => {
				if (file instanceof TFile) created = file;
			});
			// Keep the core popover invisible for the instant it exists.
			const body = this.rootEl.doc.body;
			body.addClass('ntn-hide-new-popover');
			try {
				// The core flow still creates the file (folder + filter
				// frontmatter) and opens its popover, hidden by the class above.
				await orig(name, fmProc);
			} finally {
				this.app.vault.offref(ref);
				menu.close(); // tear down the hidden popover
				body.removeClass('ntn-hide-new-popover');
			}
			if (created) this.openPagePanel(created);
		};

		menu.open = patched;
		this.newButtonPatched = true;
		this.register(() => {
			// The bound original behaves identically for any later caller.
			menu.open = orig;
			this.newButtonPatched = false;
		});
	}

	/**
	 * "+ New" flow: create the note through the core Bases flow — so it lands
	 * in the configured folder and gets the frontmatter implied by the view's
	 * filters — then edit it in the centered Notion-style page panel instead
	 * of the small popover Obsidian anchors to the toolbar's New button.
	 */
	private async createAndOpenPage(): Promise<void> {
		// On phones the core flow already opens the note in a full-screen
		// tab; with the toolbar patch in place, createFileForView routes
		// through the patched menu, which opens the panel for us.
		if (Platform.isPhone || this.newButtonPatched) {
			await this.createFileForView();
			return;
		}
		// createFileForView resolves with void, so capture the file it
		// creates through the vault's create event.
		let created: TFile | undefined;
		const ref = this.app.vault.on('create', (file) => {
			if (file instanceof TFile) created = file;
		});
		try {
			await this.createFileForView();
		} finally {
			this.app.vault.offref(ref);
		}
		if (!created) return;

		// Dismiss the toolbar-anchored popover the core flow opened; the core
		// new-item menu closes itself on any click outside the popover.
		const doc = this.rootEl.doc;
		if (doc.querySelector('.bases-new-item-popover')) doc.body.click();

		this.openPagePanel(created);
	}

	/** Open a note centered in the Notion-style page panel. */
	private openPagePanel(file: TFile): void {
		new NotePageModal(this.app, file, {
			applyColor: (pill, text) => this.applyPillColor(pill, text),
			write: (f, propName, value) => this.writeProperty(f, propName, value),
			isPillProp: (name) =>
				this.pills.pillProps.has(`note.${name}` as BasesPropertyId),
			isListProp: (name) =>
				this.pills.listProps.has(`note.${name}` as BasesPropertyId),
			openSelect: (opts) => this.openSelectAt(opts),
			reanchorSelect: (anchor, filePath, propName) =>
				void this.selectEditor?.reanchorIfMatches(
					anchor, filePath, `note.${propName}` as BasesPropertyId,
				),
			closeSelect: () => this.closeSelectMenu(),
		}).open();
	}

	/** Color a pill element using this view's pinned-color overrides. */
	private applyPillColor(pill: HTMLElement, text: string): void {
		applyPillColor(pill, text, this.pinnedColors);
	}

	/** Open the Notion-style select editor for a pill cell of the table. */
	private openSelectEditor(
		td: HTMLElement,
		entry: BasesEntry,
		prop: BasesPropertyId,
		propName: string,
	): void {
		this.openSelectAt({
			anchor: td,
			file: entry.file,
			propName,
			current: valueToStrings(entry.getValue(prop)),
			isList: this.pills.listProps.has(prop),
		});
	}

	/**
	 * Open the select editor anchored anywhere — a table cell or a property
	 * row of the page panel. Known values always come from the live query
	 * result; lifetime stays with the view (outside-click / Esc / unload).
	 */
	private openSelectAt(opts: OpenSelectOpts): void {
		// Clicking the element whose menu is already open toggles it shut.
		if (this.selectEditor?.anchorEl === opts.anchor) {
			this.closeSelectMenu();
			return;
		}
		this.closeSelectMenu();
		const prop = `note.${opts.propName}` as BasesPropertyId;
		this.selectEditor = new SelectEditor({
			app: this.app,
			doc: this.rootEl.doc,
			win: this.rootEl.win,
			anchor: opts.anchor,
			entries: this.data.data,
			file: opts.file,
			current: opts.current,
			prop,
			isList: opts.isList,
			applyColor: (pill, text) => this.applyPillColor(pill, text),
			write: (value) =>
				void this.writeProperty(opts.file, opts.propName, value)
					.then(() => opts.onWrite?.()),
			setColor: (value, colorName) => this.setPinnedColor(value, colorName),
			onClose: () => { this.selectEditor = null; },
		});
	}

	/**
	 * Pin a value to a specific Notion color. Updates the live map for instant
	 * feedback in the open editor, then persists into the `pinnedColors` view
	 * option (replacing any prior entry for the same value) so it survives
	 * reloads and is editable from the view settings too.
	 */
	private setPinnedColor(value: string, colorSpec: string): void {
		const bare = value.replace(/^#/, '');
		const key = bare.toLowerCase();

		let colorObj: NotionColor | undefined;
		if (colorSpec.includes('|') || colorSpec.startsWith('#')) {
			const parts = colorSpec.split('|');
			const bg = parts[0].trim();
			let fg = parts[1] ? parts[1].trim() : '#ffffff';
			if (fg === 'white' || fg === 'light') fg = '#ffffff';
			if (fg === 'black' || fg === 'dark') fg = '#111827';
			colorObj = {
				name: 'custom',
				lightBg: bg,
				lightFg: fg,
				darkBg: bg,
				darkFg: fg,
			};
		} else {
			colorObj = colorByName(colorSpec.toLowerCase());
		}

		if (!colorObj) return;
		this.pinnedColors.set(key, colorObj);

		const raw = this.config.get('pinnedColors');
		const list = Array.isArray(raw) ? raw.map((s) => String(s)) : [];
		const kept = list.filter((item) => {
			const m = item.match(/^(.+?)\s*[=:]\s*(.+)$/);
			return m ? m[1].trim().replace(/^#/, '').toLowerCase() !== key : true;
		});
		kept.push(`${bare}=${colorSpec}`);
		this.config.set('pinnedColors', kept);
		this.onDataUpdated();
	}

	private closeSelectMenu(): void {
		this.selectEditor?.close();
		this.selectEditor = null;
	}
}
