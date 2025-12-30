import { cn } from '../lib/cn';
import type { PropsWithChildren } from 'react';

type CardProps = PropsWithChildren<{
	title?: string;
	description?: string;
	className?: string;
}>;

export function Card({ title, description, className, children }: CardProps) {
	return (
		<div className={cn('rounded-lg border border-slate-200 bg-white', className)}>
			{(title || description) && (
				<header className="border-b border-slate-100 px-4 py-2.5">
					{title && <h2 className="text-sm font-semibold text-slate-900">{title}</h2>}
					{description && <p className="text-xs text-slate-500">{description}</p>}
				</header>
			)}
			<div className="p-4 sm:p-5">{children}</div>
		</div>
	);
}
