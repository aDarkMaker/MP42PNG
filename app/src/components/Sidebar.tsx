import { useState } from 'react';
import convertIcon from '../assets/convert.svg';
import settingsIcon from '../assets/settings.svg';
import logo from '../assets/logo.svg';
import '../styles/Sidebar.css';

interface NavItem {
	id: string;
	name: string;
	icon: string;
	description: string;
}

const navItems: NavItem[] = [
	{
		id: 'video-to-png',
		name: '手书抽帧',
		icon: convertIcon,
		description: '将手书抽帧为PNG',
	},
	{
		id: 'settings',
		name: '设置',
		icon: settingsIcon,
		description: '配置一些内容'
	}
];

interface SidebarProps {
	activeTab: string;
	onTabChange: (id: string) => void;
}

export function Sidebar({ activeTab, onTabChange }: SidebarProps) {
	return (
		<aside className="sidebar">
			<div className="logoSection">
				<div className="logoContainer">
					<img src={logo} alt="MP42PNG" className="logoImage" />
					<div>
						<h1 className="logoTitle">ArtBox</h1>
					</div>
				</div>
			</div>

			<nav className="nav">
				{navItems.map((item) => (
					<button
						key={item.id}
						onClick={() => onTabChange(item.id)}
						className={`navButton ${activeTab === item.id ? 'navButtonActive' : 'navButtonInactive'}`}
					>
						<img src={item.icon} alt={item.name} className="navIcon" />
						<div className="navContent">
							<div className="navName">{item.name}</div>
							<div className="navDescription">{item.description}</div>
						</div>
					</button>
				))}
			</nav>

		</aside>
	);
}
