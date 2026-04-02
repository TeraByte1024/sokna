"use client";

import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X, UserPlus, ClipboardType } from "lucide-react";

export interface Performer {
  id?: string;
  name: string;
  email?: string;
}

interface Props {
  search: string;
  setSearch: (v: string) => void;
  results: Performer[];
  selected: Performer[];
  onAdd: (p: Performer) => void;
  onRemove: (email: string) => void;
  onPaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
}

export function PerformerSelector({ search, setSearch, results, selected, onAdd, onRemove, onPaste }: Props) {
  return (
    // bg-slate-50 대신 배경을 제거하고 border만 유지하거나, 더 어두운 bg-secondary/30 사용
    <div className="space-y-4 border border-zinc-800 p-4 rounded-lg bg-zinc-900/50 shadow-sm">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold text-zinc-300">공연 참여자 설정</Label>
        <span className="text-xs text-zinc-500">총 {selected.length}명</span>
      </div>

      <div className="relative">
        <div className="relative">
          <Input
            placeholder="이름이나 이메일로 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-10 bg-zinc-950 border-zinc-800 focus:ring-zinc-700"
          />
          <UserPlus className="absolute right-3 top-2.5 h-4 w-4 text-zinc-500" />
        </div>

        {results.length > 0 && (
          <ul className="absolute z-30 w-full bg-zinc-900 border border-zinc-800 rounded-md shadow-2xl mt-1 max-h-60 overflow-auto">
            {results.map((u) => (
              <li
                key={u.id || u.email}
                className="p-3 hover:bg-zinc-800 cursor-pointer flex justify-between items-center transition-colors border-b border-zinc-800 last:border-0"
                onClick={() => onAdd(u)}
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-zinc-200">{u.name}</span>
                  <span className="text-xs text-zinc-500">{u.email}</span>
                </div>
                <button className="text-xs font-bold text-zinc-400 hover:text-white bg-zinc-800 px-2 py-1 rounded">
                  추가
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs text-zinc-500 ml-1">
          <ClipboardType className="h-3 w-3" />
          <span>엑셀 명단을 아래 칸에 붙여넣으세요</span>
        </div>
        <textarea
          className="w-full h-20 p-2 text-sm border border-zinc-800 rounded-md bg-zinc-950 text-zinc-200 focus:ring-1 focus:ring-zinc-700 outline-none transition-all placeholder:text-zinc-700"
          placeholder="홍길동&#10;임꺽정"
          onPaste={onPaste}
        />
      </div>

      <div className="flex flex-wrap gap-2 min-h-[32px] p-1">
        {selected.length > 0 ? (
          selected.map((p) => (
            <div
              key={p.email}
              className="group flex items-center gap-1.5 bg-zinc-800 text-zinc-200 px-3 py-1.5 rounded-full text-sm border border-zinc-700 shadow-sm hover:border-zinc-500 transition-all"
            >
              <span className="font-medium">{p.name}</span>
              <button
                type="button"
                onClick={() => onRemove(p.email!)}
                className="text-zinc-500 hover:text-zinc-200 rounded-full p-0.5 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))
        ) : (
          <p className="text-sm text-zinc-600 italic py-2 w-full text-center">
            등록된 참여자가 없습니다.
          </p>
        )}
      </div>
    </div>
  );
}