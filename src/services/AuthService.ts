import axios from 'axios';

export interface AuthResponse {
  success: boolean;
  userId?: string;
  roomId?: string;
  message?: string;
}

export class AuthService {
  private baseURL: string;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  // Заглушка для auth
  async checkAccess(token: string, roomId: string): Promise<AuthResponse> {
      if (!token || !roomId) {
      return {
        success: false,
        message: 'Token and roomId required',
      };
    }

    const userId = `user_${token}`;

    return {
      success: true,
      userId,
      roomId,
    };
  }
}
