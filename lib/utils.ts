import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export const hasEnvVars = Boolean(
	process.env.NEXT_PUBLIC_SUPABASE_URL &&
	process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
);

export function getDDay(dateStr: string | null) {
	if (!dateStr) return null;

	const dateOnly = dateStr.includes("T") ? dateStr.split("T")[0] : dateStr.split(" ")[0];
	const target = new Date(dateOnly + "T00:00:00");
	const today = new Date();
	today.setHours(0, 0, 0, 0);

	const diffTime = target.getTime() - today.getTime();
	const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

	if (diffDays === 0) return "D-Day";
	if (diffDays > 0) return `D-${diffDays}`;
	return null;
}

/**
 * 날짜 문자열에서 한국 시간(KST) 기준 YYYY-MM-DD 및 HH:mm을 추출합니다.
 */
export function parseDateTime(str: string | null | undefined): { date: string; time: string } {
	if (!str) return { date: "", time: "" };
	const trimmed = str.trim();
	if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
		return { date: trimmed, time: "" };
	}
	const d = new Date(trimmed);
	if (isNaN(d.getTime())) return { date: "", time: "" };

	try {
		const formatter = new Intl.DateTimeFormat("en-CA", {
			timeZone: "Asia/Seoul",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			hour12: false,
		});
		const parts = formatter.formatToParts(d);
		const get = (type: string) => parts.find((p) => p.type === type)?.value || "";
		const date = `${get("year")}-${get("month")}-${get("day")}`;
		let hour = get("hour");
		if (hour === "24") hour = "00";
		const time = `${hour}:${get("minute")}`;
		return { date, time: time === "00:00" && !trimmed.includes(":") ? "" : time };
	} catch {
		return { date: trimmed.split("T")[0] || "", time: "" };
	}
}

/**
 * 날짜(YYYY-MM-DD)와 시각(HH:mm)을 한국 시간대 ISO 문자열(YYYY-MM-DDTHH:mm:00+09:00)로 결합합니다.
 */
export function combineDateTime(date: string, time: string): string | null {
	const trimmedDate = date.trim();
	if (!trimmedDate) return null;
	const trimmedTime = time.trim();
	if (!trimmedTime) {
		return trimmedDate;
	}
	return `${trimmedDate}T${trimmedTime}:00+09:00`;
}

/**
 * 일시 문자열(및 선택적 시각 문자열)을 한국어 형식으로 포맷팅합니다.
 * 시각이 포함되어 있으면 "2026년 9월 5일 (토) 18:30", 없으면 "2026년 9월 5일 (토)" 형식으로 반환합니다.
 */
export function formatKoreanDateTime(
	dateStr: string | null | undefined,
	timeStr?: string | null | undefined
): string {
	if (!dateStr) return "일정 미정";
	try {
		const { date, time: parsedTime } = parseDateTime(dateStr);
		if (!date) return dateStr;
		const [year, month, day] = date.split("-").map(Number);
		const d = new Date(year, month - 1, day);
		const days = ["일", "월", "화", "수", "목", "금", "토"];
		const dayOfWeek = days[d.getDay()];

		const dateFormatted = `${year}년 ${month}월 ${day}일 (${dayOfWeek})`;
		const effectiveTime = timeStr?.trim() || parsedTime;
		if (effectiveTime) {
			return `${dateFormatted} ${effectiveTime}`;
		}
		return dateFormatted;
	} catch {
		return dateStr;
	}
}

/**
 * 일시 문자열에서 날짜만 한국어 형식으로 포맷팅합니다.
 * 예: "2026년 9월 5일 (토)"
 */
export function formatKoreanDate(dateStr: string | null | undefined): string {
	if (!dateStr) return "일정 미정";
	try {
		const { date } = parseDateTime(dateStr);
		if (!date) return dateStr;
		const [year, month, day] = date.split("-").map(Number);
		const d = new Date(year, month - 1, day);
		const days = ["일", "월", "화", "수", "목", "금", "토"];
		const dayOfWeek = days[d.getDay()];
		return `${year}년 ${month}월 ${day}일 (${dayOfWeek})`;
	} catch {
		return dateStr;
	}
}

