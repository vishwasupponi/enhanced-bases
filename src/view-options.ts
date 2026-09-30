/** The view-settings options GoodBases adds to the Bases toolbar. */
import { BasesAllOptions, BasesViewConfig } from 'obsidian';

/**
 * Build the option descriptors Obsidian renders in the view's settings.
 * Read the values back at render time with `this.config.get(key)`.
 */
export function buildViewOptions(_config: BasesViewConfig): BasesAllOptions[] {
	return [
		{
			type: 'property',
			key: 'parentProperty',
			displayName: 'Parent property name',
			default: 'parent item',
		},
		{
			type: 'toggle',
			key: 'wrapCells',
			displayName: 'Wrap all content',
			default: true,
		},
		{
			type: 'toggle',
			key: 'verticalLines',
			displayName: 'Show vertical lines',
			default: true,
		},
		{
			type: 'dropdown',
			key: 'openMode',
			displayName: 'Open notes in',
			default: 'tab',
			options: {
				tab: 'New tab',
				panel: 'Page panel',
				split: 'Side panel',
			},
		},
		{
			type: 'multitext',
			key: 'pillProperties',
			displayName: 'Properties to show as colored pills',
		},
		{
			type: 'multitext',
			key: 'pinnedColors',
			displayName: 'Pinned pill colors (value=color: gray, brown, orange, yellow, green, blue, purple, pink, red)',
		},
	];
}
