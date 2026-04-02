"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createGig } from "@/app/gigs/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { PerformerSelector, type Performer } from "@/components/performer-selector";

export function GigCreateForm() {
  const router = useRouter();
  const supabase = createClient();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // 참여자 관련 상태
  const [performers, setPerformers] = useState<Performer[]>([]);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Performer[]>([]);

  // 1. 유저 검색 로직 (Debounce 적용)
  useEffect(() => {
    const fetchUsers = async () => {
      if (search.trim().length < 2) {
        setSearchResults([]);
        return;
      }

      const { data } = await supabase
        .from("users")
        .select("id, name, email")
        .or(`name.ilike.%${search}%,email.ilike.%${search}%`)
        .limit(5);

      if (data) {
        setSearchResults(data.map(u => ({
          id: u.id,
          name: u.name,
          email: u.email
        })));
      }
    };

    const timer = setTimeout(fetchUsers, 300);
    return () => clearTimeout(timer);
  }, [search, supabase]);

  // 2. 명단 관리 핸들러
  const addPerformer = (p: Performer) => {
    if (!performers.find((item) => item.email === p.email)) {
      setPerformers([...performers, p]);
    }
    setSearch("");
    setSearchResults([]);
  };

  const removePerformer = (email: string) => {
    setPerformers(performers.filter((p) => p.email !== email));
  };

  const handleBulkPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pastedData = e.clipboardData.getData("text");
    const lines = pastedData.split(/\r?\n|\t/).filter(line => line.trim() !== "");

    const newPerformers = lines.map(line => ({
      name: line.trim(),
      email: `temp-${Math.random().toString(36).substring(2, 9)}`
    }));

    setPerformers(prev => [...prev, ...newPerformers]);
    // 붙여넣기 후 텍스트 영역 초기화는 PerformerSelector 내부에서 처리하거나 
    // e.currentTarget.value = "" 등으로 처리 가능합니다.
  };

  async function handleSubmit(formData: FormData) {
    setMessage(null);
    setPending(true);

    // [수정 포인트] performers 배열을 JSON 문자열로 변환하여 formData에 추가
    formData.append("performers", JSON.stringify(performers));

    try {
      const result = await createGig(formData);
      if (result.ok) {
        router.push("/gigs");
        router.refresh();
        return;
      }
      setMessage(result.error);
    } catch (err) {
      setMessage("공연 등록 중 오류가 발생했습니다.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="space-y-8 max-w-xl pb-10 text-zinc-200" action={handleSubmit}>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="title" className="text-zinc-400">공연 제목</Label>
          <Input
            id="title"
            name="title"
            placeholder="공연 제목을 입력하세요"
            required
            autoComplete="off"
            className="bg-zinc-950 border-zinc-800 placeholder:text-zinc-700 focus:ring-zinc-700"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="perform_date" className="text-zinc-400">공연 일자</Label>
            <Input
              id="perform_date"
              name="perform_date"
              type="date"
              required
              className="bg-zinc-950 border-zinc-800 [color-scheme:dark]" // 캘린더 아이콘 다크 대응
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="meeting_date" className="text-zinc-400">선곡회의 일자</Label>
            <Input
              id="meeting_date"
              name="meeting_date"
              type="date"
              className="bg-zinc-950 border-zinc-800 [color-scheme:dark]"
            />
          </div>
        </div>
      </div>

      <PerformerSelector
        search={search}
        setSearch={setSearch}
        results={searchResults}
        selected={performers}
        onAdd={addPerformer}
        onRemove={removePerformer}
        onPaste={handleBulkPaste}
      />

      {message && (
        <div className="p-3 bg-red-950/30 border border-red-900/50 rounded-md">
          <p className="text-sm text-red-400 font-medium">{message}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-4">
        <Button
          type="submit"
          disabled={pending}
          className="flex-1 bg-zinc-100 text-zinc-950 hover:bg-zinc-300"
        >
          {pending ? "등록 중…" : "공연 등록하기"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => router.push("/gigs")}
          className="border-zinc-800 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
        >
          취소
        </Button>
      </div>
    </form>
  );
}