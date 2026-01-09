import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { App } from './App';

declare global {
	var __reactRoot: Root | undefined;
}

function start() {
	const container = document.getElementById('root')!;

	if (!globalThis.__reactRoot) {
		globalThis.__reactRoot = createRoot(container);
	}

	globalThis.__reactRoot.render(<App />);
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', start);
} else {
	start();
}
