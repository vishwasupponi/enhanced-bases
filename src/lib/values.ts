/** Helpers for turning Bases `Value`s into the plain strings the table renders. */
import { ListValue, Value } from 'obsidian';

/**
 * Flatten a Bases value to display strings. A `ListValue` yields one string per
 * non-empty item; a scalar yields a single-element array; `null` yields `[]`.
 */
export function valueToStrings(value: Value | null): string[] {
	if (value === null) return [];
	if (value instanceof ListValue) {
		const out: string[] = [];
		for (let i = 0; i < value.length(); i++) {
			const item = value.get(i);
			if (item) {
				const s = item.toString().trim();
				if (s && s !== 'null' && s !== 'undefined') out.push(s);
			}
		}
		return out;
	}
	const s = value.toString().trim();
	return (s && s !== 'null' && s !== 'undefined') ? [s] : [];
}
