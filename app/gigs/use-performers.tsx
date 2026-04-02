// hooks/use-performers.ts
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

export interface Performer {
  id?: string;
  name: string;
  email?: string;
}

export function usePerformers() {
  const supabase = createClient();
  const [performers, setPerformers] = useState<Performer[]>([]);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Performer[]>([]);

  useEffect(() => {
    if (search.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const fetchUsers = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .or(`full_name.ilike.%${search}%,email.ilike.%${search}%`)
        .limit(5);

      if (data) {
        setSearchResults(data.map(u => ({ id: u.id, name: u.full_name, email: u.email })));
      }
    };
    const timer = setTimeout(fetchUsers, 300);
    return () => clearTimeout(timer);
  }, [search, supabase]);

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

  const bulkAdd = (names: string[]) => {
    const newItems = names.map(name => ({
      name: name.trim(),
      email: `temp-${Math.random().toString(36).substr(2, 9)}`
    }));
    setPerformers(prev => [...prev, ...newItems]);
  };

  return { performers, search, setSearch, searchResults, addPerformer, removePerformer, bulkAdd };
}