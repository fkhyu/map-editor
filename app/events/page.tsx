'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css'
import { Timestamp } from 'next/dist/server/lib/cache-handlers/types';
import { useParams, useSearchParams } from 'next/navigation';
import { FeatureCollection } from 'geojson';
import { useRouter } from 'next/navigation';   
import { supabase } from '@/lib/supabaseClient';



// const supabase = createClientComponentClient();
mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || '';

const generateUniqueId = () => crypto.randomUUID();

type User = {
    id: string;
    email: string;
    name: string;
    age: number;
    country: string;
    role: string;
    created_at: Timestamp;
}

function EventsPageContent() {
    type Event = {
        id: string;
        name: string;
        start_time: Timestamp;
        end_time: Timestamp;
        description: string;
        created_at: Timestamp;
        poi_id: string;
        poi_properties?: {
            id: string;
            lat: number;
            lon: number;
        }
        participants?: string[];
    }

    const [events, setEvents] = useState<Event[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const hasFetched = useRef(false);
    const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
    const [mapContainer, setMapContainer] = useState<HTMLDivElement | null>(null);
    const map = useRef<mapboxgl.Map | null>(null);
    const markers = useRef<mapboxgl.Marker[]>([]);
    const [mapLoaded, setMapLoaded] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const searchParams = useSearchParams();
    const eventId = searchParams.get('id');

    // for session management
    const [session, setSession] = useState<any>(null);
    const router = useRouter();
    const [user, setUser] = useState<any>(null);
    const [loadingSession, setLoadingSession] = useState(true);

    // For participant management
    const [users, setUsers] = useState<User[]>([]);
    const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
    const [participantInput, setParticipantInput] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);
    const [selectedParticipants, setSelectedParticipants] = useState<User[]>([]);
    const dropdownRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        // Get initial session
        supabase.auth.getSession().then(({ data: { session }, error: sessionError }) => {
          if (!session || sessionError) {
            router.push('/login');
            console.error("Session error:", sessionError, session);
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

    const handleAddEvent = async (eventData: { name: string, start_time: Timestamp, end_time: Timestamp, description: string, poi_id: string}) => {
        try {
            const newEvent: Event = {
                id: generateUniqueId(),
                ...eventData,
                created_at: new Date().getTime() as unknown as Timestamp,
            };

            const { error } = await supabase
                .from('events')
                .insert([newEvent]);

            if (error) throw error;

            setEvents(prev => [...prev, newEvent]);
            console.log('Event added:', newEvent);
        } catch (error) {
            console.error('Error adding event:', error);
            setError(error instanceof Error ? error.message : 'An unexpected error occurred');
        }
    };

    // Fetch users from database
    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const { data, error } = await supabase
                    .from('users_info_view')
                    .select('*');

                if (error) throw error;
                console.log('Fetched users:', data);
                setUsers(data || []);
            } catch (error) {
                console.error('Error fetching users:', error);
                setError(error instanceof Error ? error.message : 'An unexpected error occurred');
            }
        };

        fetchUsers();
    }, []);

    useEffect(() => {
        if (participantInput.trim() === '') {
            setFilteredUsers([]);
            setShowDropdown(false);
            return;
        }

        const filtered = users?.filter(user =>
            user.name?.toLowerCase().includes(participantInput.toLowerCase()) || 
            (user.id && user.id?.toLowerCase().includes(participantInput.toLowerCase()))
        );

        setFilteredUsers(filtered || []);
        setShowDropdown(filtered.length > 0);
    }, [participantInput, users]);

    // Click outside to close dropdown
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowDropdown(false);
            }
        }

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Initialize participants when event is selected
    useEffect(() => {
        if (selectedEvent) {
            if (selectedEvent.participants && Array.isArray(selectedEvent.participants)) {
                const participantUsers = users.filter(user =>
                    selectedEvent.participants?.includes(user.id)
                );
                setSelectedParticipants(participantUsers);
            } else {
                setSelectedParticipants([]);
            }
        }
    }, [selectedEvent, users]);

    const handleAddParticipant = async (userId: string) => {
        console.log('Adding participant:', userId, selectedParticipants);
        const userToAdd = users.find(user => user.id === userId);
        if (!userToAdd) return;

        if (!selectedParticipants.some(user => user.id === userId)) {
            const newParticipants = [...selectedParticipants, userToAdd];
            console.log('New participants:', newParticipants);
            setSelectedParticipants(newParticipants);

            if (selectedEvent) {
                setSelectedEvent({
                    ...selectedEvent,
                    participants: newParticipants.map(user => user.id)
                });

                const { error } = await supabase
                    .from('events')
                    .update({
                        participants: newParticipants.map(user=>user.id)
                    })
                    .eq('id', selectedEvent.id);

                if (error) {
                    console.error('Error updating participants:', error);
                    setError(error instanceof Error ? error.message : 'An unexpected error occurred');
                }
            }
        }
        setParticipantInput('');
        setShowDropdown(false);
    };

    const handleRemoveParticipant = (userToRemove: User) => {
        const newParticipants = selectedParticipants.filter(user => user.id !== userToRemove.id);
        setSelectedParticipants(newParticipants);

        if (selectedEvent) {
            setSelectedEvent({
                ...selectedEvent,
                participants: newParticipants.map(user => user.id)
            });
        }
    };

    // Open event if specified in URL, only after loading is complete
    useEffect(() => {
        if (!loading && eventId && events.length > 0) {
            const timer = setTimeout(() => {
                const eventFromUrl = events.find(event => event.poi_id === eventId);
                if (eventFromUrl) {
                    setSelectedEvent(eventFromUrl);
                    console.log('Event from URL selected:', eventFromUrl);
                } else {
                    console.log('No event found with ID:', eventId);
                }
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [loading, eventId]);

    // Listen for escape key
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setSelectedEvent(null);
                // window.location.href = '/events';
                setIsModalOpen(false);
            }
        }
        window.addEventListener('keydown', handleKeyDown);
        return () => window.addEventListener('keydown', handleKeyDown);
    }, []);

    // set selected participants when event is selected
    useEffect(() => {
        if (selectedEvent && selectedEvent.participants && Array.isArray(selectedEvent.participants)) {
            const participantUsers = users.filter(user => 
                selectedEvent.participants?.includes(user.id)
            );
            setSelectedParticipants(participantUsers);
        } else {
            setSelectedParticipants([]);    
        }
    }, [selectedEvent, users])

    useEffect(() => {
        if (map.current || !mapContainer) return;

        map.current = new mapboxgl.Map({
            container: mapContainer,
            center: [-74.5, 40],
            zoom: 9,
        });

        map.current.on('load', () => {
            setMapLoaded(true);
        })

        map.current.on('click', (e) => {
            const target = e.originalEvent.target as HTMLElement;
            if (!target.closest('.event-marker')) {
                setSelectedEvent(null);
                // window.location.href = '/events';
                markers.current.forEach(marker => {
                    const el = marker.getElement();
                    el.style.backgroundColor = '#3b82f6';
                    const currentTransform = el.style.transform;
                    const scaleRegex = /scale\(\d+(\.\d+)?\)/;
                    if (scaleRegex.test(currentTransform)) {
                        el.style.transform = currentTransform.replace(scaleRegex, 'scale(1)');
                    } else {
                        el.style.transform = `${currentTransform} scale(1)`;
                    }
                });
            }
        });

        return () => {
            if (map.current) {
                map.current.remove();
                map.current = null;
            }
            setMapLoaded(false);
        };
    }, [mapContainer]);

    useEffect(() => {
        if (hasFetched.current) return;

        const fetchEvents = async () => {
            try {
                setLoading(true);
                setError(null);

                const { data, error } = await supabase
                    .from('events')
                    .select('*');

                if (error) throw error;

                setEvents(data || []);
                await fetchPOIData(data);
                hasFetched.current = true;
            } catch (error) {
                console.error('Error fetching events:', error);
                setError(error instanceof Error ? error.message : 'An unexpected error occured');
            } finally {
                setLoading(false);
            }
        };

        fetchEvents();
    }, []);

    const fetchPOIData = async (events: Event[] | null) => {
        if (!events) return;

        const updatedEvents = [...events];

        for (let i = 0; i < updatedEvents.length; i++) {
            const event = updatedEvents[i];
            if (!event.poi_id) continue;

            const { data, error } = await supabase
                .from('poi')
                .select('*')
                .eq('id', event.poi_id);

            if (error) {
                console.error('Failed to fetch POI data for event', event.name, error);
                setError(error instanceof Error ? error.message : 'An unexpected error occured');
                continue;
            }

            console.log(data, event);

            updatedEvents[i] = {
                ...event,
                poi_properties: data && data.length > 0 ? {
                    id: data[0].id,
                    lat: data[0].lat,
                    lon: data[0].lon,
                } : undefined
            };

            if (updatedEvents[i].poi_properties) {
                console.log(`POI data for event ${event.name} with ID ${event.id}:`, updatedEvents[i].poi_properties);
            } else {
                console.warn(`No POI data found for event ${event.name} with ID ${event.id}`);
            }
        }

        setEvents(updatedEvents);
    }

    useEffect(() => {
        if (selectedEvent && selectedEvent.poi_id && selectedEvent.id) {
            const timeoutId = setTimeout(async () => {
                try {
                    const { error } = await supabase
                        .from('events')
                        .update({
                            name: selectedEvent.name,
                            start_time: selectedEvent.start_time,
                            end_time: selectedEvent.end_time,
                            description: selectedEvent.description,
                            poi_id: selectedEvent.poi_id,
                        })
                        .eq('id', selectedEvent.id);

                    if (error) throw error;

                    setEvents(prev => prev.map(event => 
                        event.id === selectedEvent.id ? selectedEvent : event
                    ));
                } catch (error) {
                    console.error('Error updating event:', error);
                    setError(error instanceof Error ? error.message : 'An unexpected error occured');
                }
            }, 1000);

            return () => clearTimeout(timeoutId);
        }
    }, [selectedEvent]);

    useEffect(() => {
        if (!map.current || !mapLoaded) return;

        markers.current.forEach(marker => marker.remove());
        markers.current = [];

        events.forEach(event => {
            if (!event.poi_properties || typeof event.poi_properties.lat !== 'number' || typeof event.poi_properties.lon !== 'number') {
                return;
            }

            const el = document.createElement('div');
            el.className = 'event-marker';
            el.style.cssText = `
                background-color: #3b82f6;
                width: 30px;
                height: 30px;
                border-radius: 50%;
                box-shadow: 0 2px 5px rgba(0,0,0,0.2);
                cursor: pointer;
                transition: all 0.2s ease;
            `;

            const marker = new mapboxgl.Marker({
                element: el,
                anchor: 'center',
                draggable: true,
            })
                .setLngLat([event.poi_properties.lon, event.poi_properties.lat])
                .setPopup(
                    new mapboxgl.Popup({ offset: 25 })
                    .setHTML(`<h3>${event.name}</h3>`)
                );

            marker.addTo(map.current!);

            el.addEventListener('click', (e) => {
                e.stopPropagation();
                setSelectedEvent(event);
                // window.location.href = `/events?id=${event.poi_id}`;
            });

            marker.on('dragend', async () => {
                const lngLat = marker.getLngLat();
                const updatedEvent = { 
                    ...event,
                    poi_properties: {
                        ...event.poi_properties,
                        lon: lngLat.lng,
                        lat: lngLat.lat,
                        id: event.poi_properties?.id ?? event.poi_id
                    }
                };

                if (selectedEvent && selectedEvent.id === event.id) {
                    setSelectedEvent(prev => prev ? {
                        ...prev,
                        poi_properties: {
                            ...prev.poi_properties,
                            lon: lngLat.lng,
                            lat: lngLat.lat,
                            id: prev.poi_properties?.id ?? prev.poi_id
                        }
                    } : null);
                }

                setEvents(prev => 
                    prev.map(e => e.id === event.id ? updatedEvent : e)
                );

                const { error } = await supabase
                    .from('poi')
                    .update({
                        lat: lngLat.lat,
                        lon: lngLat.lng,
                    })
                    .eq('id', event.poi_id);
            });

            marker.on('drag', () => {
                el.style.transform += 'scale(1.3)';
                el.style.backgroundColor = '#2563eb';
            });

            marker.on('dragstart', () => {
                el.style.backgroundColor = '#2563eb';
                marker.getPopup()?.remove();
            });

            marker.on('dragend', () => {
                const currentTransform = el.style.transform;
                const scaleRegex = /scale\([^)]*\)/;
                if (selectedEvent && selectedEvent.id === event.id) {
                    el.style.backgroundColor = '#3b82f6';
                    el.style.transform = scaleRegex.test(currentTransform)
                        ? currentTransform.replace(scaleRegex, 'scale(1)')
                        : `${currentTransform} scale(1)`;
                } else {
                    el.style.backgroundColor = '#3b82f6';
                    el.style.transform = scaleRegex.test(currentTransform)
                        ? currentTransform.replace(scaleRegex, 'scale(1)')
                        : currentTransform + ' scale(1)';
                }
            });

            markers.current.push(marker);
        });

        if (events.length > 0) {
            const bounds  = new mapboxgl.LngLatBounds();
            events.forEach(event => {
                const lon = event.poi_properties?.lon;
                const lat = event.poi_properties?.lat;
                if (typeof lon === 'number' && !isNaN(lon) && typeof lat === 'number' && !isNaN(lat)) {
                    bounds.extend([lon, lat]);
                }
            });
            map.current.fitBounds(bounds, { padding: 50 });
        }
    }, [events, mapLoaded, selectedEvent?.id]);

    useEffect(() => {
        if (!selectedEvent || !map.current || !selectedEvent.poi_properties) return;
        
        map.current.flyTo({
            center: [selectedEvent.poi_properties.lon as number, selectedEvent.poi_properties.lat as number],
            zoom: 16,
            duration: 1000,
        });

        markers.current.forEach((marker, index) => {
            const el = marker.getElement();

            if (events[index].id === selectedEvent.id) {
                el.style.backgroundColor = '#2563eb';
                const currentTransform = el.style.transform;
                const scaleRegex = /scale\(\d+(\.\d+)?\)/;
                if (scaleRegex.test(currentTransform)) {
                    el.style.transform = currentTransform.replace(scaleRegex, 'scale(1.3)');
                } else {
                    el.style.transform = `${currentTransform} scale(1.3)`;
                }
            }
        });
    }, [selectedEvent, events]);

    if (loading) {
        return <div className="w-full h-[100vh] flex justify-center items-center">Loading...</div>
    }

    if (error) {
        return <div className="w-full h-[100vh] flex justify-center items-center text-red-500">Error: {error}</div>
    }

    if (loadingSession) {
        return <div className="p-4 w-full h-[100vh] flex justify-center items-center">Loading session...</div>;
    }

    if (!session) {
        return null;
    }
    

    return (
        <div className='flex h-screen'>
            <div className='w-1/5 h-full flex flex-col items-center bg-gray-100 dark:bg-gray-900 p-4'>
                <div className='flex flex-row justify-between items-center w-full mb-4 pb-3 border-b border-gray-300 dark:border-gray-700'>
                    <div className='flex flex-row itens-center gap-3'>
                        <button
                            className='w-10 h-10 flex items-center justify-center bg-gray-500/10 dark:bg-gray-600 text-gray-600 text-2xl rounded-lg'
                            onClick={() => {
                            window.location.href = '/';
                            }}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#000" className='dark:fill-white'><path d="M560-240 320-480l240-240 56 56-184 184 184 184-56 56Z"/></svg>
                        </button>
                        <h1 className='text-2xl font-bold my-auto'>Events</h1>
                    </div>
                    <button
                        className="w-10 h-10 bg-blue-500/10 dark:bg-blue-500/35 text-blue-600 dark:text-blue-400 text-2xl rounded-lg"
                        onClick={() => window.location.href='/editor'}
                    >
                        +
                    </button>
                </div>

                {events.length === 0 ? (
                    <p>No events found.</p>
                ) : (
                    <div className='grid gap-1 w-full'>
                        {events.map(event => (
                            <div
                                key={event.id}
                                className={`rounded-lg px-4 py-2 hover:bg-gray-200 dark:hover:bg-gray-800 hover:cursor-pointer ${
                                    selectedEvent?.id === event.id ? 'bg-gray-200 dark:bg-gray-800' : ''
                                }`}
                                onClick={() => {setSelectedEvent(event);}}
                            >
                                <h2 className='text-md text-gray-700 dark:text-gray-400 font-medium'>{event.name}</h2>
                            </div>
                        ))}
                    </div>
                )}

                <div
                    className='mt-auto w-full text-center text-gray-500 text-sm py-2 border-t border-gray-300 dark:border-gray-700 hover:cursor-pointer'
                    onClick={() => window.location.href = '/'}
                >
                    Back to Dashboard
                </div>
            </div>

            <div className='w-4/5 flex flex-col h-full p-5'>
                {!selectedEvent && (
                    <div className="flex-1 flex items-center justify-center">
                        <p className='opacity-60'>Select an event to view details</p>
                    </div>
                )}
                {selectedEvent && (
                    <div className="flex flex-row w-full h-1/3 gap-6 mb-10">
                        <div className="flex flex-row w-full gap-6">
                            <div className='w-full roudned-xl'>
                                <div ref={setMapContainer} className='w-full h-full rounded-xl'/>
                            </div>
                        </div>
                    </div>
                )}
                {selectedEvent && (
                <div className='grid grid-cols-2 gap-sta gap-4 w-full'>
                    <div className='flex flex-col gap-6'>
                        <div className='flex flex-col gap-2'>
                            <label htmlFor="" className='block mb-2 text-sm font-medium text-gray-900 dark:text-gray-300'>
                                Name
                            </label>
                            <input
                                type="text"
                                value={selectedEvent?.name || ''}
                                className='px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 focus:ring-2 ring-blue-500 outline-0'
                                onChange={(e) => {
                                    if (selectedEvent) {
                                        setSelectedEvent({
                                            ...selectedEvent,
                                            name: e.target.value
                                        });
                                    }
                                }}
                            />
                        </div>
                        <div className='flex flex-col gap-2'>
                            <label htmlFor="" className='block mb-2 text-sm font-medium text-gray-900 dark:text-gray-300'>
                                Start time
                            </label>
                            <input
                                type="datetime-local"
                                className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 focus:ring-2 ring-blue-500 outline-0"
                                value={selectedEvent?.start_time ? new Date(selectedEvent.start_time).toISOString().slice(0, 16) : ''}
                                onChange={(e) => {
                                    if (selectedEvent) {
                                        setSelectedEvent({
                                            ...selectedEvent,
                                            start_time: new Date(e.target.value).getTime() as unknown as Timestamp
                                        });
                                    }
                                }}
                            />
                        </div>
                        <div className='flex flex-col gap-2'>
                            <label htmlFor="" className='block mb-2 text-sm font-medium text-gray-900 dark:text-gray-300'>
                                End time
                            </label>
                            <input
                                type="datetime-local"
                                className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 focus:ring-2 ring-blue-500 ourline-0"
                                value={selectedEvent?.end_time ? new Date(selectedEvent.end_time).toISOString().slice(0, 16) : ''}
                                onChange={(e) => {
                                    if (selectedEvent) {
                                        setSelectedEvent({
                                            ...selectedEvent,
                                            end_time: new Date(e.target.value).getTime() as unknown as Timestamp
                                        });
                                    }
                                }}
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <label htmlFor="" className='mb-2 text-sm font-medium text-gray-900 dark:text-gray-300'>
                                Participants
                            </label>

                            {selectedParticipants.length > 0 && (
                                <div className='flex flex-wrap gap-2 mb-2'>
                                    {selectedParticipants.map((participant, index) => (
                                        <span
                                            className=' bg-blue-500/10 dark:bg-blue-500/30 text-blue-800 dark:text-blue-300 px-3 py-1 rounded-full flex items-center gap-2'
                                            key={index}
                                        >
                                            {participant.name || participant.email}
                                            <button
                                                onClick={() => handleRemoveParticipant(participant)}
                                                className='text-blue-500 hover:text-blue-700 ml-1'
                                            >
                                                ×
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                            
                            {}

                            <div className='relative'>
                                <input
                                    type='text'
                                    value={participantInput}
                                    onChange={(e) => setParticipantInput(e.target.value)}
                                    onFocus={() => setShowDropdown(true)}
                                    className='w-full px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 ring-blue-500 outline-0'
                                    placeholder='Add participants by name or email...'
                                />

                                {showDropdown && (
                                    <div className='absolute z-10 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg mt-1 max-h-60 overflow-y-auto'>
                                        {filteredUsers.map((user) => (
                                            <div
                                                key={user.id}
                                                className='px-4 py-2 hover:bg-gray-100 cursor-pointer'
                                                onClick={() => handleAddParticipant(user.id)}
                                            >
                                                <span className='font-medium flex flex-col'>{user.name || user.email}</span>
                                                {user.name && (
                                                    <span className='text-sm text-gray-500'>{user.email}</span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className='flex flex-col gap-6'>
                        <div className='flex flex-col gap-2'>
                            <label htmlFor="" className="block mb-2 text-sm font-medium text-gray-900 dark:text-gray-300">
                                Description
                            </label>
                            <textarea
                                value={selectedEvent?.description || ''}
                                className="px-4 py-2 border border-gray-200 dark:border-gray-700 focus:ring-2 ring-blue-500 rounded-lg min-h-[144px] resize-none"
                                onChange={(e) => {
                                    if (selectedEvent) {
                                        setSelectedEvent({
                                            ...selectedEvent,
                                            description: e.target.value
                                        });
                                    }
                                }}
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <label htmlFor="" className="mb-2 text-sm font-medium text-gray-900 dark:text-gray-300">
                                POI ID
                            </label>
                            <input
                                type="text"
                                value={selectedEvent.poi_id || ''}
                                className="px-4 py-2 border bg-gray-100 dark:bg-gray-800 text-gray-500 border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 ring-blue-500 outline-0"
                                onChange={() => {}}
                                readOnly
                                disabled
                            />
                        </div>
                        <div className='flex flex-col items-center gap-2 mt-12'>
                            <button className='w-full py-2 bg-red-500 text-white rounded-lg font-semibold'>
                                Delete event
                            </button>
                            <span className='text-gray-400 text-sm'>This will delete the event permanently!</span>
                        </div>
                    </div>
                </div>
                )}
            </div>
        </div>
    )
}

export default function EventsPage() {
    return (
        <Suspense fallback={
            <div className="w-full h-[100vh] flex justify-center items-center">Loading...</div>
        }
        >
            <EventsPageContent />
        </Suspense>
    )
}