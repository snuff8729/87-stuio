import { EditorView } from '@codemirror/view'

export const darkTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: 'oklch(0.205 0 0)',
      color: 'oklch(0.985 0 0)',
      borderRadius: '0.5rem',
      border: '1px solid oklch(1 0 0 / 10%)',
      fontSize: '13px',
    },
    '.cm-content': {
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      padding: '8px 0',
      caretColor: 'oklch(0.985 0 0)',
    },
    '.cm-cursor': {
      borderLeftColor: 'oklch(0.985 0 0)',
    },
    '&.cm-focused': {
      outline: '2px solid oklch(0.556 0 0)',
      outlineOffset: '-1px',
    },
    '.cm-gutters': {
      backgroundColor: 'oklch(0.205 0 0)',
      color: 'oklch(0.556 0 0)',
      border: 'none',
    },
    '.cm-activeLine': {
      backgroundColor: 'oklch(1 0 0 / 5%)',
    },
    '.cm-selectionBackground': {
      backgroundColor: 'oklch(0.488 0.243 264.376 / 30%) !important',
    },
    '.cm-line': {
      padding: '0 8px',
    },
    // Placeholder highlight styling
    '.cm-placeholder-highlight': {
      backgroundColor: 'oklch(0.488 0.243 264.376 / 20%)',
      borderRadius: '3px',
      padding: '1px 0',
      border: '1px solid oklch(0.488 0.243 264.376 / 40%)',
    },
    // Autocomplete styling
    '.cm-tooltip-autocomplete': {
      backgroundColor: 'oklch(0.205 0 0)',
      border: '1px solid oklch(1 0 0 / 10%)',
      borderRadius: '0.375rem',
    },
    '.cm-tooltip-autocomplete ul li': {
      padding: '4px 8px',
    },
    '.cm-tooltip-autocomplete ul li[aria-selected]': {
      backgroundColor: 'oklch(0.269 0 0)',
    },
    '.cm-completionLabel': {
      color: 'oklch(0.985 0 0)',
    },
    '.cm-completionDetail': {
      color: 'oklch(0.556 0 0)',
      fontStyle: 'normal',
      marginLeft: '8px',
    },
  },
  { dark: true },
)
