import Image from "next/image";
import Sidebar from "./components/Sidebar";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function Home() {
  const supabase = createServerComponentClient({ cookies });
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    redirect("/login");
  }

  return (
    <div className="flex h-screen w-full items-center justify-center flex-col">
      <h1 className="text-3xl font-medium">Welcome, {session.user.email}</h1>
    </div>
  );
}
