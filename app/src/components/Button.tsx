import type { ReactNode, ButtonHTMLAttributes } from 'react';
import '../styles/Button.css';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: 'primary' | 'secondary' | 'ghost';
	icon?: string;
	iconAlt?: string;
	children: ReactNode;
}

export function Button({ variant = 'primary', icon, iconAlt, children, className = '', ...props }: ButtonProps) {
	const variantClass = {
		primary: 'buttonPrimary',
		secondary: 'buttonSecondary',
		ghost: 'buttonGhost',
	}[variant];

	return (
		<button className={`button ${variantClass} ${className}`} {...props}>
			{icon && <img src={icon} alt={iconAlt || ''} className="buttonIcon" />}
			{children}
		</button>
	);
}
