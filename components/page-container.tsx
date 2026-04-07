import { cn } from "@/lib/utils";

interface PageContainerProps {
	children: React.ReactNode;
	className?: string;
}

export function PageContainer({ children, className }: PageContainerProps) {
	return (
		<div
			className={cn(
				"max-w-5xl mx-auto w-full p-10 flex flex-col gap-12 sm:gap-20",
				className,
			)}
		>
			{children}
		</div>
	);
}
