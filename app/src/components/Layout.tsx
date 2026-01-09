import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import '../styles/Layout.css';

interface LayoutProps {
	children: ReactNode;
	activeTab: string;
	onTabChange: (id: string) => void;
}

export function Layout({ children, activeTab, onTabChange }: LayoutProps) {
	return (
		<div className="layout-container">
			<Sidebar activeTab={activeTab} onTabChange={onTabChange} />
			<div className="layout-content">
				<TopBar />
				<main className="layout-main">
					{children}
				</main>
			</div>
		</div>
	);
}
