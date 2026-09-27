import "server-only";

type PushDeviceAction = "status" | "register" | "refresh" | "detach" | "unregister" | "enable-consent";
type PushDeviceStage = "action" | "session" | "consent-read" | "consent-write" | "own-profile-read"
	| "receipt-read" | "receipt-sign" | "receipt-write" | "receipt-clear" | "receipt-profile-read"
	| "profile-bind" | "profile-insert" | "profile-refresh" | "profile-delete";

// Error messages, details, hints and arbitrary codes can contain tokens or query values.
// Only known provider codes and numeric HTTP statuses may reach the server log.
const SAFE_ERROR_CODES = new Set([
	"08000", "08003", "08006", "22P02", "23502", "23503", "23505", "23514", "42501", "42703", "42P01",
	"53300", "53400", "57014", "57P01", "57P03",
	"PGRST000", "PGRST001", "PGRST002", "PGRST003", "PGRST100", "PGRST102", "PGRST116",
	"PGRST200", "PGRST201", "PGRST202", "PGRST203", "PGRST204", "PGRST205", "PGRST301", "PGRST302", "PGRST303",
	"bad_jwt", "session_not_found", "user_not_found", "refresh_token_not_found", "refresh_token_already_used",
	"unexpected_failure", "request_timeout", "over_request_rate_limit", "no_authorization",
]);

function safeErrorMetadata(error: unknown): { code?: string; status?: number } {
	if (!error || typeof error !== "object") return {};
	const { code, status } = error as { code?: unknown; status?: unknown };
	return {
		...(typeof code === "string" && SAFE_ERROR_CODES.has(code) ? { code } : {}),
		...(typeof status === "number" && Number.isInteger(status) && status >= 400 && status <= 599 ? { status } : {}),
	};
}

export class PushDeviceError extends Error {
	readonly stage: PushDeviceStage;
	readonly code?: string;
	readonly status?: number;

	constructor(stage: PushDeviceStage, error?: unknown) {
		super("Push device operation failed.");
		this.stage = stage;
		const metadata = safeErrorMetadata(error);
		this.code = metadata.code;
		this.status = metadata.status;
	}
}

/** Attach a fixed stage to thrown failures without retaining sensitive provider details. */
export async function atPushDeviceStage<T>(stage: PushDeviceStage, operation: () => T | PromiseLike<T>): Promise<T> {
	try {
		return await operation();
	} catch (error) {
		throw error instanceof PushDeviceError ? error : new PushDeviceError(stage, error);
	}
}

export function logPushDeviceError(action: PushDeviceAction, error: unknown, stage: PushDeviceStage = "action") {
	console.error("[push-device] operation failed", {
		action,
		stage: error instanceof PushDeviceError ? error.stage : stage,
		...safeErrorMetadata(error),
	});
}
