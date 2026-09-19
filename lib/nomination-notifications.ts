import { createClient } from "@/lib/supabase/server";

// 알림 지연 버퍼 시간 (기본 15분)
const NOTIFICATION_DELAY_MINUTES = 15;

/**
 * 선곡회의 새 후보곡 등록 시 알림 대기열(Queue)에 추가 및 지연 예약
 * - 이미 pending 상태인 대기열이 있으면 song_ids에 추가하고 예약 시각을 연장(디바운스)합니다.
 * - 없으면 새 큐 레코드를 생성합니다.
 */
export async function enqueueSongNotification(
	gigId: number,
	songId: number,
	triggeredByUserId: string,
): Promise<void> {
	try {
		const supabase = await createClient();
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
			return;
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
			}
		} else {
			// 신규 큐 레코드 생성
			const { error: insertErr } = await supabase
				.from("gig_notification_queue")
				.insert({
					gig_id: gigId,
					song_ids: [songId],
					scheduled_at: scheduledAt,
					triggered_by: triggeredByUserId,
					status: "pending",
				});

			if (insertErr) {
				console.error("알림 대기열 등록 오류:", insertErr);
			}
		}
	} catch (err) {
		console.error("enqueueSongNotification 예외:", err);
	}
}

export const enqueueNominationNotification = enqueueSongNotification;

/**
 * 만료된 알림 대기열(`scheduled_at <= now()`)을 일괄 처리하여 참여자들에게 알림 발송
 */
export async function processNotificationQueue(): Promise<{
	processedCount: number;
	totalNotificationsSent: number;
}> {
	let processedCount = 0;
	let totalNotificationsSent = 0;

	try {
		const supabase = await createClient();
		const nowIso = new Date().toISOString();

		// 1. 발송 대기 중인 만료 큐 조회
		const { data: pendingQueues, error: queueErr } = await supabase
			.from("gig_notification_queue")
			.select("id, gig_id, song_ids, triggered_by")
			.eq("status", "pending")
			.lte("scheduled_at", nowIso)
			.limit(20);

		if (queueErr || !pendingQueues || pendingQueues.length === 0) {
			return { processedCount: 0, totalNotificationsSent: 0 };
		}

		for (const queue of pendingQueues) {
			// 처리 중 상태로 먼저 변경하여 중복 발송 방지
			await supabase
				.from("gig_notification_queue")
				.update({ status: "processing" })
				.eq("id", queue.id);

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
					// 푸시 발송 API 호출
					const origin = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
					const pushRes = await fetch(`${origin}/api/push/send`, {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							userIds: recipientUserIds,
							title: `[${gigTitle}] 선곡회의 새 후보곡 등록`,
							body: `${songTitlesText}이(가) 등록되었습니다. 참여 가능한 세션을 응답해주세요!`,
							url: `/gigs/${queue.gig_id}/nominations`,
							tag: `gig-nomination-${queue.gig_id}`,
						}),
					});

					if (pushRes.ok) {
						const pushResult = await pushRes.json();
						totalNotificationsSent += pushResult.sentCount || recipientUserIds.length;
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
