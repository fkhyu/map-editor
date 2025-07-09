// app/buildings/layout.tsx
import { Geist, Geist_Mono } from "next/font/google";
import "../globals.css";
import { supabase } from '@/lib/supabaseClient';
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
  // const { data: { session } } = await supabase.auth.getSession();

  // if (!session) {
  //   redirect('/login');
  // }

  return (
    <div className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      {children}
    </div>
  );
}