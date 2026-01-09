import { useState } from 'react';
import convertIcon from '../assets/convert.svg';
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
];

export function Sidebar() {
	const [activeItem, setActiveItem] = useState('video-to-png');

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
						onClick={() => setActiveItem(item.id)}
						className={`navButton ${activeItem === item.id ? 'navButtonActive' : 'navButtonInactive'}`}
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
