import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import '../styles/Layout.css';

interface LayoutProps {
	children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
	return (
		<div className="layout-container">
			<Sidebar />
			<div className="layout-content">
				<TopBar />
				<main className="layout-main">
					{children}
				</main>
			</div>
		</div>
	);
}
