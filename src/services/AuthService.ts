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

  async checkAccess(token: string, roomId: string): Promise<AuthResponse> {
    try {
      const response = await axios.post(`${this.baseURL}/auth/check`, {
        token,
        roomId,
      }, {
        timeout: 5000,
      });

      return response.data;
    } catch (error) {
      console.error('Auth check failed:', error);
      return {
        success: false,
        message: 'Authentication failed',
      };
    }
  }

  createMockService(): void {
    console.log('⚠ Using mock AuthService for development');
  }
}

export class MockAuthService extends AuthService {
  constructor() {
    super('http://localhost:3002');
  }

  async checkAccess(token: string, roomId: string): Promise<AuthResponse> {
    console.log(`Mock auth check: token=${token}, roomId=${roomId}`);

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
