'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';


// const supabase = createClientComponentClient();

export default function ModerationPage() {
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [checkins, setCheckins] = useState<any[]>([]);
    const [users, setUsers] = useState<any[]>([]);
    const [places, setPlaces] = useState<any[]>([]);
    const [checkinIndex, setCheckinIndex] = useState<number>(0);
    const [imageLoading, setImageLoading] = useState(true);

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

    useEffect(() => {
        setImageLoading(true);
    }, [checkinIndex, checkins]);

    useEffect(() => {
        const fetchCheckins = async () => {
            try {
                const { data, error } = await supabase
                    .from('check_ins')
                    .select('*')
                    .eq('checked', false)
                    .order('created_at', { ascending: true });

                if (error) throw error;
                setCheckins(data || []);
                console.log('Fetched checkins:', data);
            } catch (error) {
                console.error('Error fetching checkins:', error);
                setError('Failed to fetch checkins');
            }
            setLoading(false);
        }
        fetchCheckins();
    }, []);

    // fetch info about users and places
    useEffect(() => {
        const fetchUserAndPlaceInfo = async () => {
            try {
                let userIds = checkins.map(checkin => checkin.poster_id);
                let thingyIds = checkins.map(checkin => checkin.thingy_id);

                // fecth user info
                if (userIds.includes(null)) {
                    userIds = userIds.filter(id => id !== null);
                }
                const { data: users, error: userError } = await supabase
                    .from('users')
                    .select('id, name')
                    .in('id', userIds);
                    
                if (userError) throw userError;
                setUsers(users || []);
                console.log('Fetched users:', users);

                // fecth place info
                if (thingyIds.includes(null)) {
                    thingyIds = thingyIds.filter(id => id !== null);
                }
                const { data: places, error: placeError } = await supabase
                    .from('poi')
                    .select('id, title')
                    .in('id', thingyIds);
                
                if (placeError) throw placeError;
                setPlaces(places || []);
                console.log('Fetched places:', places);

            } catch (error) {
                console.error('Error fetching user or place info:', error);
                setError('Failed to fetch user or place info');
            }
        }

        if (checkins.length > 0) {
            fetchUserAndPlaceInfo();
        } else {
            setLoading(false);
        }
    }, [checkins])

    // handle arrow key nav
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'ArrowLeft') {
                setCheckinIndex((prev) => (prev === 0 ? checkins.length - 1 : prev - 1));
            } else if (event.key === 'ArrowRight') {
                setCheckinIndex((prev) => (prev === checkins.length - 1 ? 0 : prev + 1));
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    })

    const approveCheckin = async (checkinId: string) => {
        try {
            const { error } = await supabase
                .from('check_ins')
                .update({ checked: true })
                .eq('id', checkinId);

            if (error) throw error;

            setCheckins((prev) => prev.filter(checkin => checkin.id !== checkinId));
            setCheckinIndex((prev) => (prev === 0 ? 0 : prev - 1));
            console.log('Check-in approved:', checkinId);
        } catch (error) {
            console.error('Error approving check-in:', error);
            setError('Failed to approve check-in');
        }
    }

    const rejectCheckin = async (checkinId: string) => {
        try {
            const { error } = await supabase
                .from('check_ins')
                .delete()
                .eq('id', checkinId);

            if (error) throw error;

            setCheckins((prev) => prev.filter(checkin => checkin.id !== checkinId));
            setCheckinIndex((prev) => (prev === 0 ? 0 : prev - 1));
            console.log('Check-in rejected:', checkinId);
        } catch (error) {
            console.error('Error rejecting check-in:', error);
            setError('Failed to reject check-in');
        }
    }

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
                <button onClick={() => router.push('/login')} className='text-blue-500 underline'>Log in</button>
            </div>
        );
    }

    return (
        <div className=" w-full flex flex-col items-center justify-center gap-6">
            <button className='absolute top-4 left-4 pl-2 pr-4 cursor-pointer py-1 bg-gray-500/20 dark:bg-white/20 rounded-lg flex flex-row items-center'
                onClick={() => {
                    window.location.href='/'
                }}
            >
                <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#000" className='dark:fill-white'><path d="M560-240 320-480l240-240 56 56-184 184 184 184-56 56Z"/></svg>
                Dashboard
            </button>
            {checkins.length === 0 ? (
                <div className='w-full h-screen flex items-center justify-center text-2xl font-semibold'>No check-ins to check</div>
            ) : (
                <div className='h-screen py-24 w-full flex flex-col items-center justify-center gap-6'>
                    <div>
                        <h1 className='text-3xl font-semibold'>
                            Check-in by <span className='text-orange-500 dark:text-orange-400'>
                                {users.find(u => u.id === checkins[checkinIndex]?.poster_id)?.name || 'Unknown user'}
                            </span>
                        </h1>
                    </div>
                    <div className='w-[60%] rounded-3xl relative'>
                        <div className='w-full h-fit flex flex-row items-center justify-between gap-24'>
                            <button
                                className='p-3 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center'
                                onClick={() => {
                                    if (checkins.length === 0) return;
                                    setCheckinIndex((prev) =>
                                        prev === 0 ? checkins.length - 1 : prev - 1
                                    );
                                    console.log(checkinIndex, checkins.length)
                                }}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" className='fill-gray-600 dark:fill-gray-400'><path d="M560-240 320-480l240-240 56 56-184 184 184 184-56 56Z"/></svg>
                            </button>
                            <div className='relative min-w-[300px] min-h-[300px] flex items-center justify-center'>
                                {imageLoading && (
                                    <div className='absolute inset-0 flex items-center justify-center bg-white/70 rounded-3xl z-10 backdrop-blur-sm'>
                                        <span className='text-lg text-gray-500'>Loading...</span>
                                    </div>
                                )}
                                {checkins[checkinIndex] && (
                                    <>
                                        <img
                                            src={checkins[checkinIndex].image_url}
                                            className='rounded-3xl border-5 border-orange-200'
                                            style={{ maxHeight: '80vh', width: 'auto', height: 'auto', display: 'block', margin: '0 auto' }}
                                            onLoad={() => setImageLoading(false)}
                                            onError={() => setImageLoading(false)}
                                        />
                                        <div className='flex flex-col gap-2 absolute bottom-0 left-0 w-full bg-gradient-to-t from-black to-transparent p-6 pt-12 rounded-b-3xl'>
                                            <div className='flex flex-row items-center justify-between'>
                                                <p className='text-gray-100 text-2xl font-semibold'>
                                                    {places.find(p => p.id === checkins[checkinIndex]?.thingy_id)?.title || 'Unknown place'}
                                                </p>
                                                <p className='text-orange-200 px-3 py-1 text-sm rounded-lg bg-orange-500/30 backdrop-blur-md'>
                                                    {new Date(checkins[checkinIndex].created_at).toLocaleString('en-GB', {
                                                        day: '2-digit',
                                                        month: 'short',
                                                        year: 'numeric',
                                                        hour: '2-digit',
                                                        minute: '2-digit',
                                                        hour12: false
                                                    }).replace(',', '')}
                                                </p>
                                            </div>
                                            <p className='text-gray-100'>{checkins[checkinIndex].caption || 'No description'}</p>
                                        </div>
                                    </>
                                )}
                            </div>
                            <button
                                className='p-3 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center'
                                onClick={() => {
                                    if (checkins.length === 0) return;
                                    setCheckinIndex((prev) =>
                                        prev === checkins.length - 1 ? 0 : prev + 1
                                    );
                                    console.log(checkinIndex, checkins.length)
                                }}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" className='fill-gray-600 dark:fill-gray-400 pl-1'><path d="M504-480 320-664l56-56 240 240-240 240-56-56 184-184Z"/></svg>
                            </button>
                        </div>
                    </div>
                    <div className='flex flex-row w-[30%]'>
                        <button
                            className='bg-green-500/15 dark:bg-green-400/30 dark:text-green-400 text-green-600 hover:bg-green-500 hover:text-white px-4 py-2 font-semibold rounded-full w-1/2'
                            onClick={() => {
                                if (checkins.length === 0) return;
                                const checkin = checkins[checkinIndex];
                                approveCheckin(checkin.id);
                            }}
                        >
                            Approve
                        </button>
                        <button
                            className='ml-2 bg-red-500/15 dark:bg-red-400/30 dark:text-red-400 text-red-600 hover:bg-red-500 hover:text-white px-4 py-2 font-semibold rounded-full w-1/2'
                            onClick={() => {
                                if (checkins.length === 0) return;
                                const checkin = checkins[checkinIndex];
                                rejectCheckin(checkin.id);
                            }}
                        >
                            Reject
                        </button>
                    </div>  
                </div>
            )}
        </div>
    )
}