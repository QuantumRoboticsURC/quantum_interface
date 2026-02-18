export interface ApiResponse {
  status: 'success' | 'error';
  message: string;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
  timestamp: string;
}