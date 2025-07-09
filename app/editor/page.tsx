'use client';

import { useRouter } from 'next/dist/client/components/navigation';
import Editor from './components/Editor';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useState, useEffect } from 'react';
import { supabase } from "@/lib/supabaseClient";


export default function EditorPage() {  
  const [session, setSession] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session }, error: sessionError }) => {
      if (!session || sessionError) {
        router.push('/login');
        return;
      }
      
      setSession(session);
      
      // Fetch user data
      supabase
        .from('users')
        .select('*')
        .eq('id', session.user.id)
        .single()
        .then(({ data, error }) => {
          if (error) {
            console.error("Error fetching user data:", error);
            setUser(session.user);
          } else {
            setUser(data || session.user);
            console.log("User data fetched:", data);
          }
          setLoading(false);
        });
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        router.push('/login');
      } else {
        setSession(session);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex h-screen w-full items-center justify-center flex-col text-red-400">
        Access Denied: Please log in
        <form action="/login" method="get">
          <button type="submit" className="cursor-pointer px-4 py-2 bg-blue-500/10 mt-4 rounded-lg text-blue-400">Log in</button>
        </form>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="flex flex-col h-screen bg-gray-100 dark:bg-gray-700">
        <Editor />
      </div>
    </ErrorBoundary>
  );
}