"use client";

import { Reorder, useDragControls } from "framer-motion";
import { useState } from "react";
import { PartChip } from "./part-chip";

interface ReorderItemWrapperProps {
    name: string;
    count: number;
    onRemove: (name: string) => void;
}

export function ReorderItemWrapper({ name, count, onRemove }: ReorderItemWrapperProps) {
    const dragControls = useDragControls();
    const [isDragging, setIsDragging] = useState(false);

    return (
        <Reorder.Item
            value={name}
            dragListener={false}
            dragControls={dragControls}
            // ✅ 상태 변경을 통한 정석적인 리렌더링 유발
            onDragStart={() => setIsDragging(true)}
            onDragEnd={() => setIsDragging(false)}
            className="relative"
        >
            <PartChip
                label={name}
                count={count}
                isDragging={isDragging} // 자식에게 명확히 전달
                dragControls={dragControls}
                onLongPressStart={() => setIsDragging(true)}
                onClick={() => {
                    if (isDragging) return;
                    onRemove(name);
                }}
            />
        </Reorder.Item>
    );
}