// app/editor/layout.tsx
import { Geist, Geist_Mono } from "next/font/google";
import "../globals.css";
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { redirect } from "next/navigation";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default async function EditorLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // const supabase = createServerComponentClient({ cookies });
  // const {
  //   data: { session },
  // } = await supabase.auth.getSession();

  return (
    <div className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      {/* {session ? children : <div className="flex h-screen w-full items-center justify-center flex-col">Access Denied: Please log in <button onClick={redirect('/login')}>Log in</button></div>} */}
      {children}
    </div>
  );
}