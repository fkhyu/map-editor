'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import NewBuildingModal from './components/newBuildignModal';
import { useRouter } from 'next/navigation';

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || 'your-mapbox-token-here';

const generateUniqueId = () => crypto.randomUUID();

export default function BuildingsPage() {
  type Building = {
    id: string;
    name: string;
    address?: string;
    floorIDs?: string[];
    lat: number;
    lon: number;
    imageUrl?: string;
  };

  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasFetched = useRef(false);
  const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(null);
  const [mapContainer, setMapContainer] = useState<HTMLDivElement | null>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<mapboxgl.Marker[]>([]);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

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

  // Handle new building creation
  const handleAddBuilding = async (buildingData: { name: string; address: string; lat: number; lon: number }) => {
    try {
      const newBuilding = {
        id: generateUniqueId(),
        ...buildingData
      };

      const { error } = await supabase
        .from('buildings')
        .insert([newBuilding]);

      if (error) throw error;

      setBuildings(prev => [...prev, newBuilding]);
      console.log('Building added successfully:', newBuilding);
    } catch (error) {
      console.error('Error adding building:', error);
      setError(error instanceof Error ? error.message : 'An unknown error occurred');
    }
  };

  // Handle Escape key to deselect building
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedBuilding(null);
        markers.current.forEach(marker => {
          const el = marker.getElement();
          el.style.backgroundColor = '#3b82f6'; // Reset color
          // Don't override transform - let Mapbox handle positioning
          const currentTransform = el.style.transform;
          const scaleRegex = /scale\([^)]*\)/;
          if (scaleRegex.test(currentTransform)) {
            el.style.transform = currentTransform.replace(scaleRegex, 'scale(1)');
          } else {
            el.style.transform = currentTransform + ' scale(1)';
          }
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Initialize map when mapContainer is ready
  useEffect(() => {
    if (map.current || !mapContainer) return;

    console.log('Initializing map...');
    
    map.current = new mapboxgl.Map({
      container: mapContainer,
      // style: 'mapbox://styles/mapbox/streets-v12',
      center: [-74.5, 40],
      zoom: 9,
    });

    map.current.on('load', () => {
      console.log('Map loaded successfully');
      setMapLoaded(true); // Set map as loaded
    });

    map.current.on('click', (e) => {
      const target = e.originalEvent.target as HTMLElement;
      if (!target.closest('.building-marker')) {
        setSelectedBuilding(null);
        markers.current.forEach(marker => {
          const el = marker.getElement();
          el.style.backgroundColor = '#3b82f6';
          // Don't override transform - let Mapbox handle positioning
          const currentTransform = el.style.transform;
          const scaleRegex = /scale\([^)]*\)/;
          if (scaleRegex.test(currentTransform)) {
            el.style.transform = currentTransform.replace(scaleRegex, 'scale(1)');
          } else {
            el.style.transform = currentTransform + ' scale(1)';
          }
        });
      }
    });

    return () => {
      console.log('Cleaning up map...');
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
      setMapLoaded(false);
    };
  }, [mapContainer]);

  // Fetch buildings from Supabase
  useEffect(() => {
    if (hasFetched.current) return;

    const fetchBuildings = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data, error } = await supabase.from('buildings').select('*');

        if (error) throw error;

        console.log('Buildings data:', data);
        setBuildings(data || []);
        hasFetched.current = true;
      } catch (err) {
        console.error('Error fetching buildings:', err);
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchBuildings();
  }, []);

  // Update buildign properties when selectedBuilding changes
  useEffect(() => {
    if (selectedBuilding && selectedBuilding.id) {
      const timeoutId = setTimeout(async () => {
        try {
          const {error} = await supabase
            .from('buildings')
            .update({
              name: selectedBuilding.name,
              address: selectedBuilding.address,
              lat: selectedBuilding.lat,
              lon: selectedBuilding.lon,
              imageUrl: selectedBuilding.imageUrl || null,
            })
            .eq('id', selectedBuilding.id);

          if (error) throw error;

          console.log('Building updated successfully:', selectedBuilding);

          setBuildings(prev =>
            prev.map(building =>
              building.id === selectedBuilding.id ? { ...building, ...selectedBuilding } : building
            )
          );
        } catch (error) {
          console.error('Error updating building:', error);
          setError(error instanceof Error ? error.message : 'An unknown error occurred');
        }
      }, 1000);

      return () => clearTimeout(timeoutId);
    }
  }, [selectedBuilding]);

  // Add building markers to map
  useEffect(() => {
    if (!map.current || !mapLoaded || buildings.length === 0) return;

    console.log('Adding markers to map...');

    // Clear existing markers
    markers.current.forEach(marker => marker.remove());
    markers.current = [];

    // Add markers for each building
    buildings.forEach(building => {
      const el = document.createElement('div');
      el.className = 'building-marker';
      el.style.cssText = `
        background-color: #3b82f6;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        border: 2px solid white;
        cursor: pointer;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        transition: all 0.2s ease;
      `;

      console.log(`Adding marker for building: ${building.name} at [${building.lon}, ${building.lat}]`);
      
      const marker = new mapboxgl.Marker({
        element: el,
        draggable: true // Make marker draggable
      })
        .setLngLat([building.lon, building.lat])
        .setPopup(
          new mapboxgl.Popup({ offset: 25 })
            .setHTML(`<h3>${building.name}</h3><p>${building.address || ''}</p>`)
        );

      marker.addTo(map.current!);
      console.log(`Marker added for building: ${building.name}`);
      
      // Handle marker click
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        setSelectedBuilding(building);
      });

      // Handle marker drag end
      marker.on('dragend', () => {
        const lngLat = marker.getLngLat();
        const updatedBuilding = {
          ...building,
          lat: lngLat.lat,
          lon: lngLat.lng
        };
        
        // Update the selected building if it's the one being dragged
        if (selectedBuilding?.id === building.id) {
          setSelectedBuilding(updatedBuilding);
        }
        
        // Update the buildings array
        setBuildings(prev => 
          prev.map(b => b.id === building.id ? updatedBuilding : b)
        );
      });

      // Visual feedback during drag
      marker.on('drag', () => {
        el.style.transform += ' scale(1.3)';
        el.style.backgroundColor = '#f59e0b'; // Orange color during drag
      });

      marker.on('dragstart', () => {
        el.style.backgroundColor = '#f59e0b'; // Orange color during drag
        // Close any open popups on this marker
        marker.getPopup()?.remove();
      });

      marker.on('dragend', () => {
        // Reset visual state after drag
        const currentTransform = el.style.transform;
        const scaleRegex = /scale\([^)]*\)/;
        if (selectedBuilding?.id === building.id) {
          el.style.backgroundColor = '#ef4444'; // Red for selected
          el.style.transform = scaleRegex.test(currentTransform) 
            ? currentTransform.replace(scaleRegex, 'scale(1.2)')
            : currentTransform + ' scale(1.2)';
        } else {
          el.style.backgroundColor = '#3b82f6'; // Blue for unselected
          el.style.transform = scaleRegex.test(currentTransform)
            ? currentTransform.replace(scaleRegex, 'scale(1)')
            : currentTransform + ' scale(1)';
        }
      });

      markers.current.push(marker);
    });

    // Fit map to show all buildings
    if (buildings.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      buildings.forEach(building => {
        bounds.extend([building.lon, building.lat]);
      });
      map.current.fitBounds(bounds, { padding: 50 });
    }
  }, [buildings, mapLoaded, selectedBuilding?.id]);

  // Highlight selected building
  useEffect(() => {
    if (!selectedBuilding || !map.current) return;

    // Fly to selected building
    map.current.flyTo({
      center: [selectedBuilding.lon, selectedBuilding.lat],
      zoom: 15,
      duration: 1000,
    });

    // Update marker styles
    markers.current.forEach((marker, index) => {
      const el = marker.getElement();
      if (buildings[index]?.id === selectedBuilding.id) {
        el.style.backgroundColor = '#ef4444';
        // Preserve existing transform and modify scale
        const currentTransform = el.style.transform;
        const scaleRegex = /scale\([^)]*\)/;
        if (scaleRegex.test(currentTransform)) {
          el.style.transform = currentTransform.replace(scaleRegex, 'scale(1.2)');
        } else {
          el.style.transform = currentTransform + ' scale(1.2)';
        }
      } else {
        el.style.backgroundColor = '#3b82f6';
        // Preserve existing transform and modify scale
        const currentTransform = el.style.transform;
        const scaleRegex = /scale\([^)]*\)/;
        if (scaleRegex.test(currentTransform)) {
          el.style.transform = currentTransform.replace(scaleRegex, 'scale(1)');
        } else {
          el.style.transform = currentTransform + ' scale(1)';
        }
      }
    });
  }, [selectedBuilding, buildings]);

  if (loading) {
    return <div className="p-4 w-full h-[100vh] flex justify-center items-center">Loading buildings...</div>;
  }

  if (error) {
    return <div className="p-4 w-full h-[100vh] flex justify-center items-center text-red-500">Error: {error}</div>;
  }

  if (loadingSession) {
    return <div className="p-4 w-full h-[100vh] flex justify-center items-center">Loading session...</div>;
  }

  if (!session) {
    return null;
  }

  return (
    <div className="flex h-screen">
      <div className="w-1/5 h-full flex flex-col items-center bg-gray-100 dark:bg-gray-900 p-4">
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
              <h1 className='text-2xl font-bold my-auto'>Buildings</h1>
          </div>
          <button
            className='w-10 h-10 bg-blue-500/10 dark:bg-blue-500/35 text-blue-600 dark:text-blue-400 text-2xl rounded-lg'
            onClick={() => setIsModalOpen(true)}
          >
            +
          </button>
        </div>
        
        {buildings.length === 0 ? (
          <p>No buildings found.</p>
        ) : (
          <div className="grid gap-1 w-full">
            {buildings.map((building) => (
              <div
                key={building.id}
                className={`rounded-xl px-4 py-2 hover:bg-gray-200 dark:hover:bg-gray-800 hover:cursor-pointer ${
                  selectedBuilding?.id === building.id ? 'bg-gray-200 dark:bg-gray-800' : ''
                }`}
                onClick={() => setSelectedBuilding(building)}
              >
                <h2 className="text-md text-gray-700 dark:text-gray-400 font-medium">{building.name}</h2>
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

      <div className="w-4/5 flex flex-col h-full">
        {!selectedBuilding && (
          <div className="flex-1 flex items-center justify-center">
            <p className="opacity-60">Select a building to view details</p>
          </div>
        )}
        {selectedBuilding && (
          <div className="w-full flex-1 p-4 gap-6 flex flex-col items-start overflow-y-auto">
            {selectedBuilding.imageUrl && (
              <div className='flex flex-row w-full gap-6'>
                <div className="w-full rounded-xl" style={{ height: 400 }}>
                  <div ref={setMapContainer} className="w-full h-full rounded-xl" />
                </div>
                <div className="w-full h-full relative">
                  <img
                    src={selectedBuilding.imageUrl}
                    alt={selectedBuilding.name + ' image'}
                    className="w-full h-full rounded-xl object-cover"
                  />
                  {/* Disabled for now */}
                  {/* <label className="absolute py-1 px-3 top-2 right-2 bg-black/30 rounded-lg text-sm text-white font-medium hover:cursor-pointer">
                    Edit
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setSelectedBuilding({ ...selectedBuilding, imageUrl: URL.createObjectURL(file) });
                          console.log('Selected file:', file);
                        }
                      }}
                    />
                  </label> */}
                  {/* Disabled for now */}
                </div>
              </div>
            )}
            {!selectedBuilding.imageUrl && (
              <div className='flex flex-row w-full gap-6'>
                <div className="w-full rounded-xl" style={{ height: 400 }}>
                  <div ref={setMapContainer} className="w-full h-full rounded-xl" />
                </div>
                <div className="w-full h-full relative">
                  <div className="w-full h-full rounded-xl bg-gray-200 dark:bg-gray-600 flex items-center justify-center">
                    <p className="text-gray-500 dark:text-gray-400">No image available</p>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 grid-sta gap-4 w-full">
              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-1">
                  <label htmlFor="buildingName" className="block mb-2 text-sm font-medium text-gray-900 dark:text-gray-300">
                    Name
                  </label>
                  <input
                    id="buildingName"
                    type="text"
                    value={selectedBuilding.name}
                    className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 focus:ring-2 ring-blue-500 outline-0"
                    onChange={(e) => setSelectedBuilding({ ...selectedBuilding, name: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="buildingAddress" className="block mb-2 text-sm font-medium text-gray-900 dark:text-gray-300">
                    Address
                  </label>
                  <input
                    id="buildingAddress"
                    type="text"
                    value={selectedBuilding.address || ''}
                    className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 focus:ring-2 ring-blue-500 outline-0"
                    onChange={(e) => setSelectedBuilding({ ...selectedBuilding, address: e.target.value })}
                  />
                </div>
                <div className='flex flex-col gap-1'>
                  <label htmlFor="uuid" className='block mb-2 test-sm font-medium text-gray-900 dark:text-gray-300'>
                    UUID
                  </label>
                  <input
                    type="text"
                    id='uuid'
                    value={selectedBuilding.id.toString()}
                    className="px-4 py-2 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 text-gray-500 outline-0 cursor-not-allowed"
                    onChange={() => {}}
                    disabled
                    readOnly
                  />
                </div>

                {/* move buildig on map button */}
                <div>
                  <button
                    className='bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors duration-200 w-full mb-2'
                    onClick={() => {
                      if (!map.current || !selectedBuilding) return;
                      map.current.flyTo({
                        center: [selectedBuilding.lon, selectedBuilding.lat],
                        zoom: 15,
                        duration: 1000,
                      });
                    }}
                  >
                    Center on Map
                  </button>
                  <p className="text-xs text-gray-500 text-center">
                    Drag the marker on the map to move the building
                  </p>
                </div>
                
              </div>
              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-1">
                  <label htmlFor="buildingLat" className="block mb-2 text-sm font-medium text-gray-900 dark:text-gray-300">
                    Latitude
                  </label>
                  <input
                    id="buildingLat"
                    type="number"
                    step="0.0001"
                    value={selectedBuilding.lat}
                    className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 focus:ring-2 ring-blue-500 outline-0"
                    onChange={(e) => setSelectedBuilding({ ...selectedBuilding, lat: parseFloat(e.target.value) })}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="buildingLon" className="block mb-2 text-sm font-medium text-gray-900 dark:text-gray-300">
                    Longitude
                  </label>
                  <input
                    id="buildingLon"
                    type="number"
                    step="0.0001"
                    value={selectedBuilding.lon}
                    className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 focus:ring-2 ring-blue-500 outline-0"
                    onChange={(e) => setSelectedBuilding({ ...selectedBuilding, lon: parseFloat(e.target.value) })}
                  />
                </div>
                <div className='flex flex-col gap-1'>
                  <label htmlFor="imageUrl" className='bloock mb-2 test-sm font-medium text-gray-900 dark:text-gray-300'>
                    Image URL
                  </label>
                  <input
                    type="url" 
                    id="imageUrl"
                    value={selectedBuilding.imageUrl || ''}
                    className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 focus:ring-2 ring-blue-500 outline-0"
                    onChange={(e) => setSelectedBuilding({ ...selectedBuilding, imageUrl: e.target.value })}
                  />
                </div>
                <div>
                  <button
                    className='bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition-colors duration-200 w-full'
                    onClick={async () => {
                      
                      if (!selectedBuilding) return;
                      const confirmed = confirm('Are you sure you want to delete this building? This action cannot be undone.');
                      if (!confirmed) return;
                      const { error } = await supabase
                        .from('buildings')
                        .delete()
                        .eq('id', selectedBuilding.id);
                      if (error) {
                        console.error('Error deleting building:', error);
                        setError(error instanceof Error ? error.message : 'An unknown error occurred');
                      } else {
                        setBuildings(prev => prev.filter(b => b.id !== selectedBuilding.id));
                        setSelectedBuilding(null);
                      }
                    }}
                  >
                    Delete Building
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add the modal */}
      <NewBuildingModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleAddBuilding}
      />
    </div>
  );
}