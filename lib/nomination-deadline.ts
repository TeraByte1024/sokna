/** A missing deadline leaves nominations open. */
export function getNominationDeadline(nominationDeadline: string | null | undefined): number | null {
	if (!nominationDeadline) return null;
	const timestamp = Date.parse(nominationDeadline);
	return Number.isFinite(timestamp) ? timestamp : null;
}

export function isNominationClosed(
	nominationDeadline: string | null | undefined,
	now = Date.now(),
): boolean {
	if (!nominationDeadline) return false;
	const deadline = getNominationDeadline(nominationDeadline);
	return deadline === null || now >= deadline;
}
