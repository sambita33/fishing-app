// Point-in-polygon algorithm (Ray casting method)
function pointInPolygon(point, polygon) {
  const x = point[0];
  const y = point[1];
  let inside = false;
  
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    
    const intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    
    if (intersect) inside = !inside;
  }
  
  return inside;
}

// Indian Border Coordinates - Adjusted for 1 min outside
export const indianBorderCoordinates = [
  [9.959844, 79.826441], [9.800999, 79.563088], [9.904257, 79.718950],
  [9.589087, 79.407226], [9.1, 79.32], [9.0, 79.31],
  [8.88, 79.29], [8.67, 79.18], [8.62, 79.13],
  [8.53, 79.04], [8.37, 78.92], [8.2, 78.92],
  [7.58, 78.75], [7.35, 78.64], [7.21, 78.38],
  [6.52, 78.12], [5.89, 77.85], [5.0, 77.18],
  [8.0, 73.0], [20.0, 68.0], [22.0, 68.0],
  [23.98, 68.48], [21.79, 89.09], [21.19, 88.58],
  [20.44, 89.02], [20.12, 89.06], [11.43, 83.37],
  [11.16, 82.41], [11.27, 81.93], [11.05, 81.93],
  [10.69, 81.04], [10.55, 80.77], [10.08, 80.09],
  [10.05, 80.05], [10.05, 80.03]
];

// Restricted Areas - Adjusted for 4 mins restricted
export const restrictedAreas = [
  [
    [9.40, 78.50], [9.30, 79.00], [8.80, 79.80],
    [8.50, 80.30], [8.00, 79.60], [8.10, 78.90],
    [8.50, 78.50], [9.00, 78.00]
  ],
];

// Check if point is outside Indian border
export function isPointOutsideBorder(lat, lng) {
  return !pointInPolygon([lat, lng], indianBorderCoordinates);
}

// Check if point is in restricted zone
export function isPointInRestrictedZone(lat, lng) {
  for (const area of restrictedAreas) {
    if (pointInPolygon([lat, lng], area)) {
      return true;
    }
  }
  return false;
}

// Parse location data into coordinates with timestamps
export function parseLocationData(locationData) {
  if (!locationData) return [];
  
  try {
    const points = locationData.split(';');
    return points.map(point => {
      const [lat, lng, timestamp] = point.split(',');
      return {
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        timestamp: timestamp
      };
    }).filter(point => !isNaN(point.lat) && !isNaN(point.lng));
  } catch (error) {
    console.error('Error parsing location data:', error);
    return [];
  }
}

// Calculate distance between two points (Haversine formula)
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Interpolate points along the path between two GPS points
function interpolatePath(start, end, intervalMeters = 100) {
  const points = [];
  const totalDistance = calculateDistance(start.lat, start.lng, end.lat, end.lng);
  const steps = Math.max(1, Math.floor(totalDistance / intervalMeters));
  
  for (let i = 0; i <= steps; i++) {
    const ratio = i / steps;
    const lat = start.lat + (end.lat - start.lat) * ratio;
    const lng = start.lng + (end.lng - start.lng) * ratio;
    points.push({ lat, lng });
  }
  
  return points;
}

// UPDATED: Calculate time with decimal values
export function calculateViolationTimes(locationData) {
  const points = parseLocationData(locationData);
  
  if (points.length < 2) {
    return { outsideBorderTime: 0, restrictedZoneTime: 0, totalPoints: points.length };
  }

  let outsideBorderTime = 0;
  let restrictedZoneTime = 0;

  // Sort points by timestamp to ensure correct order
  const sortedPoints = [...points].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  for (let i = 0; i < sortedPoints.length - 1; i++) {
    const currentPoint = sortedPoints[i];
    const nextPoint = sortedPoints[i + 1];
    
    // Calculate time difference between points (in seconds)
    const currentTime = new Date(currentPoint.timestamp);
    const nextTime = new Date(nextPoint.timestamp);
    const totalTimeDiff = (nextTime - currentTime) / 1000; // Convert to seconds

    // Interpolate points along the path (every ~100 meters)
    const interpolatedPoints = interpolatePath(currentPoint, nextPoint, 100);

    // Check each interpolated point for violations
    let outsideCount = 0;
    let restrictedCount = 0;

    interpolatedPoints.forEach(point => {
      if (isPointOutsideBorder(point.lat, point.lng)) {
        outsideCount++;
      }
      if (isPointInRestrictedZone(point.lat, point.lng)) {
        restrictedCount++;
      }
    });

    // Calculate violation times based on proportion of points in each violation
    if (outsideCount > 0) {
      outsideBorderTime += (outsideCount / interpolatedPoints.length) * totalTimeDiff;
    }
    if (restrictedCount > 0) {
      restrictedZoneTime += (restrictedCount / interpolatedPoints.length) * totalTimeDiff;
    }
  }

  // Convert to minutes for display - KEEP DECIMALS
  return {
    outsideBorderTime: Math.round((outsideBorderTime / 60) * 10) / 10, // 1 decimal place
    restrictedZoneTime: Math.round((restrictedZoneTime / 60) * 10) / 10, // 1 decimal place
    totalPoints: points.length
  };
}

// Calculate total violations across all sessions for a fisherman
export function calculateTotalViolations(sessions) {
  let totalOutsideTime = 0;
  let totalRestrictedTime = 0;

  sessions.forEach(session => {
    const violations = calculateViolationTimes(session.location_data);
    totalOutsideTime += violations.outsideBorderTime;
    totalRestrictedTime += violations.restrictedZoneTime;
  });

  return {
    totalOutsideTime: Math.round(totalOutsideTime * 10) / 10, // 1 decimal
    totalRestrictedTime: Math.round(totalRestrictedTime * 10) / 10, // 1 decimal
    sessionCount: sessions.length
  };
}
