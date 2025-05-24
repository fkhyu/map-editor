'use client';

import React, { Component, useState, useEffect, useRef, useCallback, ReactNode, useMemo } from 'react';
import mapboxgl from 'mapbox-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import * as turf from '@turf/turf';
import { Feature, FeatureCollection, Polygon, LineString } from 'geojson';
import 'mapbox-gl/dist/mapbox-gl.css';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
// import { createClient } from '@supabase/supabase-js';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';


const supabase = createClientComponentClient();

// Constants 
const DEFAULT_CENTER: [number, number] = [24.8182, 60.1842];
const DEFAULT_ZOOM = 17;
const WALL_HEIGHT = 10;
const DEFAULT_WALL_WIDTH = 0.3;

// Furniture Dimensions (in meters, scaled for map)
const FURNITURE_SIZES = {
  sofa: { width: 2, height: 0.3, depth: 0.4 },
  chair: { width: 0.7, height: 0.35, depth: 0.7 },
  table: { width: 1.5, height: 0.5, depth: 2 },
  cube: { width: 1, height: 1, depth: 1 },
};

// Interfaces
interface WallFeature extends Feature<Polygon> {
  properties: {
    type: 'wall';
    width: number;
    height: number;
  };
}

interface FurnitureFeature extends Feature<Polygon> {
  properties: {
    type: 'furniture' | 'door';
    item: string;
    emoji: string;
    orientation: number;
    height: number;
    shape: 'cube' | 'cylinder';
    scaleX: number;
    scaleY: number;
  };
}

interface RoomFeature extends Feature<Polygon> {
  properties: {
    type: 'room';
    name: string;
    color: string;
    bookable: boolean;
    capacity: number;
    avEquipment: string[];
    purpose: string;
    icon: string;
  };
}

interface FurnitureItem {
  id: string;
  name: string;
  icon: string;
  shape: 'cube' | 'cylinder';
}

// Editor Modes
type EditorMode = 'draw_wall' | 'draw_room' | 'place_furniture' | 'edit_furniture' | 'simple_select';

// Furniture Library
const furnitureLibrary: FurnitureItem[] = [
  { id: 'sofa', name: 'Sofa', icon: '🛋️', shape: 'cube' },
  { id: 'chair', name: 'Chair', icon: '🪑', shape: 'cylinder' },
  { id: 'table', name: 'Table', icon: '🪵', shape: 'cube' },
  { id: 'cube', name: 'Cube', icon: '🚪', shape: 'cube' },
];

// Mapbox Configuration
mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || '';

// Error Boundary Component
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return <div>Something went wrong. Please refresh the page.</div>;
    }
    return this.props.children;
  }
}

const Editor: React.FC = () => {
  const featureIdCounter = useRef(0);
  const generateUniqueId = () => crypto.randomUUID();

  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const draw = useRef<MapboxDraw | null>(null);
  const processedFeatureIds = useRef<Set<string>>(new Set());
  const markersRef = useRef<mapboxgl.Marker[]>([]);

  // State
  const [mode, setMode] = useState<EditorMode>('draw_wall');
  const [wallFeatures, setWallFeatures] = useState<FeatureCollection>({ type: 'FeatureCollection', features: [] });
  const [roomFeatures, setRoomFeatures] = useState<FeatureCollection>({ type: 'FeatureCollection', features: [] });
  const [furnitureFeatures, setFurnitureFeatures] = useState<FeatureCollection>({ type: 'FeatureCollection', features: [] });
  const [wallWidth, setWallWidth] = useState(DEFAULT_WALL_WIDTH);
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
  const [selectedFurniture, setSelectedFurniture] = useState<FurnitureFeature | null>(null);
  const [expandedLayers, setExpandedLayers] = useState<{ [key: string]: boolean }>({
    walls: true,
    rooms: true,
    furniture: true,
  });
  const [mapLoaded, setMapLoaded] = useState(false);

  const selectedFeature = useMemo(() => {
    return roomFeatures.features.find((f) => f.id === selectedFeatureId) || null;
    }, [roomFeatures, selectedFeatureId]);


  // Debounce utility for property updates
  const debounce = useCallback((fn: (...args: any[]) => void, delay: number) => {
    let timeout: NodeJS.Timeout;
    return (...args: any[]) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn(...args), delay);
    };
  }, []);

  // Utility Functions
  const createFurnitureMarkers = useCallback(
    (map: mapboxgl.Map, furniture: FurnitureFeature, updateTransform: (transform: { orientation?: number; scaleX?: number; scaleY?: number }) => void) => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];

      if (!furniture.geometry) {
        console.warn('Furniture feature missing geometry:', furniture);
        return;
      }

      const bbox = turf.bbox(furniture);
      const [minX, minY, maxX, maxY] = bbox;
      const centroid = turf.centroid(furniture).geometry.coordinates;

      const corners = [
        { position: 'top-left', lng: minX, lat: maxY, cursor: 'nwse-resize' },
        { position: 'top-right', lng: maxX, lat: maxY, cursor: 'nesw-resize' },
        { position: 'bottom-right', lng: maxX, lat: minY, cursor: 'nwse-resize' },
        { position: 'bottom-left', lng: minX, lat: minY, cursor: 'nesw-resize' },
      ];

      const rotationHandleOffset = 0.0001;
      const rotationHandle = {
        position: 'rotate',
        lng: maxX + rotationHandleOffset,
        lat: maxY,
        cursor: 'grab',
      };

      const allMarkers = [...corners, rotationHandle];

      allMarkers.forEach(({ position, lng, lat, cursor }) => {
        const el = document.createElement('div');
        el.className = 'furniture-marker';
        el.style.backgroundColor = position === 'rotate' ? '#800080' : '#ffa500';
        el.style.width = '12px';
        el.style.height = '12px';
        el.style.borderRadius = position === 'rotate' ? '50%' : '0';
        el.style.cursor = cursor;
        el.style.border = '2px solid #ffffff';
        el.style.boxShadow = '0 0 4px rgba(0,0,0,0.5)';
        el.style.zIndex = '1000';

        const marker = new mapboxgl.Marker({ element: el, draggable: true }).setLngLat([lng, lat]);

        marker.on('drag', () => {
          const lngLat = marker.getLngLat();
          const newBbox = [...bbox];
          if (position === 'rotate') {
            const newAngle = Math.atan2(lngLat.lat - centroid[1], lngLat.lng - centroid[0]) * (180 / Math.PI);
            updateTransform({ orientation: newAngle });
          } else {
            if (position.includes('left')) newBbox[0] = lngLat.lng;
            if (position.includes('right')) newBbox[2] = lngLat.lng;
            if (position.includes('top')) newBbox[3] = lngLat.lat;
            if (position.includes('bottom')) newBbox[1] = lngLat.lat;

            const originalWidth = maxX - minX;
            const originalHeight = maxY - minY;
            const newWidth = newBbox[2] - newBbox[0];
            const newHeight = newBbox[3] - newBbox[1];

            const scaleX = newWidth / originalWidth;
            const scaleY = newHeight / originalHeight;

            updateTransform({ scaleX: Math.max(0.1, scaleX), scaleY: Math.max(0.1, scaleY) });
          }
        });

        markersRef.current.push(marker);
        marker.addTo(map);
      });
    },
    []
  );

  const handleDrawCreate = useCallback(async (e: any) => {
    if (!e.features || !e.features[0] || !e.features[0].geometry) {
        console.warn('Invalid draw.create event:', e);
        return;
    }
    const newFeature = e.features[0];

    if (processedFeatureIds.current.has(newFeature.id)) {
        return;
    }

    const uniqueId = generateUniqueId();
    newFeature.id = uniqueId;

    processedFeatureIds.current.add(uniqueId);

    if (mode === 'draw_wall' && newFeature.geometry.type === 'LineString') {
        try {
        const line = turf.lineString(newFeature.geometry.coordinates);
        const cleaned = turf.truncate(line, { precision: 10 });
        const buffered = turf.buffer(cleaned, Math.max(0.1, wallWidth / 2), { units: 'meters' });

        if (!buffered || !buffered.geometry || buffered.geometry.type !== 'Polygon') {
            console.warn('Invalid wall polygon:', buffered);
            return;
        }

        const wallFeature: WallFeature = {
            type: 'Feature',
            id: uniqueId,
            geometry: buffered.geometry as Polygon,
            properties: {
            type: 'wall',
            width: wallWidth,
            height: WALL_HEIGHT,
            },
        };

        setWallFeatures((prev) => ({
            ...prev,
            features: [...prev.features, wallFeature],
        }));

        // Add wall to supabase 'rooms' table
        const { data, error } = await supabase
            .from('features')
            .insert([
                {
                    id: uniqueId,
                    geometry: wallFeature.geometry,
                    // floor: currentFloor,
                    type: 'wall',
                },
            ])
            .select();

        setTimeout(() => {
            draw.current?.changeMode('draw_line_string');
        }, 0);

        } catch (err) {
        console.error('Turf buffering error:', err);
        }
    } else if (mode === 'draw_room' || (mode === 'draw_wall' && newFeature.geometry.type === 'Polygon')) {
        if (newFeature.geometry.type !== 'Polygon') {
        return;
        }
        const roomFeature: RoomFeature = {
        type: 'Feature',
        id: uniqueId,
        geometry: newFeature.geometry as Polygon,
        properties: {
            type: 'room',
            name: `Room ${roomFeatures.features.length + 1}`,
            color: '#ff0000',
            bookable: true,
            capacity: 10,
            avEquipment: [],
            purpose: 'Meeting',
            icon: '🏢',
        },
        };
        setRoomFeatures((prev) => ({
        ...prev,
        features: [...prev.features, roomFeature],
        }));
        
        // Add room to supabase 'rooms' table
        const { data, error } = await supabase
            .from('rooms')
            .insert([
                {
                    id: uniqueId,
                    room_number: roomFeatures.features.length + 1, // TODO: let user set the room number
                    title: roomFeature.properties.name,
                    description: roomFeature.properties.purpose,
                    seats: roomFeature.properties.capacity,
                    // type: roomFeature.properties.room_type,
                    // equipment: roomFeature.properties.equipment,
                    bookable: roomFeature.properties.bookable,
                    geometry: roomFeature.geometry,
                },
            ])
            .select();

        // console.log('Inserted room into Supabase:', data, error);

        setSelectedFeatureId(uniqueId);
        setTimeout(() => {
            draw.current?.changeMode('draw_polygon');
        }, 0);

    }
    }, [mode, wallWidth, roomFeatures]);

  const handleMapClick = useCallback((e: mapboxgl.MapMouseEvent) => {
    if (!map.current) return;
    e.preventDefault();
    e.originalEvent.stopPropagation();

    const bbox: [mapboxgl.PointLike, mapboxgl.PointLike] = [
      [e.point.x - 20, e.point.y - 20],
      [e.point.x + 20, e.point.y + 20],
    ];

    const featuresAtPoint = map.current.queryRenderedFeatures(bbox, {
      layers: ['rooms', 'furniture', 'doors'],
    });

    if (mode === 'edit_furniture') {
      const furnitureFeature = featuresAtPoint.find(
        (f) => f.properties?.type === 'furniture' || f.properties?.type === 'door'
      ) as FurnitureFeature | undefined;
      setSelectedFurniture(furnitureFeature || null);
      setSelectedFeatureId(null);
    } else {
      const roomFeature = featuresAtPoint.find((f) => f.properties?.type === 'room') as RoomFeature | undefined;
      setSelectedFeatureId(roomFeature ? roomFeature.id as string : null);
      setSelectedFurniture(null);
    }
  }, [mode]);

  const handleFurnitureMouseDown = useCallback((e: mapboxgl.MapMouseEvent) => {
    if (mode !== 'edit_furniture' || !map.current || !selectedFurniture) return;

    const featuresAtPoint = map.current.queryRenderedFeatures(e.point, {
      layers: ['furniture', 'doors'],
    });

    if (featuresAtPoint.length > 0 && featuresAtPoint[0].id === selectedFurniture.id) {
      const startLngLat = e.lngLat;

      const onMouseMove = (moveEvent: mapboxgl.MapMouseEvent) => {
        const delta = [
          moveEvent.lngLat.lng - startLngLat.lng,
          moveEvent.lngLat.lat - startLngLat.lat,
        ];

        setFurnitureFeatures((prev) => ({
          ...prev,
          features: prev.features.map((f) => {
            if (f.id === selectedFurniture.id && f.geometry) {
              const newGeom = turf.transformTranslate(f.geometry as Polygon, delta[0], delta[1], { units: 'degrees' });
              return { ...f, geometry: newGeom as Polygon };
            }
            return f;
          }),
        }));
      };

      

      const onMouseUp = () => {
        map.current?.off('mousemove', onMouseMove);
        map.current?.off('mouseup', onMouseUp);
      };

      map.current.on('mousemove', onMouseMove);
      map.current.on('mouseup', onMouseUp);
    }
  }, [mode, selectedFurniture]);

  const updateFurnitureTransform = useCallback(
    debounce((transform: { orientation?: number; scaleX?: number; scaleY?: number }) => {
      if (!selectedFurniture || !map.current) return;

      setFurnitureFeatures((prev) => {
        const newFeatures = prev.features.map((f) => {
          if (f.id === selectedFurniture.id && f.geometry) {
            let newGeom = f.geometry as Polygon;
            const newProps = { ...f.properties };

            if (transform.orientation !== undefined) {
              newProps.orientation = transform.orientation;
              const centroid = turf.centroid(f).geometry.coordinates;
              newGeom = turf.transformRotate(f as Feature<Polygon>, transform.orientation - f.properties?.orientation, {
                pivot: centroid,
              }).geometry as Polygon;
            }

            if (transform.scaleX !== undefined || transform.scaleY !== undefined) {
              newProps.scaleX = transform.scaleX !== undefined ? transform.scaleX : f.properties?.scaleX;
              newProps.scaleY = transform.scaleY !== undefined ? transform.scaleY : f.properties?.scaleY;
              const centroid = turf.centroid(f).geometry.coordinates;
              newGeom = turf.transformScale(
                f.geometry as Polygon,
                newProps.scaleX / f.properties?.scaleX,
                { origin: centroid }
              ) as Polygon;
              newGeom = turf.transformScale(
                newGeom,
                newProps.scaleY / f.properties?.scaleY,
                { origin: centroid }
              ) as Polygon;
            }

            return { ...f, geometry: newGeom, properties: newProps };
          }
          return f;
        });

        const updatedFeature = newFeatures.find((f) => f.id === selectedFurniture.id) as FurnitureFeature;
        if (updatedFeature) {
          createFurnitureMarkers(map.current!, updatedFeature, updateFurnitureTransform);
        }

        return { ...prev, features: newFeatures };
      });
    }, 100),
    [selectedFurniture, createFurnitureMarkers]
  );

  const updateRoomProperties = useCallback(
    async (properties: Partial<RoomFeature['properties']>) => {
      if (!selectedFeatureId) return;
      
      console.log('Updating room properties:', properties);

      // Update local state
      setRoomFeatures((prev) => ({
        ...prev,
        features: prev.features.map((f) =>
          f.id === selectedFeatureId ? { ...f, properties: { ...f.properties, ...properties } } : f
        ),
      }));

      // Update in Supabase
      const updatePayload: any = {};
      if (properties.name !== undefined) updatePayload.title = properties.name;
      if (properties.color !== undefined) updatePayload.color = properties.color;
      if (properties.bookable !== undefined) updatePayload.bookable = properties.bookable;
      if (properties.capacity !== undefined) updatePayload.seats = properties.capacity;
      if (properties.purpose !== undefined) updatePayload.description = properties.purpose;

      if (Object.keys(updatePayload).length > 0) {
        console.log('Updating room in Supabase:', updatePayload);
        const { data, error } = await supabase
          .from('rooms')
          .update(updatePayload)
          .eq('id', selectedFeatureId)
          .select();
        console.log('Updated room in Supabase:', data, error);
        if (error) {
          console.error('Error updating room in Supabase:', error);
        }
      }
    },
    [selectedFeatureId]
  );

  const handleExportGeoJSON = useCallback(() => {
    const exportFile = (data: FeatureCollection, filename: string) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    };

    exportFile(wallFeatures, 'walls.geojson');
    exportFile(roomFeatures, 'rooms.geojson');
    exportFile(furnitureFeatures, 'furniture.geojson');
  }, [wallFeatures, roomFeatures, furnitureFeatures]);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    if (!map.current || !mapContainer.current) return;

    const json = e.dataTransfer?.getData('application/json');
    if (!json) return;

    const data = JSON.parse(json);
    const rect = mapContainer.current.getBoundingClientRect();
    const point: [number, number] = [e.clientX - rect.left, e.clientY - rect.top];

    const lngLat = map.current.unproject(point);
    const pointGeo = turf.point([lngLat.lng, lngLat.lat]);

    const sizes = FURNITURE_SIZES[data.id as keyof typeof FURNITURE_SIZES];
    if (!sizes) return;

    const shape = furnitureLibrary.find((item) => item.id === data.id)?.shape || 'cube';

    let furniturePolygon;
    if (shape === 'cube') {
      const halfWidth = sizes.width / 100000;
      const halfDepth = sizes.depth / 100000;
      const coords = [
        [lngLat.lng - halfWidth, lngLat.lat + halfDepth],
        [lngLat.lng + halfWidth, lngLat.lat + halfDepth],
        [lngLat.lng + halfWidth, lngLat.lat - halfDepth],
        [lngLat.lng - halfWidth, lngLat.lat - halfDepth],
        [lngLat.lng - halfWidth, lngLat.lat + halfDepth],
      ];
      furniturePolygon = turf.polygon([coords]);
    } else {
      furniturePolygon = turf.buffer(pointGeo, sizes.width / 2, { units: 'meters', steps: 16 });
    }

    if (!furniturePolygon?.geometry || furniturePolygon.geometry.type !== 'Polygon') {
      console.error('Invalid polygon geometry created for furniture');
      return;
    }

    const furnitureFeature: FurnitureFeature = {
      type: 'Feature',
      id: generateUniqueId(),
      geometry: furniturePolygon?.geometry as Polygon,
      properties: {
        type: data.id === 'cube' ? 'door' : 'furniture',
        item: data.id,
        emoji: data.icon,
        orientation: 0,
        height: sizes.height,
        shape: shape,
        scaleX: 1,
        scaleY: 1,
      },
    };

    setFurnitureFeatures((prev) => ({
      ...prev,
      features: [...prev.features, furnitureFeature],
    }));
  }, []);

  const handleLayerSelect = useCallback((feature: Feature) => {
    if (!feature.id) {
        console.warn('Feature does not have an ID:', feature);
        return;
    }
    if (feature.properties?.type === 'furniture' || feature.properties?.type === 'door') {
        setSelectedFurniture(feature as FurnitureFeature);
        setSelectedFeatureId(null);
        setMode('edit_furniture');
    } else if (feature.properties?.type === 'room') {
        setSelectedFeatureId(feature.id as string); // <- use ID here
        setSelectedFurniture(null);
        setMode('simple_select');
    }
  }, []);

    const handleDrawUpdate = useCallback((e: any) => {
        console.log('draw.update', e);
        if (!e.features || !e.features[0] || !e.features[0].geometry) {
            console.warn('Invalid draw.update event:', e);
            return;
        }
        const updatedFeature = e.features[0];
        setRoomFeatures((prev) => ({
            ...prev,
            features: prev.features.map((f) =>
              f.id === updatedFeature.id
                ? {
                    ...f,
                    geometry: updatedFeature.geometry,
                    // Merge any new properties from the drawn feature, but keep our custom ones
                    properties: { ...f.properties, ...updatedFeature.properties },
                  }
                : f
            ),
        }));
    }, []);


  const toggleLayer = useCallback((layer: string) => {
    setExpandedLayers((prev) => ({ ...prev, [layer]: !prev[layer] }));
  }, []);

  // Initialize Map (run only once)
  useEffect(() => {
    if (!mapContainer.current) return;

    const MAPBOX_STYLE = window.matchMedia?.('(prefers-color-scheme: dark)').matches
      ? 'mapbox://styles/mapbox/dark-v10'
      : 'mapbox://styles/mapbox/streets-v12';

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: MAPBOX_STYLE,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      bearing: 0,
      antialias: true,
      interactive: true,
    });

    draw.current = new MapboxDraw({
      displayControlsDefault: false,
      controls: { line_string: true, polygon: true, trash: true },
    });

    map.current.addControl(draw.current);

    map.current.on('load', () => {
      setMapLoaded(true);
    });

    return () => {
      map.current?.remove();
    };
  }, []); // Empty dependency array to run only once

  // Attach event listeners
  useEffect(() => {
    if (!map.current) return;

    map.current.on('draw.create', handleDrawCreate);
    map.current.on('draw.update', handleDrawUpdate);
    map.current.on('click', handleMapClick);
    map.current.on('mousedown', handleFurnitureMouseDown);

    map.current.on('mousedown', (e) => {
      if (mode === 'edit_furniture') {
        map.current?.dragPan.disable();
      }
    });
    map.current.on('mouseup', () => {
      map.current?.dragPan.enable();
    });

    return () => {
      map.current?.off('draw.create', handleDrawCreate);
        map.current?.off('draw.update', handleDrawUpdate);
      map.current?.off('click', handleMapClick);
      map.current?.off('mousedown', handleFurnitureMouseDown);
      map.current?.off('mouseup', () => map.current?.dragPan.enable());
    };
  }, [handleDrawCreate, handleDrawUpdate, handleMapClick, handleFurnitureMouseDown, mode]);

  // Initialize map layers
  const initializeMapLayers = useCallback(() => {
    if (!map.current) return;

    const safeAddSource = (id: string, data: GeoJSON.FeatureCollection) => {
      if (!map.current!.getSource(id)) {
        map.current!.addSource(id, {
          type: 'geojson',
          data,
        });
      }
    };

    const safeAddLayer = (layerId: string, layerConfig: mapboxgl.Layer) => {
      if (!map.current!.getLayer(layerId)) {
        map.current!.addLayer(layerConfig);
      }
    };

    // Walls
    safeAddSource('walls', wallFeatures);
    safeAddLayer('walls', {
      id: 'walls',
      type: 'fill-extrusion',
      source: 'walls',
      filter: ['==', ['get', 'type'], 'wall'],
      paint: {
        'fill-extrusion-color': '#fffce0',
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 0.9,
      },
    });

    // Rooms
    safeAddSource('rooms', roomFeatures);
    safeAddLayer('rooms', {
      id: 'rooms',
      type: 'fill',
      source: 'rooms',
      filter: ['==', ['get', 'type'], 'room'],
      paint: {
        'fill-color': ['get', 'color'],
        'fill-opacity': 0.5,
      },
    });

    safeAddLayer('room-labels', {
      id: 'room-labels',
      type: 'symbol',
      source: 'rooms',
      layout: {
        'text-field': ['get', 'name'],
        'text-size': 16,
        'text-anchor': 'center',
      },
      paint: {
        'text-color': '#000',
        'text-halo-color': '#fff',
        'text-halo-width': 1,
      },
    });

    // Furniture
    safeAddSource('furniture', furnitureFeatures);
    safeAddLayer('furniture', {
      id: 'furniture',
      type: 'fill-extrusion',
      source: 'furniture',
      filter: ['==', ['get', 'type'], 'furniture'],
      paint: {
        'fill-extrusion-color': '#fffce8',
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 0.9,
      },
      metadata: { interactive: true },
    });

    safeAddLayer('doors', {
      id: 'doors',
      type: 'fill-extrusion',
      source: 'furniture',
      filter: ['==', ['get', 'type'], 'door'],
      paint: {
        'fill-extrusion-color': '#4a4a4a',
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 0.9,
      },
      metadata: { interactive: true },
    });

    safeAddLayer('furniture-selected', {
      id: 'furniture-selected',
      type: 'line',
      source: 'furniture',
      paint: {
        'line-color': '#00ff00',
        'line-width': 5,
        'line-opacity': ['case', ['==', ['get', 'id'], selectedFurniture?.id || ''], 1, 0],
      },
    });
  }, [wallFeatures, roomFeatures, furnitureFeatures, selectedFurniture]);


  // Handle furniture resize and rotate markers
  useEffect(() => {
    if (!map.current || !selectedFurniture || mode !== 'edit_furniture') {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      return;
    }

    createFurnitureMarkers(map.current, selectedFurniture, updateFurnitureTransform);

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
    };
  }, [selectedFurniture, mode, updateFurnitureTransform, createFurnitureMarkers]);

    // Update sources
    useEffect(() => {
    if (map.current && map.current.getSource('walls') && map.current.isStyleLoaded()) {
        // Validate wallFeatures
        if (wallFeatures.type === 'FeatureCollection' && Array.isArray(wallFeatures.features)) {
        (map.current.getSource('walls') as mapboxgl.GeoJSONSource).setData(wallFeatures);
        } else {
        console.warn('Invalid wallFeatures data:', wallFeatures);
        }
    }
    }, [wallFeatures]);

    useEffect(() => {
    if (map.current && map.current.getSource('rooms') && map.current.isStyleLoaded()) {
        if (roomFeatures.type === 'FeatureCollection' && Array.isArray(roomFeatures.features)) {
        (map.current.getSource('rooms') as mapboxgl.GeoJSONSource).setData(roomFeatures);
        } else {
        console.warn('Invalid roomFeatures data:', roomFeatures);
        }
    }
    }, [roomFeatures]);

    useEffect(() => {
    if (map.current && map.current.getSource('furniture') && map.current.isStyleLoaded()) {
        if (furnitureFeatures.type === 'FeatureCollection' && Array.isArray(furnitureFeatures.features)) {
        (map.current.getSource('furniture') as mapboxgl.GeoJSONSource).setData(furnitureFeatures);
        } else {
        console.warn('Invalid furnitureFeatures data:', furnitureFeatures);
        }
    }
    }, [furnitureFeatures]);

  // Handle drag and drop
  useEffect(() => {
    const container = mapContainer.current;
    if (!container) return;

    container.addEventListener('drop', handleDrop);
    container.addEventListener('dragover', (e) => e.preventDefault());

    return () => {
      container.removeEventListener('drop', handleDrop);
      container.removeEventListener('dragover', (e) => e.preventDefault());
    };
  }, [handleDrop]);

  // Fetch rooms from Supabase on mount
  useEffect(() => {
    const fetchRooms = async () => {
      const { data, error } = await supabase.from('rooms').select('*');
      if (error) {
        console.error('Error fetching rooms:', error);
        return;
      }
      if (data) {
        setRoomFeatures({
          type: 'FeatureCollection',
          features: data.map((row) => ({
            type: 'Feature',
            id: row.id,
            geometry: row.geometry,
            properties: {
              type: 'room',
              name: row.title,
              color: row.color || '#ff0000',
              bookable: row.bookable,
              capacity: row.seats,
              avEquipment: row.avEquipment || [],
              purpose: row.description,
              icon: row.icon || '🏢',
            },
          })),
        });
      }
    };
    const fetchWalls = async () => {
      const { data, error } = await supabase.from('features').select('*');
      if (error) {
        console.error('Error fetching walls:', error);
        return;
      }
      if (data) {
        setWallFeatures({
          type: 'FeatureCollection',
          features: data.map((row) => ({
            type: 'Feature',
            id: row.id,
            geometry: row.geometry,
            properties: {
              type: 'wall',
              width: row.width || DEFAULT_WALL_WIDTH,
              height: WALL_HEIGHT,
            },
          })),
        });
      }
    };
    fetchRooms();
    fetchWalls();
    
  }, [mapLoaded],);

  useEffect(() => {
    if (mapLoaded) {
      initializeMapLayers();
    }
  }, [mapLoaded, wallFeatures, roomFeatures, furnitureFeatures]);


  // Render
  return (
    <ErrorBoundary>
      <div className="flex flex-col h-screen bg-gray-100 dark:bg-gray-700">
        <div className="flex flex-1 overflow-hidden">
          <div className="w-64 bg-white dark:bg-gray-900 shadow-md p-4 overflow-y-auto">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Layers</h2>
            <div className="mb-2">
              <div
                className="flex items-center justify-between p-2 bg-gray-100 dark:bg-gray-700 rounded cursor-pointer"
                onClick={() => toggleLayer('walls')}
              >
                <span className="text-sm font-medium">Walls</span>
                <span>{expandedLayers.walls ? '▼' : '▶'}</span>
              </div>
              {expandedLayers.walls && (
                <div className="ml-4">
                  {wallFeatures.features.map((feature) => (
                    <div
                      key={feature.id}
                      className={`p-2 text-sm cursor-pointer hover:bg-gray-200 rounded ${
                        selectedFeature?.id === feature.id ? 'bg-blue-100' : ''
                      }`}
                      onClick={() => handleLayerSelect(feature)}
                    >
                      Wall {wallFeatures.features.indexOf(feature) + 1}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="mb-2">
              <div
                className="flex items-center justify-between p-2 bg-gray-100 dark:bg-gray-700 rounded cursor-pointer"
                onClick={() => toggleLayer('rooms')}
              >
                <span className="text-sm font-medium">Rooms</span>
                <span>{expandedLayers.rooms ? '▼' : '▶'}</span>
              </div>
              {expandedLayers.rooms && (
                <div className="ml-4">
                  {roomFeatures.features.length === 0 ? (
                    <div className="p-2 text-sm text-gray-500">No rooms created</div>
                  ) : (
                    roomFeatures.features.map((feature) => (
                      <div
                        key={feature.id}
                        className={`p-2 text-sm cursor-pointer hover:bg-gray-200 rounded ${
                          selectedFeature?.id === feature.id ? 'bg-blue-100' : ''
                        }`}
                        onClick={() => handleLayerSelect(feature)}
                      >
                        {feature.properties?.name || `Room ${roomFeatures.features.indexOf(feature) + 1}`}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            <div>
              <div
                className="flex items-center justify-between p-2 bg-gray-100 dark:bg-gray-700 rounded cursor-pointer"
                onClick={() => toggleLayer('furniture')}
              >
                <span className="text-sm font-medium">Furniture</span>
                <span>{expandedLayers.furniture ? '▼' : '▶'}</span>
              </div>
              {expandedLayers.furniture && (
                <div className="ml-4">
                  {furnitureFeatures.features.map((feature) => (
                    <div
                      key={feature.id}
                      className={`p-2 text-sm cursor-pointer hover:bg-gray-200 rounded ${
                        selectedFurniture?.id === feature.id ? 'bg-blue-100' : ''
                      }`}
                      onClick={() => handleLayerSelect(feature)}
                    >
                      {feature.properties?.emoji} {feature.properties?.item}{' '}
                      {furnitureFeatures.features.indexOf(feature) + 1}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <a href="/" className='absolute bottom-4 px-8 py-4 hover:bg-gray-50 rounded-lg dark:hover:bg-gray-800'>← Back to dashboard</a>
          </div>

          <div className="flex-1">
            <div ref={mapContainer} className="w-full h-full" />
          </div>

          <div className="w-64 bg-white dark:bg-gray-900 shadow-md p-4 overflow-y-auto">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Properties</h2>
            {selectedFeature && selectedFeature.properties?.type === 'room' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    type="text"
                    value={selectedFeature.properties.name || ''}
                    onChange={(e) => updateRoomProperties({ name: e.target.value })}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
                  <input
                    type="color"
                    value={selectedFeature.properties.color || '#ff0000'}
                    onChange={(e) => updateRoomProperties({ color: e.target.value })}
                    className="w-full h-10 border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <input
                      type="checkbox"
                      checked={false}
                      onChange={(e) => updateRoomProperties({ bookable: e.target.checked })}
                      className="h-4 w-4 text-blue-500"
                    />
                    Bookable
                  </label>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Capacity</label>
                  <input
                    type="number"
                    value={selectedFeature.properties.capacity || 0}
                    onChange={(e) => updateRoomProperties({ capacity: Number(e.target.value) })}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Purpose</label>
                  <input
                    type="text"
                    value={selectedFeature.properties.purpose || ''}
                    onChange={(e) => updateRoomProperties({ purpose: e.target.value })}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                {/* Icon */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Icon</label>
                  <input
                    type="text"
                    value={selectedFeature.properties.icon || ''}
                    onChange={(e) => updateRoomProperties({ icon: e.target.value })}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                {/* Delete */}
                <button
                  onClick={async () => {
                    setRoomFeatures((prev) => ({
                      ...prev,
                      features: prev.features.filter((f) => f.id !== selectedFeatureId),
                    }));
                    setSelectedFeatureId(null);
                    const { error } = await supabase
                        .from('rooms')
                        .delete()
                        .eq('id', selectedFeatureId);
                    if (error) {
                      console.error('Error deleting room:', error);
                    }
                  }}
                  className="mt-5 mb-8 w-full bg-red-600 text-white p-2 rounded-md hover:bg-red-700 transition font-medium">
                    Delete Room
                </button>
              </div>
            )}
            {selectedFurniture && mode === 'edit_furniture' && (
              <div className="space-y-4">
                <h3 className="text-md font-semibold text-gray-800">
                  {selectedFurniture.properties.item} Properties
                </h3>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rotation (degrees)</label>
                  <input
                    type="number"
                    value={selectedFurniture.properties.orientation || 0}
                    onChange={(e) => updateFurnitureTransform({ orientation: Number(e.target.value) })}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Scale X</label>
                  <input
                    type="number"
                    value={selectedFurniture.properties.scaleX || 1}
                    step="0.1"
                    min="0.1"
                    onChange={(e) => updateFurnitureTransform({ scaleX: Number(e.target.value) })}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Scale Y</label>
                  <input
                    type="number"
                    value={selectedFurniture.properties.scaleY || 1}
                    step="0.1"
                    min="0.1"
                    onChange={(e) => updateFurnitureTransform({ scaleY: Number(e.target.value) })}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}
            {!selectedFeature && !selectedFurniture && (
              <p className="text-sm text-gray-500">Select a layer to edit its properties.</p>
            )}
            <button
              onClick={handleExportGeoJSON}
              className="mt-4 w-full bg-blue-600 text-white p-2 rounded-md hover:bg-blue-700 transition font-medium"
            >
              Export GeoJSON Files
            </button>
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-700 shadow-lg p-4 flex items-center gap-4 overflow-x-auto w-fit rounded-lg mx-auto mb-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Mode:</label>
            <select
              value={mode}
              onChange={(e) => {
                const newMode = e.target.value as EditorMode;
                setMode(newMode);
                draw.current?.changeMode(
                  (
                    newMode === 'draw_wall'
                      ? 'draw_line_string'
                      : newMode === 'draw_room'
                      ? 'draw_polygon'
                      : 'simple_select'
                  ) as any
                );
                if (newMode !== 'edit_furniture') setSelectedFurniture(null);
              }}
              className="p-2 border border-gray-300 dark:bg-gray-700 rounded-md focus:ring-2 focus:ring-blue-500"
            >
              <option value="draw_wall">Draw Wall</option>
              <option value="draw_room">Draw Room</option>
              <option value="place_furniture">Place Furniture/Door</option>
              <option value="edit_furniture">Edit Furniture</option>
            </select>
          </div>
          {mode === 'draw_wall' && (
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Wall Width (m):</label>
              <input
                type="number"
                value={wallWidth}
                onChange={(e) => setWallWidth(Number(e.target.value))}
                step="0.1"
                min="0.1"
                className="w-20 p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
          {mode === 'place_furniture' && (
            <div className="flex items-center gap-3">
              {furnitureLibrary.map((item) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/json', JSON.stringify(item));
                  }}
                  className="flex items-center gap-2 p-2 bg-gray-100 border border-gray-200 rounded-md cursor-move hover:bg-gray-200 transition"
                >
                  <span className="text-lg">{item.icon}</span>
                  <span className="text-sm">{item.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default React.memo(Editor);