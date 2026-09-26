const DAY_IN_MS = 24 * 60 * 60 * 1000;

/** 기존 meeting_date 기준(날짜만 있으면 UTC 자정)에서 24시간 전 마감. */
export function getNominationDeadline(meetingDate: string | null | undefined): number | null {
	if (!meetingDate) return null;
	const meetingTimestamp = Date.parse(meetingDate);
	return Number.isFinite(meetingTimestamp) ? meetingTimestamp - DAY_IN_MS : null;
}

export function isNominationClosed(
	meetingDate: string | null | undefined,
	now = Date.now(),
): boolean {
	const deadline = getNominationDeadline(meetingDate);
	return deadline === null || now >= deadline;
}
