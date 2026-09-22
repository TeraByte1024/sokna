import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendPushToUsers } from "@/lib/push-notifications";

// 즉시 알림 테스트 기간에는 디바운스 지연을 사용하지 않습니다.
const NOTIFICATION_DELAY_MINUTES = 0;

/**
 * 선곡회의 새 후보곡 등록 시 즉시 처리할 알림 대기열(Queue)에 추가합니다.
 * - 이미 pending 상태인 대기열이 있으면 song_ids에 추가하고 즉시 처리 가능하게 갱신합니다.
 * - 없으면 새 큐 레코드를 생성합니다.
 */
export async function enqueueSongNotification(
	gigId: number,
	songId: number,
	triggeredByUserId: string,
): Promise<number | null> {
	try {
		const supabase = createServiceClient();
		const now = new Date();
		const scheduledAt = new Date(now.getTime() + NOTIFICATION_DELAY_MINUTES * 60 * 1000).toISOString();

		// 1. 기존 대기 중인 큐 확인
		const { data: existingQueue, error: fetchErr } = await supabase
			.from("gig_notification_queue")
			.select("id, song_ids")
			.eq("gig_id", gigId)
			.eq("status", "pending")
			.order("created_at", { ascending: false })
			.limit(1)
			.maybeSingle();

		if (fetchErr) {
			console.error("알림 대기열 조회 오류:", fetchErr);
			return null;
		}

		if (existingQueue) {
			// 기존 큐에 song_id 추가 (중복 방지)
			const currentSongIds: number[] = Array.isArray(existingQueue.song_ids) ? existingQueue.song_ids : [];
			const updatedSongIds = Array.from(new Set([...currentSongIds, songId]));

			const { error: updateErr } = await supabase
				.from("gig_notification_queue")
				.update({
					song_ids: updatedSongIds,
					scheduled_at: scheduledAt, // 디바운스: 마지막 등록 시점 기준 15분 후로 연장
					triggered_by: triggeredByUserId,
				})
				.eq("id", existingQueue.id);

			if (updateErr) {
				console.error("알림 대기열 갱신 오류:", updateErr);
				return null;
			}

			return existingQueue.id;
		} else {
			// 신규 큐 레코드 생성
			const { data: insertedQueue, error: insertErr } = await supabase
				.from("gig_notification_queue")
				.insert({
					gig_id: gigId,
					song_ids: [songId],
					scheduled_at: scheduledAt,
					triggered_by: triggeredByUserId,
					status: "pending",
				})
				.select("id")
				.single();

			if (insertErr) {
				console.error("알림 대기열 등록 오류:", insertErr);
				return null;
			}

			return insertedQueue.id;
		}
	} catch (err) {
		console.error("enqueueSongNotification 예외:", err);
		return null;
	}
}

export const enqueueNominationNotification = enqueueSongNotification;

/**
 * 처리 가능한 알림 대기열(`scheduled_at <= now()`)을 참여자들에게 발송합니다.
 * queueIds를 전달하면 새 후보곡 등록 요청이 만든 정확한 큐만 처리합니다.
 */
export async function processNotificationQueue(queueIds?: number[]): Promise<{
	processedCount: number;
	totalNotificationsSent: number;
}> {
	let processedCount = 0;
	let totalNotificationsSent = 0;

	try {
		const supabase = createServiceClient();
		const nowIso = new Date().toISOString();

		// 1. 발송 대기 중인 만료 큐 조회
		let pendingQuery = supabase
			.from("gig_notification_queue")
			.select("id, gig_id, song_ids, triggered_by")
			.eq("status", "pending")
			.lte("scheduled_at", nowIso);

		if (queueIds && queueIds.length > 0) {
			pendingQuery = pendingQuery.in("id", queueIds);
		}

		const { data: pendingQueues, error: queueErr } = await pendingQuery.limit(20);

		if (queueErr) {
			console.error("알림 대기열 처리 조회 오류:", queueErr);
			return { processedCount: 0, totalNotificationsSent: 0 };
		}

		if (!pendingQueues || pendingQueues.length === 0) {
			return { processedCount: 0, totalNotificationsSent: 0 };
		}

		for (const queue of pendingQueues) {
			// 처리 중 상태로 먼저 변경하여 중복 발송 방지
			const { data: claimedQueue } = await supabase
				.from("gig_notification_queue")
				.update({ status: "processing" })
				.eq("id", queue.id)
				.eq("status", "pending")
				.select("id")
				.maybeSingle();

			if (!claimedQueue) continue;

			try {
				// 공연 정보 조회
				const { data: gig } = await supabase
					.from("gigs")
					.select("id, title")
					.eq("id", queue.gig_id)
					.maybeSingle();

				const gigTitle = gig?.title || "공연";

				// 등록된 곡 목록 조회
				const songIds: number[] = Array.isArray(queue.song_ids) ? queue.song_ids : [];
				let songTitlesText = "새로운 후보곡";

				if (songIds.length > 0) {
					const { data: songs } = await supabase
						.from("nominations")
						.select("title")
						.in("id", songIds);

					if (songs && songs.length > 0) {
						const titles = songs.map((s) => `'${s.title}'`);
						if (titles.length === 1) {
							songTitlesText = titles[0];
						} else if (titles.length <= 3) {
							songTitlesText = titles.join(", ");
						} else {
							songTitlesText = `${titles.slice(0, 2).join(", ")} 외 ${titles.length - 2}곡`;
						}
					}
				}

				// 공연 참여 세션원(Performers) 조회 (등록자 본인은 제외)
				const { data: performers } = await supabase
					.from("performers")
					.select("user_id")
					.eq("gig_id", queue.gig_id)
					.not("user_id", "is", null);

				const recipientUserIds = Array.from(
					new Set(
						(performers || [])
							.map((p) => p.user_id)
							.filter((id): id is string => Boolean(id) && id !== queue.triggered_by),
					),
				);

				if (recipientUserIds.length > 0) {
					const title = `[${gigTitle}] 선곡회의 새 후보곡 등록`;
					const body = `${songTitlesText}이(가) 등록되었습니다. 참여 가능한 세션을 응답해주세요!`;
					const link = `/gigs/${queue.gig_id}/nominations`;

					// 서버에서 마케팅 동의자를 먼저 제한합니다. sendPushToUsers도 다시 검증합니다.
					const { data: eligibleUsers, error: eligibleError } = await supabase
						.from("users")
						.select("id")
						.in("id", recipientUserIds)
						.eq("marketing_opt_in", true);
					if (eligibleError) throw eligibleError;

					const eligibleIds = (eligibleUsers ?? []).map((user) => user.id);
					if (eligibleIds.length > 0) {
						const { data: notificationRows, error: notificationError } = await supabase
							.from("notifications")
							.insert(
								eligibleIds.map((userId) => ({
									user_id: userId,
									title,
									body,
									link,
									push_eligible: true,
									push_status: "processing",
									push_attempted_at: new Date().toISOString(),
								})),
							)
							.select("id");
						if (notificationError) throw notificationError;

						try {
							const result = await sendPushToUsers(eligibleIds, {
								title,
								body,
								url: link,
								tag: `gig-nomination-${queue.gig_id}`,
							});
							totalNotificationsSent += result.sentCount;

							if (notificationRows && notificationRows.length > 0) {
								await supabase
									.from("notifications")
									.update({
										push_status: result.sentCount > 0 ? "sent" : "skipped",
										push_sent_at:
											result.sentCount > 0 ? new Date().toISOString() : null,
										push_error:
											result.sentCount > 0 ? null : "no_active_token",
									})
									.in("id", notificationRows.map((row) => row.id));
							}
						} catch (pushError) {
							if (notificationRows && notificationRows.length > 0) {
								await supabase
									.from("notifications")
									.update({
										push_status: "failed",
										push_error:
											pushError instanceof Error
												? pushError.message.slice(0, 500)
												: "unknown_error",
									})
									.in("id", notificationRows.map((row) => row.id));
							}
							throw pushError;
						}
					}
				}

				// 발송 완료 상태로 갱신
				await supabase
					.from("gig_notification_queue")
					.update({
						status: "sent",
						sent_at: new Date().toISOString(),
					})
					.eq("id", queue.id);

				processedCount++;
			} catch (itemErr) {
				console.error(`큐 #${queue.id} 처리 중 오류:`, itemErr);
				// 실패 시 다시 pending으로 복원하여 재시도 가능하게 함
				await supabase
					.from("gig_notification_queue")
					.update({ status: "pending" })
					.eq("id", queue.id);
			}
		}

		return { processedCount, totalNotificationsSent };
	} catch (err) {
		console.error("processNotificationQueue 예외:", err);
		return { processedCount, totalNotificationsSent };
	}
}

/**
 * 사용자의 선곡회의 마지막 확인 일시를 기록/갱신
 */
export async function recordLastViewedNomination(
	gigId: number,
	userId: string,
): Promise<{ ok: boolean; timestamp: string }> {
	try {
		const supabase = await createClient();
		const now = new Date().toISOString();

		const { error } = await supabase
			.from("setlist_views")
			.upsert({
				user_id: userId,
				gig_id: gigId,
				last_viewed_at: now,
			});

		if (error) {
			console.error("setlist_views upsert 오류:", error);
			return { ok: false, timestamp: now };
		}

		return { ok: true, timestamp: now };
	} catch (err) {
		console.error("recordLastViewedNomination 예외:", err);
		return { ok: false, timestamp: new Date().toISOString() };
	}
}

export const recordLastViewedSetlist = recordLastViewedNomination;
