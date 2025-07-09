'use client';

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';


// Define user type
interface User {
  id: string;
  name: string | null;
  email: string | null;
  role: 'user' | 'admin';
  country: string | null;
  age: number | null;
}

// const supabase = createClientComponentClient();

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [unsavedChanges, setUnsavedChanges] = useState<Partial<User>[]>([]);
  const [pendingScrollId, setPendingScrollId] = useState<string | null>(null);

  // for session management
  const [session, setSession] = useState<any>(null);
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loadingSession, setLoadingSession] = useState(true);


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
          setLoadingSession(false);
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

  // Fetch users
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const { data, error } = await supabase.from('users').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        setUsers(data || []);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching users:', error);
        setError(error instanceof Error ? error.message : 'An unexpected error occurred');
      }
    };

    fetchUsers();
  }, []);

  // Scroll to pennding scrol Id
  useEffect(() => {
    if (!pendingScrollId) return;
    const element = document.getElementById(pendingScrollId);
    if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setPendingScrollId(null);
        // Highlight all children
        Array.from(element.children).forEach((child) => {
            if (child === element.lastElementChild) return;
            (child as HTMLElement).style.backgroundColor = 'yellow';
            (child as HTMLElement).style.border = '1px solid yellow';
        });
        setTimeout(() => {
            Array.from(element.children).forEach((child) => {
                if (child === element.lastElementChild) return;
                (child as HTMLElement).style.backgroundColor = '';
                (child as HTMLElement).style.border = '1px solid oklch(96.7% 0.003 264.542)';
            });
        }, 500);
    }
  }, [users, pendingScrollId]);

  // Log unsavedChanges for debugging
  useEffect(() => {
    console.log('Updated unsavedChanges:', unsavedChanges);
  }, [unsavedChanges]);

  // Update unsaved changes
  const updateUnsavedChanges = (userId: string, field: keyof User, value: string | number | null) => {
    setUnsavedChanges((prev) => {
      const existingChange = prev.find((change) => change.id === userId);
      if (existingChange) {
        return prev.map((change) =>
          change.id === userId ? { ...change, [field]: value } : change
        );
      } else {
        return [...prev, { id: userId, [field]: value }];
      }
    });
  };

  // Handle save changes
  const handleSaveChanges = async () => {
    try {
        const updates = unsavedChanges.map(async (change) => {
            console.log('new user')
            const { id, ...data } = change;
            const user = users.find((u) => u.id === id);
            if (user && (user as any).isNew) {
                return await supabase.from('users').insert({
                    id,
                    ...data,
                    role: data.role || user.role,
                    created_at: new Date().toISOString(),
                });
            } else {
                return await supabase.from('users').update(data).eq('id', id);
            }
        });

        const results = await Promise.all(updates);
        const errors = results.filter((result) => result.error);
        if (errors.length > 0) {
            console.error('Update errors:', errors);
            throw new Error('Error updating users');
        }

        console.log('Update results:', results);
        setUnsavedChanges([]);
        setEditing(false);

        // Re-fetch users
        const { data, error } = await supabase.from('users').select('*').order('created_at', { ascending: false });
        if (error) {
            console.error('Error re-fetching users:', error);
            setError(error instanceof Error ? error.message : 'An unexpected error occurred');
        } else {
            setUsers(data || []);
        }
    } catch (error) {
        console.error('Error updating users:', error);
        setError(error instanceof Error ? error.message : 'An unexpected error occurred');
    }
  };

  if (loading) {
    return <div className="w-full h-[100vh] flex justify-center items-center">Loading...</div>;
  }

  if (error) {
    return <div className="w-full h-[100vh] flex justify-center items-center text-red-500">Error: {error}</div>;
  }

  if (loadingSession) {
    return <div className="w-full h-[100vh] flex justify-center items-center">Loading session...</div>;
  }

  if (!session) {
    return (
      <div className="flex h-screen w-full items-center justify-center flex-col text-red-400">
        Access Denied: Please log in
        <button onClick={() => router.push('/login')}>Log in</button>
      </div>
    );
  }


  return (
    <div className="w-full h-[100vh] py-5 px-24">
      <div className="w-full py-4 flex flex-row justify-between items-center pb-6 border-b border-gray-200 dark:border-gray-800 mb-12">
        <div className='flex flex-row gap-2'>
          <button
            className='w-10 h-10 flex items-center justify-center bg-gray-500/10 dark:bg-gray-600 text-gray-600 text-2xl rounded-lg'
            onClick={() => {
              window.location.href = '/';
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#000" className='dark:fill-white'><path d="M560-240 320-480l240-240 56 56-184 184 184 184-56 56Z"/></svg>
          </button>
          <button 
            className='w-10 h-10 bg-blue-500/10 dark:bg-blue-500/35 text-blue-600 dark:text-blue-400 text-2xl rounded-lg'
            onClick={() => {
                const uid = crypto.randomUUID();
                setUsers((prev) => [
                    {
                        id: uid,
                        name: '',
                        email: '',
                        role: 'user',
                        country: '',
                        age: null,
                        isNew: true,
                    } as User & { isNew: boolean },
                    ...prev,
                ]);
                setEditing(true);
                setPendingScrollId(uid);
            }}
          >
              +
          </button>
        </div>
        <h1 className="text-4xl font-semibold self-center">Users</h1>
        <div className='flex flex-row gap-8 self-end'>
            <button
                type="button"
                onClick={() => setEditing((prev) => !prev)}
                className={`flex items-center gap-2 px-3 py-1 rounded-lg transition-colors`}
            >
                <span>{editing ? 'Editing: ON' : 'Editing: OFF'}</span>
                <span
                  className={`inline-block w-8 h-4 rounded-full transition-colors duration-200 ${
                    editing ? 'bg-blue-400' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`block w-4 h-4 rounded-full bg-white shadow transform transition-transform duration-200 ${
                      editing ? 'translate-x-4' : ''
                    }`}
                  />
                </span>
            </button>
            {unsavedChanges.length > 0 && (
                <button
                    className="bg-green-100 border border-green-200 px-3 py-1 rounded-lg text-sm font-medium text-green-600 cursor-pointer"
                    onClick={handleSaveChanges}
                >
                    Save changes
                </button>
            )}
        </div>
      </div>
      <div className="w-full overflow-y-auto rounded-lg">
        <div className="w-full">
          <div className="w-full mb-6">
            <div className='w-full flex flex-row justify-between items-center'>
              <div className="block text-start px-6 border border-gray-100 dark:border-blue-900 dark:bg-blue-900 py-2 bg-gray-100 text-gray-800 dark:text-gray-100 w-[20%] rounded-l-lg">ID</div>
              <div className="block text-start px-6 border border-gray-100 dark:border-blue-900 dark:bg-blue-900 py-2 bg-gray-100 text-gray-800 dark:text-gray-100 w-[20%]">Name</div>
              <div className="block text-start px-6 border border-gray-100 dark:border-blue-900 dark:bg-blue-900 py-2 bg-gray-100 text-gray-800 dark:text-gray-100 w-[20%]">Email</div>
              <div className="block text-start px-6 border border-gray-100 dark:border-blue-900 dark:bg-blue-900 py-2 bg-gray-100 text-gray-800 dark:text-gray-100 w-[8%]">Role</div>
              <div className="block text-start px-6 border border-gray-100 dark:border-blue-900 dark:bg-blue-900 py-2 bg-gray-100 text-gray-800 dark:text-gray-100 w-[16%]">Country</div>
              <div className="block text-start px-6 border border-gray-100 dark:border-blue-900 dark:bg-blue-900 py-2 bg-gray-100 text-gray-800 dark:text-gray-100 w-[8%]">Age</div>
              <div className='block text-center px-6 border border-gray-100 dark:border-blue-900 dark:bg-blue-900 py-2 bg-gray-100 text-gray-800 dark:text-gray-100 w-[8%] rounded-r-lg'>Actions</div>
            </div>
          </div>
          <div className="w-full pb-48">
            {users.map((user) => (
              <div key={user.id} id={user.id} className="flex flex-row w-full mb-2 border-gray-200 rounded-lg">
                <div className="w-[20%] rounded-l-lg block px-0 border-gray-100 dark:border-gray-700 font-normal bg-gray-50 dark:bg-gray-800 text-gray-500">
                  <input className="py-3 px-4 w-full outline-0" type="text" disabled value={user.id || ''} />
                </div>
                 <div className={`w-[20%] block px-0 border-gray-100 dark:border-gray-800 font-normal ${editing ? 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300' : 'bg-gray-50 dark:bg-gray-800 text-gray-500'}`}>
                  <input
                    className="py-3 px-4 w-full outline-0"
                    type="text"
                    disabled={!editing}
                    value={user.name || ''}
                    onChange={(e) => {
                      const updatedUsers = users.map((u) => (u.id === user.id ? { ...u, name: e.target.value } : u));
                      setUsers(updatedUsers);
                      updateUnsavedChanges(user.id, 'name', e.target.value);
                    }}
                  />
                </div>
                <div className={`w-[20%] block px-0 border-gray-100 dark:border-gray-800 font-normal ${editing ? 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300' : 'bg-gray-50 dark:bg-gray-800 text-gray-500'}`}>
                  <input
                    className="py-3 px-4 w-full outline-0"
                    type="text"
                    disabled={!editing}
                    value={user.email || ''}
                    onChange={(e) => {
                      const updatedUsers = users.map((u) => (u.id === user.id ? { ...u, email: e.target.value } : u));
                      setUsers(updatedUsers);
                      updateUnsavedChanges(user.id, 'email', e.target.value);
                    }}
                  />
                </div>
                <div className={`w-[8%] block px-0 border-gray-100 dark:border-gray-800 font-normal ${editing ? 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300' : 'bg-gray-50 dark:bg-gray-800 text-gray-500'}`}>
                  <select
                    value={user.role || 'user'}
                    disabled={!editing}
                    className="py-3 px-4 w-full outline-0"
                    onChange={(e) => {
                      const updatedUsers = users.map((u) => (u.id === user.id ? { ...u, role: e.target.value as 'user' | 'admin' } : u));
                      setUsers(updatedUsers);
                      updateUnsavedChanges(user.id, 'role', e.target.value);
                    }}
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div className={`w-[16%] block px-0 border-gray-100 dark:border-gray-800 font-normal ${editing ? 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300' : 'bg-gray-50 dark:bg-gray-800 text-gray-500'}`}>
                  <input
                    className="py-3 px-4 w-full outline-0"
                    type="text"
                    disabled={!editing}
                    value={user.country || ''}
                    onChange={(e) => {
                      const updatedUsers = users.map((u) => (u.id === user.id ? { ...u, country: e.target.value } : u));
                      setUsers(updatedUsers);
                      updateUnsavedChanges(user.id, 'country', e.target.value);
                    }}
                  />
                </div>
                <div className={`w-[8%] block px-0 rounded-r-lg border-gray-100 dark:border-gray-800 font-normal ${editing ? 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300' : 'bg-gray-50 dark:bg-gray-800 text-gray-500'}`}>
                  <input
                    className="py-3 px-4 w-full outline-0"
                    type="number"
                    disabled={!editing}
                    value={user.age || ''}
                    onChange={(e) => {
                      const value = e.target.value ? parseInt(e.target.value) : null;
                      const updatedUsers = users.map((u) => (u.id === user.id ? { ...u, age: value } : u));
                      setUsers(updatedUsers);
                      updateUnsavedChanges(user.id, 'age', value);
                    }}
                  />
                </div>
                <div className={`w-[8%] flex items-center justify-center px-0 font-normal`}>
                    <span
                        className={`bg-red-500/10 dark:bg-red-500/30 px-3 py-1 ${editing ? 'text-red-600 dark:text-red-400' : 'text-red-300 dark:text-red-500/35'} rounded-lg cursor-pointer`}
                        onClick={async () => {
                            if (!editing) return;
                            const { error } = await supabase.from('users').delete().eq('id', user.id);
                            if (error) {
                                console.error('Error deleting user', user, error);
                                setError(error instanceof Error ? error.message : 'An unexpected error occurred');
                            }
                            // Re-fetch users
                            const { data, error: fetchError } = await supabase.from('users').select('*').order('created_at', { ascending: false });
                            if (fetchError) {
                                console.error('Error re-fetching users', error);
                                setError(fetchError instanceof Error ? fetchError.message : 'An unexpected error occurred');
                            } else {
                                setUsers(data || []);
                            }
                        }}
                    >
                        Delete
                    </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}