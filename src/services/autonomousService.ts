import { ApiResponse } from '../types/autonomous';

const API_BASE_URL = 'http://localhost:8000/api/autonomous';

export const autonomousService = {
  async setInitState(state: number): Promise<ApiResponse> {
    const response = await fetch(`${API_BASE_URL}/init_state/${state}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  },

  async setInputTarget(latitude: number, longitude: number): Promise<ApiResponse> {
    const targets = [latitude, longitude];
    
    const response = await fetch(`${API_BASE_URL}/input_target/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(targets),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  },
};