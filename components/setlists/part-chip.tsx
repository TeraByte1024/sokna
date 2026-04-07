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
			layout // 순서 변경 시 부드럽게 이동
			onPointerDown={handlePointerDown}
			onPointerUp={clearTimer}
			onPointerLeave={clearTimer}
			// ✅ 흔들림 애니메이션
			animate={isDragging ? { rotate: [-1, 1, -1] } : { rotate: 0 }}
			transition={
				isDragging
					? {
							rotate: { repeat: Infinity, duration: 0.15, ease: "linear" },
						}
					: { rotate: { duration: 0.1 } }
			}
			whileDrag={{ scale: 1.1, zIndex: 50 }}
			className={cn(
				// ✅ 배경색 통합 및 강조 디자인 (Royal Blue & Deep Navy 조합)
				"group flex items-center rounded-lg border shadow-sm h-9 px-4 gap-3 select-none touch-none transition-all duration-200",
				isDragging
					? "border-blue-600 bg-blue-600 text-white shadow-xl ring-4 ring-blue-500/20"
					: "border-slate-200 bg-white text-slate-700 cursor-pointer hover:border-blue-500 hover:bg-blue-50/50 active:scale-95 shadow-sm",
			)}
			onClick={onClick}
		>
			<span
				className={cn(
					"text-[13px] font-bold tracking-tight",
					isDragging ? "text-white" : "text-slate-800",
				)}
			>
				{label}
			</span>
			{/* ✅ 배경 구분 없이 텍스트 강조만 진행 */}
			<span
				className={cn(
					"text-[11px] font-black min-w-[1.2rem] text-center px-1.5 py-0.5 rounded",
					isDragging ? "bg-white/20 text-white" : "bg-blue-100 text-blue-700",
				)}
			>
				{count}
			</span>
		</motion.div>
	);
}
