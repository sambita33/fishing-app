import React from 'react';
import { MapContainer, TileLayer, Polygon, Polyline, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { 
  indianBorderCoordinates, 
  restrictedAreas, 
  isPointOutsideBorder, 
  isPointInRestrictedZone,
  parseLocationData 
} from '../utils/geofencing';

// Fix for default markers in React Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// DEBUG FUNCTION
const getTime = (timestamp) => {
  if (!timestamp) return 'N/A';
  
  console.log('PROCESSING TIMESTAMP:', timestamp);
  
  // Direct string extraction
  const timePart = timestamp.split('T')[1]?.split('.')[0];
  if (!timePart) return 'N/A';
  
  const [hours, minutes] = timePart.split(':');
  const hourNum = parseInt(hours);
  const ampm = hourNum >= 12 ? 'pm' : 'am';
  const displayHour = hourNum % 12 || 12;
  
  const result = `${displayHour}:${minutes} ${ampm}`;
  console.log('CONVERTED TO:', result);
  
  return result;
};

const FishingMap = ({ sessionData, fishermanName, violationTimes }) => {
  const routePoints = parseLocationData(sessionData?.location_data);
  
  // DEBUG: Log everything
  console.log('=== FISHING MAP RENDER ===');
  console.log('All route points:', routePoints);
  console.log('First point timestamp:', routePoints[0]?.timestamp);
  console.log('First point converted time:', getTime(routePoints[0]?.timestamp));

  const mapCenter = routePoints.length > 0 
    ? [routePoints[0].lat, routePoints[0].lng]
    : [20.5937, 78.9629];

  return (
    <div className="fishing-map-container">
      <MapContainer
        center={mapCenter}
        zoom={7}
        style={{ height: '400px', width: '100%', borderRadius: '8px' }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        
        {/* Indian Border */}
        <Polygon
          positions={indianBorderCoordinates}
          pathOptions={{
            color: '#1e3c72',
            fillColor: '#e6f0ff',
            fillOpacity: 0.1,
            weight: 3
          }}
        >
          <Popup>Indian Maritime Border</Popup>
        </Polygon>
        
        {/* Restricted Areas */}
        {restrictedAreas.map((area, index) => (
          <Polygon
            key={index}
            positions={area}
            pathOptions={{
              color: '#d63031',
              fillColor: '#ff6b6b',
              fillOpacity: 0.2,
              weight: 2,
              dashArray: '5, 5'
            }}
          >
            <Popup>Restricted Fishing Zone {index + 1}</Popup>
          </Polygon>
        ))}
        
        {/* Session Route */}
        {routePoints.length > 0 && (
          <Polyline
            positions={routePoints.map(point => [point.lat, point.lng])}
            pathOptions={{
              color: '#4caf50',
              weight: 4,
              opacity: 0.8
            }}
          >
            <Popup>
              <div>
                <strong>{fishermanName}'s Fishing Route</strong>
                <br />
                Points: {routePoints.length}
                <br />
                {violationTimes && (
                  <>
                    Outside Border: {violationTimes.outsideBorderTime}min
                    <br />
                    In Restricted: {violationTimes.restrictedZoneTime}min
                  </>
                )}
              </div>
            </Popup>
          </Polyline>
        )}
        
        {/* Route Points with Real Violation Detection */}
        {routePoints.map((point, index) => {
          const isOutside = isPointOutsideBorder(point.lat, point.lng);
          const isRestricted = isPointInRestrictedZone(point.lat, point.lng);
          
          let markerColor = '#4caf50'; // Default green (inside border)
          if (isRestricted) {
            markerColor = '#ff6b6b'; // Red for restricted zones
          } else if (isOutside) {
            markerColor = '#e67e22'; // Orange for outside border
          }

          return (
            <Marker
              key={index}
              position={[point.lat, point.lng]}
              icon={L.divIcon({
                className: 'route-point-marker',
                html: `<div style="
                  width: 8px; 
                  height: 8px; 
                  border-radius: 50%; 
                  background: ${markerColor};
                  border: 2px solid white;
                  box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                "></div>`,
                iconSize: [12, 12],
                iconAnchor: [6, 6]
              })}
            >
              <Popup>
                <div>
                  <strong>Point {index + 1}</strong>
                  <br />
                  Lat: {point.lat.toFixed(6)}
                  <br />
                  Lng: {point.lng.toFixed(6)}
                  <br />
                  Recorded: {getTime(point.timestamp)}
                  <br />
                  Status: <span style={{ 
                    color: isRestricted ? '#d63031' : isOutside ? '#e67e22' : '#4caf50', 
                    fontWeight: 'bold' 
                  }}>
                    {isRestricted ? 'In Restricted Zone' : isOutside ? 'Outside Border' : 'Inside Border'}
                  </span>
                </div>
              </Popup>
            </Marker>
          );
        })}
        
        {/* Start and End Markers */}
        {routePoints.length > 0 && (
          <>
            <Marker position={[routePoints[0].lat, routePoints[0].lng]}>
              <Popup>
                <strong>Start Location</strong>
                <br />
                First GPS Recorded: {getTime(routePoints[0].timestamp)}
                <br />
                Coordinates: {routePoints[0].lat.toFixed(6)}, {routePoints[0].lng.toFixed(6)}
              </Popup>
            </Marker>
            
            {routePoints.length > 1 && (
              <Marker position={[routePoints[routePoints.length - 1].lat, routePoints[routePoints.length - 1].lng]}>
                <Popup>
                  <strong>End Location</strong>
                  <br />
                  Last GPS Recorded: {getTime(routePoints[routePoints.length - 1].timestamp)}
                  <br />
                  Coordinates: {routePoints[routePoints.length - 1].lat.toFixed(6)}, {routePoints[routePoints.length - 1].lng.toFixed(6)}
                </Popup>
              </Marker>
            )}
          </>
        )}
      </MapContainer>

      {/* Map Legend */}
      <div className="map-legend">
        <h4>Map Legend</h4>
        <div className="legend-items">
          <div className="legend-item">
            <div className="legend-color" style={{ backgroundColor: '#1e3c72' }}></div>
            <span>Indian Maritime Border</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ backgroundColor: '#d63031' }}></div>
            <span>Restricted Zones (for Tamil Nadu)</span>
          </div>
          <div className="legend-item">
            <div className="legend-point" style={{ backgroundColor: '#4caf50' }}></div>
            <span>Inside Border</span>
          </div>
          <div className="legend-item">
            <div className="legend-point" style={{ backgroundColor: '#e67e22' }}></div>
            <span>Outside Border</span>
          </div>
          <div className="legend-item">
            <div className="legend-point" style={{ backgroundColor: '#ff6b6b' }}></div>
            <span>Restricted Area</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FishingMap;
