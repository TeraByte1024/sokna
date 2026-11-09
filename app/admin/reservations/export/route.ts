import writeExcelFile from "write-excel-file/node";
import { getIsAdmin } from "@/lib/auth-admin";
import { formatPhoneNumber, ticketStatus, type TicketReservation, type TicketStatusTarget } from "@/lib/ticket-reservations";
import { ticketClient } from "@/lib/ticket-server";

export const runtime = "nodejs";

const privateHeaders = { "Cache-Control": "private, no-store" };
const batchSize = 500;
const koreaOffsetMs = 9 * 60 * 60 * 1000;

type ExportRow = TicketStatusTarget & Pick<
  TicketReservation, "id" | "code" | "buyer_name" | "depositor" | "phone" | "total_amount" | "created_at"
>;

function downloadError(error: string, status: number) {
  return Response.json({ error }, { status, headers: privateHeaders });
}

function writeReservationWorkbook(rows: ExportRow[]) {
  const headings = ["예매번호", "예매자명", "입금자명", "연락처", "예매 매수", "총액 (원)", "입장 인원", "예매 현황", "예매 신청 일시 (KST)"];
  const header = headings.map((value) => ({ value, fontWeight: "bold" as const, backgroundColor: "#e7edf5" }));
  const values = rows.map((row) => [
    { value: row.code, type: String, format: "@" },
    { value: row.buyer_name, type: String },
    { value: row.depositor, type: String },
    { value: formatPhoneNumber(row.phone), type: String, format: "@" },
    row.quantity,
    { value: row.total_amount, type: Number, format: "#,##0" },
    row.admitted_quantity,
    ticketStatus(row),
    // Excel stores wall-clock dates, so encode the Korean local time.
    { value: new Date(Date.parse(row.created_at) + koreaOffsetMs), type: Date, format: "yyyy-mm-dd hh:mm" },
  ]);
  return writeExcelFile([header, ...values], {
    sheet: "예매자 목록",
    columns: [20, 20, 20, 21, 13, 16, 13, 20, 28].map((width) => ({ width })),
    stickyRowsCount: 1,
  }).toBuffer();
}

export async function GET(request: Request) {
  if (!(await getIsAdmin())) return downloadError("관리자만 다운로드할 수 있습니다.", 403);

  const rawGigId = new URL(request.url).searchParams.get("gigId") ?? "";
  const gigId = Number(rawGigId);
  if (!/^\d+$/.test(rawGigId) || !Number.isSafeInteger(gigId) || gigId < 1) {
    return downloadError("다운로드할 공연을 선택해 주세요.", 400);
  }

  try {
    const client = await ticketClient();
    const { data: gig, error: gigError } = await client.from("gigs").select("title").eq("id", gigId).maybeSingle();
    if (gigError) return downloadError("공연 정보를 불러오지 못했습니다.", 500);
    if (!gig) return downloadError("공연을 찾을 수 없습니다.", 404);

    const rows: ExportRow[] = [];
    let cursor: ExportRow | undefined;
    do {
      const query = client.from("ticket_reservations")
        .select("id, code, buyer_name, depositor, phone, quantity, total_amount, admitted_quantity, status, refund_status, cancellation_requested_at, payment_reported_at, paid_amount, created_at")
        .eq("gig_id", gigId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(batchSize);
      const { data, error } = await (cursor
        ? query.or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`)
        : query);
      if (error || !data) return downloadError("예매자 목록을 불러오지 못했습니다.", 500);
      rows.push(...data);
      cursor = data.length === batchSize ? data.at(-1) : undefined;
    } while (cursor);

    const file = await writeReservationWorkbook(rows);
    const title = (gig.title ?? "").replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
    const filename = `${Array.from(title || "공연").slice(0, 80).join("")} - 예매자 목록.xlsx`;
    const encodedName = encodeURIComponent(filename).replace(/['()*]/g, (char) =>
      `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    return new Response(new Uint8Array(file), {
      headers: {
        ...privateHeaders,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="reservations-${gigId}.xlsx"; filename*=UTF-8''${encodedName}`,
      },
    });
  } catch {
    return downloadError("엑셀 파일을 만들지 못했습니다. 다시 시도해 주세요.", 500);
  }
}
