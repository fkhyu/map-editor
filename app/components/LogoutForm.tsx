"use client";

import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export default function LogoutForm() {
  const router = useRouter();
  const supabase = createClientComponentClient();

  async function handleLogout(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <form onSubmit={handleLogout} className="inline">
      <button
        type="submit"
        className="ml-4 text-red-500 hover:underline bg-transparent border-none p-0 cursor-pointer"
      >
        Logout
      </button>
    </form>
  );
}