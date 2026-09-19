"use client";

import { cn } from "@/lib/utils";
import { motion, DragControls } from "framer-motion";
import { useRef } from "react";

interface PartChipProps {
	label: string;
	count: number;
	isDragging: boolean;
	dragControls: DragControls;
	onLongPressStart: () => void;
	onClick: (e: React.MouseEvent) => void;
}

export function PartChip({
	label,
	count,
	isDragging,
	dragControls,
	onLongPressStart,
	onClick,
}: PartChipProps) {
	const timerRef = useRef<NodeJS.Timeout | null>(null);

	const handlePointerDown = (e: React.PointerEvent) => {
		timerRef.current = setTimeout(() => {
			onLongPressStart();
			dragControls.start(e);
		}, 400);
	};

	const clearTimer = () => {
		if (timerRef.current) clearTimeout(timerRef.current);
	};

	return (
		<motion.div
			layout
			onPointerDown={handlePointerDown}
			onPointerUp={clearTimer}
			onPointerLeave={clearTimer}
			animate={isDragging ? { rotate: [-1, 1, -1] } : { rotate: 0 }}
			transition={
				isDragging
					? {
							rotate: { repeat: Infinity, duration: 0.15, ease: "linear" },
						}
					: { rotate: { duration: 0.1 } }
			}
			whileDrag={{ scale: 1.08, zIndex: 50 }}
			className={cn(
				"group flex items-center rounded-xl border shadow-xs h-9 px-3.5 gap-2.5 select-none touch-none transition-all duration-200",
				isDragging
					? "border-primary bg-primary text-primary-foreground shadow-xl ring-4 ring-primary/20"
					: "border-border/80 bg-card text-foreground cursor-pointer hover:border-primary/50 hover:bg-muted/50 active:scale-95",
			)}
			onClick={onClick}
		>
			<span
				className={cn(
					"text-xs font-bold tracking-tight",
					isDragging ? "text-primary-foreground" : "text-foreground",
				)}
			>
				{label}
			</span>
			<span
				className={cn(
					"text-xs font-black",
					isDragging ? "text-primary-foreground" : "text-primary",
				)}
			>
				{count}
			</span>
		</motion.div>
	);
}
