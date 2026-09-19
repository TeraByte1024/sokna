"use client";

import React, {
	useRef,
	useEffect,
	useCallback,
	useState,
} from "react";
import { parseTimestampsAndRanges, type ParsedTimestampItem } from "@/lib/nomination";
import { cn } from "@/lib/utils";

interface RichTimestampTextareaProps {
	value: string;
	onChange: (value: string) => void;
	onSeek?: (seconds: number) => void;
	placeholder?: string;
	className?: string;
	disabled?: boolean;
}

/**
 * DOM 엘리먼트 내부에서 텍스트 및 data-raw 뱃지 텍스트를 추출하여 일반 문자열로 변환
 */
function extractTextFromDOM(root: HTMLElement): string {
	let text = "";

	function walk(node: Node) {
		if (node.nodeType === Node.TEXT_NODE) {
			text += node.nodeValue || "";
		} else if (node.nodeType === Node.ELEMENT_NODE) {
			const el = node as HTMLElement;
			if (el.dataset.raw) {
				text += el.dataset.raw;
			} else if (el.tagName === "BR") {
				text += "\n";
			} else if (el.tagName === "DIV" || el.tagName === "P") {
				if (text.length > 0 && !text.endsWith("\n")) {
					text += "\n";
				}
				for (const child of Array.from(el.childNodes)) {
					walk(child);
				}
			} else {
				for (const child of Array.from(el.childNodes)) {
					walk(child);
				}
			}
		}
	}

	for (const child of Array.from(root.childNodes)) {
		walk(child);
	}

	return text;
}

export function RichTimestampTextarea({
	value,
	onChange,
	onSeek,
	placeholder = "영상 설명 입력 (예: 원곡 라이브 / 01:23 ~ 02:45 솔로 카피 필요)",
	className,
	disabled = false,
}: RichTimestampTextareaProps) {
	const editorRef = useRef<HTMLDivElement>(null);
	const isComposingRef = useRef(false);
	const lastSentValueRef = useRef(value);
	const [isEmpty, setIsEmpty] = useState(!value);

	// 타임스탬프 뱃지 DOM 요소 생성
	const createBadgeElement = useCallback(
		(item: ParsedTimestampItem, onDelete: () => void) => {
			const badge = document.createElement("span");
			badge.contentEditable = "false";
			badge.dataset.raw = item.raw;
			badge.dataset.seconds = String(item.startSeconds);
			badge.className =
				"inline-flex items-center gap-1.5 mx-1 px-2 py-0.5 rounded-lg bg-primary/10 text-primary border border-primary/25 text-[11px] font-sans align-middle select-none shadow-2xs hover:bg-primary/20 transition-all cursor-pointer";

			// 재생 및 타임스탬프 표시 영역
			const contentSpan = document.createElement("span");
			contentSpan.className = "inline-flex items-center gap-1.5";
			contentSpan.title = `${item.raw} 시작 지점으로 영상 이동`;
			contentSpan.innerHTML = `
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-2.5 fill-current shrink-0"><polygon points="6 3 20 12 6 21 6 3"/></svg>
				<span class="font-semibold tabular-nums tracking-tight">${item.raw}</span>
				${item.label ? `<span class="font-medium text-[11px] text-primary/85">${item.label}</span>` : ""}
			`;
			contentSpan.onclick = (e) => {
				e.preventDefault();
				e.stopPropagation();
				onSeek?.(item.startSeconds);
			};
			badge.appendChild(contentSpan);

			// 뱃지 내 'X' 삭제 버튼
			const delBtn = document.createElement("button");
			delBtn.type = "button";
			delBtn.className =
				"size-4 rounded-full inline-flex items-center justify-center hover:bg-destructive/20 hover:text-destructive text-primary/60 hover:text-destructive transition-colors cursor-pointer ml-0.5";
			delBtn.title = `${item.raw} 구간 삭제`;
			delBtn.innerHTML = `
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="size-2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
			`;
			delBtn.onclick = (e) => {
				e.preventDefault();
				e.stopPropagation();
				onDelete();
			};
			badge.appendChild(delBtn);

			return badge;
		},
		[onSeek],
	);

	// 전체 텍스트를 파싱하여 DOM Fragment로 렌더링
	const renderFragment = useCallback(
		(text: string) => {
			const frag = document.createDocumentFragment();
			if (!text) return frag;

			const items = parseTimestampsAndRanges(text);
			if (items.length === 0) {
				const lines = text.split("\n");
				lines.forEach((line, i) => {
					if (i > 0) frag.appendChild(document.createElement("br"));
					if (line) frag.appendChild(document.createTextNode(line));
				});
				return frag;
			}

			let lastIdx = 0;
			const appendPlain = (str: string) => {
				const lines = str.split("\n");
				lines.forEach((line, i) => {
					if (i > 0) frag.appendChild(document.createElement("br"));
					if (line) frag.appendChild(document.createTextNode(line));
				});
			};

			items.forEach((item) => {
				if (item.startIndex > lastIdx) {
					appendPlain(text.slice(lastIdx, item.startIndex));
				}

				const badge = createBadgeElement(item, () => {
					badge.remove();
					if (editorRef.current) {
						const nextText = extractTextFromDOM(editorRef.current);
						lastSentValueRef.current = nextText;
						setIsEmpty(!nextText);
						onChange(nextText);
					}
				});
				frag.appendChild(badge);
				lastIdx = item.endIndex;
			});

			if (lastIdx < text.length) {
				appendPlain(text.slice(lastIdx));
			}

			return frag;
		},
		[createBadgeElement, onChange],
	);

	// 외부 value 변경 시 내부 DOM 동기화
	useEffect(() => {
		if (editorRef.current) {
			const currentDOMText = extractTextFromDOM(editorRef.current);
			if (value !== currentDOMText) {
				editorRef.current.innerHTML = "";
				editorRef.current.appendChild(renderFragment(value));
				lastSentValueRef.current = value;
				setIsEmpty(!value);
			}
		}
	}, [value, renderFragment]);

	// 사용자가 타이핑했을 때 텍스트 추출 및 부모 전달
	const handleInput = useCallback(() => {
		if (!editorRef.current) return;
		const nextText = extractTextFromDOM(editorRef.current);
		lastSentValueRef.current = nextText;
		setIsEmpty(!nextText);
		onChange(nextText);
	}, [onChange]);

	// 스페이스바, 엔터, 쉼표 또는 블러 시 입력된 타임스탬프를 인라인 뱃지로 즉시 변환
	const tokenizeCurrentText = useCallback(() => {
		if (!editorRef.current || isComposingRef.current) return;

		const currentText = extractTextFromDOM(editorRef.current);
		const items = parseTimestampsAndRanges(currentText);

		// 이미 뱃지로 변환된 개수와 파싱된 개수가 같다면 재렌더링 생략
		const existingBadges = editorRef.current.querySelectorAll("span[data-raw]");
		if (items.length === existingBadges.length) return;

		// 텍스트 재구성
		const selection = window.getSelection();
		const frag = renderFragment(currentText);
		editorRef.current.innerHTML = "";
		editorRef.current.appendChild(frag);

		// 커서를 맨 끝 또는 이전 위치 근처로 복원
		if (selection && editorRef.current.lastChild) {
			const range = document.createRange();
			range.selectNodeContents(editorRef.current);
			range.collapse(false);
			selection.removeAllRanges();
			selection.addRange(range);
		}
	}, [renderFragment]);

	// 키보드 이벤트 처리 (백스페이스 한 번에 뱃지 삭제 지원)
	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLDivElement>) => {
			if (e.key === "Backspace") {
				const selection = window.getSelection();
				if (!selection || !selection.isCollapsed || selection.rangeCount === 0) return;

				const range = selection.getRangeAt(0);
				let targetBadge: HTMLElement | null = null;

				// 커서 바로 앞의 노드가 뱃지인지 확인
				if (range.startOffset === 0) {
					let prev = range.startContainer.previousSibling;
					if (!prev && range.startContainer.parentElement !== editorRef.current) {
						prev = range.startContainer.parentElement?.previousSibling || null;
					}
					if (prev instanceof HTMLElement && prev.dataset.raw) {
						targetBadge = prev;
					}
				} else if (range.startContainer.childNodes.length > 0) {
					const nodeBefore = range.startContainer.childNodes[range.startOffset - 1];
					if (nodeBefore instanceof HTMLElement && nodeBefore.dataset.raw) {
						targetBadge = nodeBefore;
					}
				}

				if (targetBadge) {
					e.preventDefault();
					targetBadge.remove();
					handleInput();
					return;
				}
			}

			// 스페이스바, 엔터 등을 눌렀을 때 타임스탬프 패턴 완성 시 뱃지 변환 시도
			if (e.key === " " || e.key === "Enter" || e.key === "," || e.key === "~") {
				setTimeout(() => {
					tokenizeCurrentText();
				}, 10);
			}
		},
		[handleInput, tokenizeCurrentText],
	);

	return (
		<div
			className={cn(
				"relative flex h-[76px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-2xs transition-colors overflow-hidden resize-none",
				"focus-within:border-primary focus-within:ring-1 focus-within:ring-ring",
				disabled && "cursor-not-allowed opacity-50",
				className,
			)}
			onClick={() => {
				if (editorRef.current && document.activeElement !== editorRef.current) {
					editorRef.current.focus();
				}
			}}
		>
			{/* 빈 텍스트일 때 플레이스홀더 */}
			{isEmpty && (
				<div className="absolute top-2 left-3 right-3 text-muted-foreground pointer-events-none select-none text-xs leading-relaxed line-clamp-2">
					{placeholder}
				</div>
			)}

			{/* contentEditable 입력창 */}
			<div
				ref={editorRef}
				contentEditable={!disabled}
				suppressContentEditableWarning
				onInput={handleInput}
				onKeyDown={handleKeyDown}
				onBlur={() => {
					tokenizeCurrentText();
					handleInput();
				}}
				onCompositionStart={() => {
					isComposingRef.current = true;
				}}
				onCompositionEnd={() => {
					isComposingRef.current = false;
					handleInput();
				}}
				className="w-full h-full overflow-y-auto outline-none text-xs leading-relaxed whitespace-pre-wrap break-words text-foreground font-normal resize-none [scrollbar-width:thin]"
				role="textbox"
				aria-multiline="true"
			/>
		</div>
	);
}
